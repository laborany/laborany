import { readdir, rename, stat } from 'fs/promises'
import type { Skill, CompositeStep } from 'laborany-shared'
import {
  loadSkill,
  generateCapabilityId,
  normalizeCapabilityDisplayName,
  pickUniqueCapabilityId,
} from 'laborany-shared'
import { dbHelper } from '../database.js'
import { executeAgent, ensureTaskDir, type AgentEvent } from './executor.js'
import { sessionManager } from './session-manager.js'
import { join } from 'path'
import { existsSync } from 'fs'

type RuntimeTaskStatus = 'running' | 'completed' | 'failed' | 'aborted'

export type RuntimeEvent =
  | AgentEvent
  | { type: 'session'; sessionId: string }
  | { type: 'aborted' }
  | {
      type: 'pipeline_start'
      totalSteps: number
      steps: Array<{ name: string; skillId: string }>
    }
  | {
      type: 'step_start'
      stepIndex: number
      stepName: string
      skillId: string
    }
  | {
      type: 'step_done'
      stepIndex: number
      result: {
        stepIndex: number
        stepName: string
        skillId: string
        status: 'completed' | 'failed'
        output: string
        files: string[]
        startedAt: string
        completedAt: string
      }
    }
  | {
      type: 'step_error'
      stepIndex: number
      error: string
    }
  | {
      type: 'pipeline_done'
      results: Array<{
        stepIndex: number
        stepName: string
        skillId: string
        status: 'completed' | 'failed'
        output: string
        files: string[]
        startedAt: string
        completedAt: string
      }>
    }
  | {
      type: 'created_capability'
      capabilityType: 'skill'
      capabilityId: string
      primary: {
        type: 'skill'
        id: string
      }
      artifacts: Array<{
        type: 'skill'
        id: string
      }>
      originQuery?: string
    }

interface CapabilityRef {
  type: 'skill'
  id: string
}

interface RuntimeTask {
  sessionId: string
  skillId: string
  skillName: string
  query: string
  workDir: string
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
}

interface CompositeStepResult {
  stepIndex: number
  stepName: string
  skillId: string
  status: 'completed' | 'failed'
  output: string
  files: string[]
  startedAt: string
  completedAt: string
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

    const workDir = ensureTaskDir(options.sessionId)

    const task: RuntimeTask = {
      sessionId: options.sessionId,
      skillId: options.skillId,
      skillName: options.skill.meta.name || options.skillId,
      query: options.query,
      workDir,
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
    this.ensureSessionRecord(task)
    this.runTask(task, options)
    return task
  }

  private ensureSessionRecord(task: RuntimeTask): void {
    dbHelper.run(
      `INSERT OR IGNORE INTO sessions (id, user_id, skill_id, query, status, work_dir) VALUES (?, ?, ?, ?, ?, ?)`,
      [task.sessionId, 'default', task.skillId, task.query, 'running', task.workDir],
    )

    const userMessageCount = dbHelper.get<{ count: number }>(
      `SELECT COUNT(1) as count FROM messages WHERE session_id = ? AND type = ?`,
      [task.sessionId, 'user'],
    )

    if ((userMessageCount?.count || 0) === 0) {
      dbHelper.run(
        `INSERT INTO messages (session_id, type, content) VALUES (?, ?, ?)`,
        [task.sessionId, 'user', task.query],
      )
    }
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
      if (options.skill.meta.kind === 'composite' && options.skill.steps?.length) {
        await this.runCompositeTask(task, options)
      } else {
        await executeAgent({
          skill: options.skill,
          query: options.query,
          sessionId: task.sessionId,
          signal: task.controller.signal,
          onEvent: (event) => this.handleAgentEvent(task, event),
        })
      }

      if (options.skillId === 'skill-creator' && options.beforeSkillIds) {
        const createdArtifacts = await this.detectCreatedCapabilities(
          options.beforeSkillIds,
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

  private async runCompositeTask(task: RuntimeTask, options: StartTaskOptions): Promise<void> {
    const steps = options.skill.steps || []
    const totalSteps = steps.length
    const sharedWorkDir = ensureTaskDir(task.sessionId)
    const results: CompositeStepResult[] = []
    let previousOutput = ''

    this.emitEvent(task, {
      type: 'pipeline_start',
      totalSteps,
      steps: steps.map(step => ({
        name: step.name,
        skillId: step.skill,
      })),
    })

    for (let index = 0; index < steps.length; index++) {
      if (task.controller.signal.aborted) {
        return
      }

      const step = steps[index]
      this.emitEvent(task, {
        type: 'step_start',
        stepIndex: index,
        stepName: step.name,
        skillId: step.skill,
      })

      const result = await this.executeCompositeStep(task, step, index, totalSteps, {
        baseQuery: options.query,
        previousOutput,
        workDir: sharedWorkDir,
      })

      results.push(result)

      if (result.status === 'completed') {
        previousOutput = result.output
        this.emitEvent(task, {
          type: 'step_done',
          stepIndex: index,
          result,
        })
      } else {
        this.emitEvent(task, {
          type: 'step_error',
          stepIndex: index,
          error: result.output || '步骤执行失败',
        })

        if (options.skill.onFailure !== 'continue') {
          task.hasError = true
          break
        }
      }
    }

    this.emitEvent(task, {
      type: 'pipeline_done',
      results,
    })
  }

  private async executeCompositeStep(
    task: RuntimeTask,
    step: CompositeStep,
    stepIndex: number,
    totalSteps: number,
    options: {
      baseQuery: string
      previousOutput: string
      workDir: string
    },
  ): Promise<CompositeStepResult> {
    const startedAt = new Date().toISOString()
    const stepSkill = await loadSkill.byId(step.skill)

    if (!stepSkill) {
      return {
        stepIndex,
        stepName: step.name,
        skillId: step.skill,
        status: 'failed',
        output: `步骤技能不存在: ${step.skill}`,
        files: [],
        startedAt,
        completedAt: new Date().toISOString(),
      }
    }

    const stepSessionId = `${task.sessionId}-step-${stepIndex + 1}`
    let output = ''
    let stepFailed = false
    const prompt = this.buildCompositePrompt(step, stepIndex, totalSteps, options.baseQuery, options.previousOutput)

    try {
      await executeAgent({
        skill: stepSkill,
        query: prompt,
        sessionId: stepSessionId,
        signal: task.controller.signal,
        workDir: options.workDir,
        onEvent: (event) => {
          if (event.type === 'text' && event.content) {
            output += event.content
          }
          if (event.type === 'error' && event.content) {
            stepFailed = true
          }
          this.handleAgentEvent(task, event)
        },
      })
    } catch (error) {
      stepFailed = true
      output = output || (error instanceof Error ? error.message : '步骤执行失败')
    }

    return {
      stepIndex,
      stepName: step.name,
      skillId: step.skill,
      status: stepFailed ? 'failed' : 'completed',
      output,
      files: [],
      startedAt,
      completedAt: new Date().toISOString(),
    }
  }

  private buildCompositePrompt(
    step: CompositeStep,
    stepIndex: number,
    totalSteps: number,
    baseQuery: string,
    previousOutput: string,
  ): string {
    const renderedTemplate = step.prompt.replace(/\{\{\s*prev\.output\s*\}\}/g, previousOutput)
    return [
      `你正在执行复合技能步骤 ${stepIndex + 1}/${totalSteps}。`,
      `当前步骤：${step.name}`,
      '',
      '[原始用户任务]',
      baseQuery,
      '',
      '[步骤指令]',
      renderedTemplate,
      '',
      '请只输出本步骤结果，保持可供下一步继续使用。',
    ].join('\n')
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
  ): Promise<{ primary: CapabilityRef | null; artifacts: CapabilityRef[] }> {
    const createdSkills = await this.detectCreatedSkillIds(beforeSkillIds)
    const skillArtifacts: CapabilityRef[] = createdSkills.map((id) => ({
      type: 'skill',
      id,
    }))

    const artifacts = [...skillArtifacts]
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
