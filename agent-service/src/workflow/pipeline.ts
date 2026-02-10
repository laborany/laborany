/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Pipeline 执行器                                     ║
 * ║                                                                        ║
 * ║  职责：动态组合多 Skill 执行，复用 executor 的 executeStep 模式          ║
 * ║  设计：数据自动传递，每步输出作为下步输入                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { v4 as uuid } from 'uuid'
import { loadSkill } from 'laborany-shared'
import { executeAgent, type AgentEvent } from '../agent-executor.js'
import { createContext, addStepResult, buildStepPrompt } from './context.js'
import type { WorkflowContext, StepResult } from './types.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export interface PipelineStep {
  skillId: string
  prompt: string
  name?: string
}

export interface PipelineContext {
  input: Record<string, unknown>
  runId?: string
  signal?: AbortSignal
  onEvent?: (event: PipelineEvent) => void
}

export type PipelineEvent =
  | { type: 'pipeline_start'; totalSteps: number }
  | { type: 'step_start'; stepIndex: number; skillId: string }
  | { type: 'step_progress'; stepIndex: number; content: string }
  | { type: 'step_done'; stepIndex: number; output: string }
  | { type: 'step_error'; stepIndex: number; error: string }
  | { type: 'pipeline_done'; context: WorkflowContext }
  | { type: 'pipeline_error'; error: string }

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     执行 Pipeline                                        │
 * │                                                                          │
 * │  顺序执行步骤列表，自动传递上下文                                        │
 * │  复用 workflow/context 的模板渲染和上下文管理                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export async function executePipeline(
  steps: PipelineStep[],
  ctx: PipelineContext,
): Promise<WorkflowContext> {
  const runId = ctx.runId || uuid()
  const signal = ctx.signal || new AbortController().signal
  const emit = ctx.onEvent || (() => {})

  let wfCtx = createContext(ctx.input)
  emit({ type: 'pipeline_start', totalSteps: steps.length })

  for (let i = 0; i < steps.length; i++) {
    if (signal.aborted) break

    const step = steps[i]
    emit({ type: 'step_start', stepIndex: i, skillId: step.skillId })

    const result = await runStep(step, wfCtx, i, steps.length, runId, signal, emit)
    wfCtx = addStepResult(wfCtx, result)

    if (result.status === 'failed') {
      emit({ type: 'step_error', stepIndex: i, error: result.error || '未知错误' })
    } else {
      emit({ type: 'step_done', stepIndex: i, output: result.output })
    }
  }

  emit({ type: 'pipeline_done', context: wfCtx })
  return wfCtx
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     执行单个步骤                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */

async function runStep(
  step: PipelineStep,
  wfCtx: WorkflowContext,
  index: number,
  total: number,
  runId: string,
  signal: AbortSignal,
  emit: (e: PipelineEvent) => void,
): Promise<StepResult> {
  const startedAt = new Date().toISOString()
  const sessionId = `${runId}-pipe-${index}`

  try {
    const skill = await loadSkill.byId(step.skillId)
    if (!skill) throw new Error(`Skill "${step.skillId}" 不存在`)

    const prompt = buildStepPrompt(step.prompt, wfCtx, index, total)
    let output = ''

    await executeAgent({
      skill,
      query: prompt,
      sessionId,
      signal,
      onEvent: (event: AgentEvent) => {
        if (event.type === 'text' && event.content) {
          output += event.content
          emit({ type: 'step_progress', stepIndex: index, content: event.content })
        }
      },
    })

    return { stepIndex: index, skillId: step.skillId, sessionId, status: 'completed', output, files: [], startedAt, completedAt: new Date().toISOString() }
  } catch (error) {
    const msg = error instanceof Error ? error.message : '未知错误'
    return { stepIndex: index, skillId: step.skillId, sessionId, status: 'failed', output: '', error: msg, files: [], startedAt, completedAt: new Date().toISOString() }
  }
}
