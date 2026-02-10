import { readdir, rename, stat } from 'fs/promises'
import type { Skill } from 'laborany-shared'
import {
  loadSkill,
  generateCapabilityId,
  normalizeCapabilityDisplayName,
  pickUniqueCapabilityId,
} from 'laborany-shared'
import { loadWorkflow } from '../workflow/index.js'
import { dbHelper } from '../database.js'
import { executeAgent, type AgentEvent } from './executor.js'
import { sessionManager } from './session-manager.js'
import { join } from 'path'
import { existsSync } from 'fs'

type RuntimeTaskStatus = 'running' | 'completed' | 'failed' | 'aborted'

export type RuntimeEvent =
  | AgentEvent
  | { type: 'session'; sessionId: string }
  | { type: 'aborted' }
  | {
      type: 'created_capability'
      capabilityType: 'skill' | 'workflow'
      capabilityId: string
      primary: {
        type: 'skill' | 'workflow'
        id: string
      }
      artifacts: Array<{
        type: 'skill' | 'workflow'
        id: string
      }>
      originQuery?: string
    }

interface CapabilityRef {
  type: 'skill' | 'workflow'
  id: string
}

interface RuntimeTask {
  sessionId: string
  skillId: string
  skillName: string
  status: RuntimeTaskStatus
  startedAt: number
  completedAt?: number
  lastEventAt?: string
  stopRequested: boolean
  hasError: boolean
  assistantContent: string
  controller: AbortController
  events: RuntimeEvent[]
  subscribers: Set<(event: RuntimeEvent) => void | Promise<void>>
  donePromise: Promise<void>
  resolveDone: () => void
}

interface StartTaskOptions {
  sessionId: string
  skillId: string
  skill: Skill
  query: string
  originQuery?: string
  beforeSkillIds?: Set<string>
  beforeWorkflowIds?: Set<string>
}

interface SubscribeOptions {
  replay?: boolean
  includeSession?: boolean
}

class RuntimeTaskManager {
  private tasks = new Map<string, RuntimeTask>()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }

  startTask(options: StartTaskOptions): RuntimeTask {
    const existing = this.tasks.get(options.sessionId)
    if (existing && existing.status === 'running') {
      return existing
    }

    let resolveDone = () => {}
    const donePromise = new Promise<void>((resolve) => {
      resolveDone = resolve
    })

    const task: RuntimeTask = {
      sessionId: options.sessionId,
      skillId: options.skillId,
      skillName: options.skill.meta.name || options.skillId,
      status: 'running',
      startedAt: Date.now(),
      stopRequested: false,
      hasError: false,
      assistantContent: '',
      controller: new AbortController(),
      events: [],
      subscribers: new Set(),
      donePromise,
      resolveDone,
    }

    this.tasks.set(task.sessionId, task)
    this.runTask(task, options)
    return task
  }

  subscribe(
    sessionId: string,
    onEvent: (event: RuntimeEvent) => void | Promise<void>,
    options: SubscribeOptions = {},
  ): () => void {
    const task = this.tasks.get(sessionId)
    if (!task) {
      return () => {}
    }

    const shouldReplay = options.replay !== false
    const includeSession = options.includeSession !== false

    if (includeSession) {
      this.safeCallSubscriber(onEvent, { type: 'session', sessionId })
    }

    if (shouldReplay) {
      for (const event of task.events) {
        this.safeCallSubscriber(onEvent, event)
      }
    }

    if (task.status !== 'running') {
      return () => {}
    }

    task.subscribers.add(onEvent)
    return () => {
      task.subscribers.delete(onEvent)
    }
  }

  async waitForCompletion(sessionId: string): Promise<void> {
    const task = this.tasks.get(sessionId)
    if (!task) {
      return
    }
    await task.donePromise
  }

  stop(sessionId: string): boolean {
    const task = this.tasks.get(sessionId)
    if (!task || task.status !== 'running') {
      return false
    }

    task.stopRequested = true
    const stoppedBySessionManager = sessionManager.abort(sessionId)
    if (!stoppedBySessionManager) {
      task.controller.abort()
    }
    return true
  }

  getStatus(sessionId: string): {
    sessionId: string
    skillId: string
    skillName: string
    status: RuntimeTaskStatus
    startedAt: string
    completedAt?: string
    lastEventAt?: string
    eventCount: number
    isRunning: boolean
  } | null {
    const task = this.tasks.get(sessionId)
    if (!task) {
      return null
    }

    return {
      sessionId: task.sessionId,
      skillId: task.skillId,
      skillName: task.skillName,
      status: task.status,
      startedAt: new Date(task.startedAt).toISOString(),
      completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : undefined,
      lastEventAt: task.lastEventAt,
      eventCount: task.events.length,
      isRunning: task.status === 'running',
    }
  }

  isRunning(sessionId: string): boolean {
    const task = this.tasks.get(sessionId)
    return task?.status === 'running'
  }

  getRunningTasks(): Array<{
    sessionId: string
    skillId: string
    skillName: string
    startedAt: string
  }> {
    const tasks: Array<{
      sessionId: string
      skillId: string
      skillName: string
      startedAt: string
    }> = []

    for (const task of this.tasks.values()) {
      if (task.status !== 'running') {
        continue
      }

      tasks.push({
        sessionId: task.sessionId,
        skillId: task.skillId,
        skillName: task.skillName,
        startedAt: new Date(task.startedAt).toISOString(),
      })
    }

    return tasks
  }

  has(sessionId: string): boolean {
    return this.tasks.has(sessionId)
  }

  cleanup(maxAgeMs = 30 * 60 * 1000): number {
    const now = Date.now()
    let cleaned = 0

    for (const [sessionId, task] of this.tasks.entries()) {
      if (task.status === 'running') {
        continue
      }

      const age = now - (task.completedAt || task.startedAt)
      if (age > maxAgeMs) {
        this.tasks.delete(sessionId)
        cleaned++
      }
    }

    return cleaned
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.tasks.clear()
  }

  private async runTask(task: RuntimeTask, options: StartTaskOptions): Promise<void> {
    sessionManager.register(task.sessionId, task.controller)

    try {
      await executeAgent({
        skill: options.skill,
        query: options.query,
        sessionId: task.sessionId,
        signal: task.controller.signal,
        onEvent: (event) => this.handleAgentEvent(task, event),
      })

      if (options.skillId === 'skill-creator' && options.beforeSkillIds && options.beforeWorkflowIds) {
        const createdArtifacts = await this.detectCreatedCapabilities(
          options.beforeSkillIds,
          options.beforeWorkflowIds,
        )

        if (createdArtifacts.primary) {
          this.emitEvent(task, {
            type: 'created_capability',
            capabilityType: createdArtifacts.primary.type,
            capabilityId: createdArtifacts.primary.id,
            primary: createdArtifacts.primary,
            artifacts: createdArtifacts.artifacts,
            originQuery: options.originQuery,
          })
        }
      }
    } catch (error) {
      task.hasError = true
      const message = error instanceof Error ? error.message : '执行失败'
      this.emitEvent(task, { type: 'error', content: message })
    } finally {
      sessionManager.unregister(task.sessionId)

      if (!task.events.some((event) => event.type === 'done')) {
        this.emitEvent(task, { type: 'done' })
      }

      if (task.assistantContent) {
        dbHelper.run(
          `INSERT INTO messages (session_id, type, content) VALUES (?, ?, ?)`,
          [task.sessionId, 'assistant', task.assistantContent],
        )
      }

      let finalStatus: RuntimeTaskStatus = 'completed'
      if (task.stopRequested) {
        finalStatus = 'aborted'
      } else if (task.hasError) {
        finalStatus = 'failed'
      }

      if (finalStatus === 'aborted') {
        this.emitEvent(task, { type: 'aborted' })
      }

      task.status = finalStatus
      task.completedAt = Date.now()

      dbHelper.run(
        `UPDATE sessions SET status = ? WHERE id = ?`,
        [finalStatus, task.sessionId],
      )

      task.resolveDone()
    }
  }

  private handleAgentEvent(task: RuntimeTask, event: AgentEvent): void {
    if (
      event.type === 'error' &&
      task.stopRequested &&
      (event.content || '').toLowerCase().includes('abort')
    ) {
      return
    }

    if (
      event.type === 'error' &&
      task.stopRequested &&
      (event.content || '').includes('中止')
    ) {
      return
    }

    if (event.type === 'text' && event.content) {
      task.assistantContent += event.content
    }

    if (event.type === 'tool_use') {
      dbHelper.run(
        `INSERT INTO messages (session_id, type, tool_name, tool_input) VALUES (?, ?, ?, ?)`,
        [
          task.sessionId,
          'tool_use',
          event.toolName || '',
          JSON.stringify(event.toolInput || {}),
        ],
      )
    }

    if (event.type === 'tool_result') {
      dbHelper.run(
        `INSERT INTO messages (session_id, type, tool_result) VALUES (?, ?, ?)`,
        [task.sessionId, 'tool_result', event.toolResult || ''],
      )
    }

    if (event.type === 'error') {
      task.hasError = true
    }

    this.emitEvent(task, event)
  }

  private emitEvent(task: RuntimeTask, event: RuntimeEvent): void {
    task.events.push(event)
    if (task.events.length > 4000) {
      task.events.shift()
    }
    task.lastEventAt = new Date().toISOString()

    for (const subscriber of task.subscribers) {
      this.safeCallSubscriber(subscriber, event, () => {
        task.subscribers.delete(subscriber)
      })
    }
  }

  private safeCallSubscriber(
    subscriber: (event: RuntimeEvent) => void | Promise<void>,
    event: RuntimeEvent,
    onError?: () => void,
  ): void {
    try {
      const maybePromise = subscriber(event)
      if (maybePromise instanceof Promise) {
        maybePromise.catch(() => {
          if (onError) onError()
        })
      }
    } catch {
      if (onError) onError()
    }
  }

  private async detectCreatedCapabilities(
    beforeSkillIds: Set<string>,
    beforeWorkflowIds: Set<string>,
  ): Promise<{ primary: CapabilityRef | null; artifacts: CapabilityRef[] }> {
    const createdWorkflows = await this.detectCreatedWorkflowIds(beforeWorkflowIds)
    const createdSkills = await this.detectCreatedSkillIds(beforeSkillIds)

    const workflowArtifacts: CapabilityRef[] = createdWorkflows.map((id) => ({
      type: 'workflow',
      id,
    }))
    const skillArtifacts: CapabilityRef[] = createdSkills.map((id) => ({
      type: 'skill',
      id,
    }))

    const artifacts = [...workflowArtifacts, ...skillArtifacts]
    const primary = artifacts[0] || null

    return { primary, artifacts }
  }

  private async detectCreatedSkillIds(beforeSkillIds: Set<string>): Promise<string[]> {
    try {
      const createdIds = await this.listNewDirectoryIds(
        loadSkill.getUserSkillsDir(),
        beforeSkillIds,
      )
      const normalized: string[] = []
      for (const skillId of createdIds) {
        normalized.push(await this.normalizeCreatedSkillId(skillId))
      }
      return normalized
    } catch {
      return []
    }
  }

  private async detectCreatedWorkflowIds(beforeWorkflowIds: Set<string>): Promise<string[]> {
    try {
      return this.listNewDirectoryIds(loadWorkflow.getWorkflowsDir(), beforeWorkflowIds)
    } catch {
      return []
    }
  }

  private async listNewDirectoryIds(
    baseDir: string,
    beforeIds: Set<string>,
  ): Promise<string[]> {
    const dirs = await readdir(baseDir, { withFileTypes: true })
    const candidates = dirs
      .filter((d) => d.isDirectory() && !beforeIds.has(d.name))
      .map((d) => d.name)

    if (candidates.length === 0) {
      return []
    }

    const withMtime = await Promise.all(
      candidates.map(async (id) => {
        try {
          const info = await stat(join(baseDir, id))
          return { id, mtimeMs: info.mtimeMs }
        } catch {
          return { id, mtimeMs: 0 }
        }
      }),
    )

    return withMtime
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .map((item) => item.id)
  }

  private async normalizeCreatedSkillId(skillId: string): Promise<string> {
    const skill = await loadSkill.byId(skillId)
    const normalizedName = normalizeCapabilityDisplayName(skill?.meta?.name || skillId)
    const expectedBaseId = generateCapabilityId(normalizedName, 'skill')

    if (expectedBaseId === skillId) {
      return skillId
    }

    try {
      const userSkillsDir = loadSkill.getUserSkillsDir()
      const fromPath = join(userSkillsDir, skillId)
      if (!existsSync(fromPath)) {
        return skillId
      }

      const dirs = await readdir(userSkillsDir, { withFileTypes: true })
      const allSkillIds = dirs.filter((d) => d.isDirectory()).map((d) => d.name)
      const newId = pickUniqueCapabilityId(expectedBaseId, allSkillIds)

      if (newId === skillId) {
        return skillId
      }

      const toPath = join(userSkillsDir, newId)
      if (existsSync(toPath)) {
        return skillId
      }

      await rename(fromPath, toPath)
      loadSkill.clearCache()
      return newId
    } catch {
      return skillId
    }
  }
}

export const runtimeTaskManager = new RuntimeTaskManager()
