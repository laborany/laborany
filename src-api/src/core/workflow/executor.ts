/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流执行器                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { loadSkill } from '../agent/skill-loader.js'
import { executeAgent, type AgentEvent } from '../agent/executor.js'
import { createContext, addStepResult, buildStepPrompt } from './context.js'
import type {
  WorkflowDefinition,
  WorkflowContext,
  WorkflowEvent,
  WorkflowExecuteOptions,
  StepResult,
} from './types.js'

export async function executeWorkflow(options: WorkflowExecuteOptions): Promise<void> {
  const { workflow, input, runId, signal, onEvent } = options

  let context = createContext(input)
  const totalSteps = workflow.steps.length

  onEvent({ type: 'workflow_start', workflowId: workflow.id, totalSteps })

  for (let i = 0; i < workflow.steps.length; i++) {
    if (signal.aborted) {
      onEvent({ type: 'workflow_stopped' })
      return
    }

    const step = workflow.steps[i]

    onEvent({
      type: 'step_start',
      stepIndex: i,
      stepName: step.name,
      skillId: step.skill,
    })

    try {
      const result = await executeStep({
        step,
        context,
        stepIndex: i,
        totalSteps,
        runId,
        signal,
        onEvent,
      })

      context = addStepResult(context, result)

      onEvent({ type: 'step_done', stepIndex: i, result })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'

      onEvent({ type: 'step_error', stepIndex: i, error: errorMessage })

      if (workflow.on_failure === 'stop') {
        onEvent({
          type: 'workflow_error',
          error: `步骤 ${i + 1} 执行失败: ${errorMessage}`,
        })
        return
      }

      const failedResult: StepResult = {
        stepIndex: i,
        skillId: step.skill,
        sessionId: '',
        status: 'failed',
        output: '',
        error: errorMessage,
        files: [],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      }
      context = addStepResult(context, failedResult)
    }
  }

  onEvent({ type: 'workflow_done', context })
}

interface ExecuteStepOptions {
  step: { skill: string; name: string; prompt: string }
  context: WorkflowContext
  stepIndex: number
  totalSteps: number
  runId: string
  signal: AbortSignal
  onEvent: (event: WorkflowEvent) => void
}

async function executeStep(options: ExecuteStepOptions): Promise<StepResult> {
  const { step, context, stepIndex, totalSteps, runId, signal, onEvent } = options
  const startedAt = new Date().toISOString()

  const skill = await loadSkill.byId(step.skill)
  if (!skill) {
    throw new Error(`Skill "${step.skill}" 不存在`)
  }

  const prompt = buildStepPrompt(step.prompt, context, stepIndex, totalSteps)
  const sessionId = `${runId}-step-${stepIndex}`

  let output = ''
  const files: string[] = []

  await executeAgent({
    skill,
    query: prompt,
    sessionId,
    signal,
    onEvent: (event: AgentEvent) => {
      if (event.type === 'text' && event.content) {
        output += event.content
        onEvent({ type: 'step_progress', stepIndex, content: event.content })
      } else if (event.type === 'tool_use' && event.toolName) {
        onEvent({
          type: 'step_tool',
          stepIndex,
          toolName: event.toolName,
          toolInput: event.toolInput,
        })
      }
    },
  })

  return {
    stepIndex,
    skillId: step.skill,
    sessionId,
    status: 'completed',
    output,
    files,
    startedAt,
    completedAt: new Date().toISOString(),
  }
}

export function validateWorkflowInput(
  workflow: WorkflowDefinition,
  input: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  for (const [key, param] of Object.entries(workflow.input)) {
    const value = input[key]

    if (param.required && (value === undefined || value === null || value === '')) {
      errors.push(`缺少必填参数: ${key}`)
      continue
    }

    if (value !== undefined && value !== null) {
      const actualType = typeof value
      if (param.type === 'number' && actualType !== 'number') {
        errors.push(`参数 ${key} 应为数字类型`)
      } else if (param.type === 'boolean' && actualType !== 'boolean') {
        errors.push(`参数 ${key} 应为布尔类型`)
      } else if (param.type === 'string' && actualType !== 'string') {
        errors.push(`参数 ${key} 应为字符串类型`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
