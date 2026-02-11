/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Capabilities 统一路由                               ║
 * ║                                                                          ║
 * ║  职责：统一 skill 与 composite 的查询、详情、执行、删除                    ║
 * ║  设计：单步 skill 直接调用 agent-executor                                ║
 * ║        composite skill 按 steps 顺序编排，复用 pipeline context 模板引擎 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Router, Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import { rm } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { loadSkill, USER_SKILLS_DIR } from 'laborany-shared'
import type { Skill, CompositeStep } from 'laborany-shared'
import type { SessionManager } from '../session-manager.js'
import { executeAgent, type AgentEvent } from '../agent-executor.js'
import {
  createPipelineContext,
  addPipelineStepResult,
  buildPipelineStepPrompt,
} from '../pipeline/context.js'
import type { StepResult, PipelineContext } from '../pipeline/types.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     SSE 响应头设置                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function initSSE(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     安全写入 SSE 事件                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function sendSSE(res: Response, data: Record<string, unknown>): void {
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     执行单步 skill                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function runSingleSkill(
  skill: Skill, query: string,
  sessionId: string, signal: AbortSignal,
  res: Response,
): Promise<void> {
  await executeAgent({
    skill,
    query,
    sessionId,
    signal,
    onEvent: (event: AgentEvent) => sendSSE(res, event as unknown as Record<string, unknown>),
  })
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     执行 composite skill（多步编排）                     │
 * │                                                                          │
 * │  按 steps 顺序执行，每步加载对应 skill 的 SKILL.md 作为 system prompt   │
 * │  步骤间通过 {{prev.output}} 传递上下文                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function runComposite(
  skill: Skill, input: Record<string, unknown>,
  runId: string, signal: AbortSignal,
  res: Response,
): Promise<void> {
  const steps = skill.steps!
  const totalSteps = steps.length

  sendSSE(res, { type: 'pipeline_start', pipelineId: skill.meta.id, totalSteps })

  let context = createPipelineContext(input)

  for (let i = 0; i < steps.length; i++) {
    if (signal.aborted) {
      sendSSE(res, { type: 'pipeline_stopped' })
      return
    }

    const step = steps[i]
    sendSSE(res, { type: 'step_start', stepIndex: i, stepName: step.name, skillId: step.skill })

    try {
      const result = await executeCompositeStep(step, context, i, totalSteps, runId, signal, res)
      context = addPipelineStepResult(context, result)
      sendSSE(res, { type: 'step_done', stepIndex: i, result })
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误'
      sendSSE(res, { type: 'step_error', stepIndex: i, error: msg })

      if (skill.onFailure !== 'continue') {
        sendSSE(res, { type: 'pipeline_error', error: `步骤 ${i + 1} 失败: ${msg}` })
        return
      }
      context = addPipelineStepResult(context, buildFailedResult(i, step.skill))
    }
  }

  sendSSE(res, { type: 'pipeline_done', context })
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     执行 composite 的单个步骤                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function executeCompositeStep(
  step: CompositeStep, context: PipelineContext,
  stepIndex: number, totalSteps: number,
  runId: string, signal: AbortSignal,
  res: Response,
): Promise<StepResult> {
  const startedAt = new Date().toISOString()
  const stepSkill = await loadSkill.byId(step.skill)
  if (!stepSkill) throw new Error(`Skill "${step.skill}" 不存在`)

  const prompt = buildPipelineStepPrompt(step.prompt, context, stepIndex, totalSteps)
  const sessionId = `${runId}-step-${stepIndex}`
  let output = ''

  await executeAgent({
    skill: stepSkill,
    query: prompt,
    sessionId,
    signal,
    onEvent: (event: AgentEvent) => {
      if (event.type === 'text' && event.content) {
        output += event.content
        sendSSE(res, { type: 'step_progress', stepIndex, content: event.content })
      } else if (event.type === 'tool_use') {
        sendSSE(res, { type: 'step_tool', stepIndex, toolName: event.toolName, toolInput: event.toolInput })
      }
    },
  })

  return {
    stepIndex, skillId: step.skill, sessionId,
    status: 'completed', output, files: [],
    startedAt, completedAt: new Date().toISOString(),
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     构建失败步骤结果                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function buildFailedResult(stepIndex: number, skillId: string): StepResult {
  const now = new Date().toISOString()
  return {
    stepIndex, skillId, sessionId: '',
    status: 'failed', output: '', files: [],
    startedAt: now, completedAt: now,
  }
}

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     路由工厂函数                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */
export function createCapabilitiesRouter(sessionManager: SessionManager) {
  const router = Router()

  /* ── GET /capabilities ── 返回所有 capability 列表 ── */
  router.get('/capabilities', async (_req: Request, res: Response) => {
    try {
      const items = await loadSkill.listAll()
      res.json({ capabilities: items })
    } catch {
      res.status(500).json({ error: '无法加载 capabilities 列表' })
    }
  })

  /* ── GET /capabilities/:id ── 返回单个 capability 详情 ── */
  router.get('/capabilities/:id', async (req: Request, res: Response) => {
    const skill = await loadSkill.byId(req.params.id)
    if (!skill) {
      res.status(404).json({ error: 'Capability 不存在' })
      return
    }
    res.json(toCapabilityDetail(skill))
  })

  /* ── POST /capabilities/:id/execute ── 统一执行入口（SSE） ── */
  router.post('/capabilities/:id/execute', async (req: Request, res: Response) => {
    const skill = await loadSkill.byId(req.params.id)
    if (!skill) {
      res.status(404).json({ error: 'Capability 不存在' })
      return
    }

    initSSE(res)

    const runId = req.body.runId || uuid()
    const abortController = new AbortController()
    sessionManager.register(runId, abortController)

    sendSSE(res, { type: 'run', runId })

    try {
      if (skill.meta.kind === 'composite' && skill.steps?.length) {
        await runComposite(skill, req.body.input || {}, runId, abortController.signal, res)
      } else {
        await runSingleSkill(skill, req.body.query || '', runId, abortController.signal, res)
      }
      sendSSE(res, { type: 'done' })
    } catch (error) {
      const msg = error instanceof Error ? error.message : '执行失败'
      sendSSE(res, { type: 'error', message: msg })
    } finally {
      sessionManager.unregister(runId)
      res.end()
    }
  })

  /* ── POST /capabilities/stop/:runId ── 中止执行 ── */
  router.post('/capabilities/stop/:runId', (req: Request, res: Response) => {
    const stopped = sessionManager.abort(req.params.runId)
    res.json({ success: stopped })
  })

  /* ── DELETE /capabilities/:id ── 删除用户创建的 capability ── */
  router.delete('/capabilities/:id', async (req: Request, res: Response) => {
    const capPath = join(USER_SKILLS_DIR, req.params.id)
    if (!existsSync(capPath)) {
      res.status(404).json({ error: 'Capability 不存在' })
      return
    }
    await rm(capPath, { recursive: true, force: true })
    loadSkill.clearCache()
    res.json({ success: true })
  })

  return router
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     Skill → Capability 详情映射                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function toCapabilityDetail(skill: Skill) {
  return {
    ...skill.meta,
    systemPrompt: skill.systemPrompt,
    tools: skill.tools,
    steps: skill.steps,
    onFailure: skill.onFailure,
  }
}
