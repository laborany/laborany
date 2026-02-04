/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流执行器                                       ║
 * ║                                                                          ║
 * ║  职责：顺序执行工作流步骤，管理上下文传递                                    ║
 * ║  设计：数据自动传递，失败是数据流的一部分                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { v4 as uuid } from 'uuid'
import { loadSkill } from 'laborany-shared'
import { executeAgent, type AgentEvent } from '../agent-executor.js'
import { createContext, addStepResult, buildStepPrompt } from './context.js'
import type {
  WorkflowDefinition,
  WorkflowContext,
  WorkflowEvent,
  WorkflowExecuteOptions,
  StepResult,
} from './types.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       执行工作流                                          │
 * │                                                                          │
 * │  核心逻辑：顺序执行每个步骤，自动传递上下文                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export async function executeWorkflow(options: WorkflowExecuteOptions): Promise<void> {
  const { workflow, input, runId, signal, onEvent } = options

  // 初始化上下文
  let context = createContext(input)
  const totalSteps = workflow.steps.length

  // 发送工作流开始事件
  onEvent({
    type: 'workflow_start',
    workflowId: workflow.id,
    totalSteps,
  })

  // 顺序执行每个步骤
  for (let i = 0; i < workflow.steps.length; i++) {
    // 检查是否被中止
    if (signal.aborted) {
      onEvent({ type: 'workflow_stopped' })
      return
    }

    const step = workflow.steps[i]

    // 发送步骤开始事件
    onEvent({
      type: 'step_start',
      stepIndex: i,
      stepName: step.name,
      skillId: step.skill,
    })

    try {
      // 执行单个步骤
      const result = await executeStep({
        step,
        context,
        stepIndex: i,
        totalSteps,
        runId,
        signal,
        onEvent,
      })

      // 更新上下文
      context = addStepResult(context, result)

      // 发送步骤完成事件
      onEvent({
        type: 'step_done',
        stepIndex: i,
        result,
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'

      // 发送步骤错误事件
      onEvent({
        type: 'step_error',
        stepIndex: i,
        error: errorMessage,
      })

      // 根据失败策略决定是否继续
      if (workflow.on_failure === 'stop') {
        onEvent({
          type: 'workflow_error',
          error: `步骤 ${i + 1} 执行失败: ${errorMessage}`,
        })
        return
      }

      // continue 策略：记录失败结果，继续执行
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

  // 发送工作流完成事件
  onEvent({
    type: 'workflow_done',
    context,
  })
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       执行单个步骤                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
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

  // 加载 Skill
  const skill = await loadSkill.byId(step.skill)
  if (!skill) {
    throw new Error(`Skill "${step.skill}" 不存在`)
  }

  // 构建完整的 Prompt
  const prompt = buildStepPrompt(step.prompt, context, stepIndex, totalSteps)

  // 为每个步骤创建独立的会话 ID
  const sessionId = `${runId}-step-${stepIndex}`

  // 收集输出
  let output = ''
  const files: string[] = []

  // 执行 Agent
  await executeAgent({
    skill,
    query: prompt,
    sessionId,
    signal,
    onEvent: (event: AgentEvent) => {
      // 转发进度事件
      if (event.type === 'text' && event.content) {
        output += event.content
        onEvent({
          type: 'step_progress',
          stepIndex,
          content: event.content,
        })
      } else if (event.type === 'tool_use' && event.toolName) {
        onEvent({
          type: 'step_tool',
          stepIndex,
          toolName: event.toolName,
          toolInput: event.toolInput,
        })
      }
      // 记录任务目录（用于提取文件）
      if (event.type === 'init' && event.taskDir) {
        // 可以在这里扫描生成的文件
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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       验证工作流输入                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function validateWorkflowInput(
  workflow: WorkflowDefinition,
  input: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  for (const [key, param] of Object.entries(workflow.input)) {
    const value = input[key]

    // 检查必填参数
    if (param.required && (value === undefined || value === null || value === '')) {
      errors.push(`缺少必填参数: ${key}`)
      continue
    }

    // 检查类型
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

  return {
    valid: errors.length === 0,
    errors,
  }
}
