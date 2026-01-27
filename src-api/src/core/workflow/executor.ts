/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流执行器                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { loadSkill } from '../agent/skill-loader.js'
import { executeAgent, type AgentEvent } from '../agent/executor.js'
import { createContext, addStepResult, buildStepPrompt } from './context.js'
import { copyFile, mkdir, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { homedir, platform } from 'os'
import { fileURLToPath } from 'url'
import type {
  WorkflowDefinition,
  WorkflowContext,
  WorkflowEvent,
  WorkflowExecuteOptions,
  StepResult,
} from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取上传目录和任务目录                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getAppDataDir(): string {
  const isProduction = process.env.NODE_ENV === 'production'
  if (isProduction) {
    return platform() === 'win32'
      ? join(homedir(), 'AppData', 'Roaming', 'LaborAny')
      : platform() === 'darwin'
        ? join(homedir(), 'Library', 'Application Support', 'LaborAny')
        : join(homedir(), '.config', 'laborany')
  }
  return join(__dirname, '..', '..', '..', '..')
}

function getUploadsDir(): string {
  return join(getAppDataDir(), 'uploads')
}

function getTasksDir(): string {
  return join(getAppDataDir(), 'tasks')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       复制上传文件到任务目录                               │
 * └─────���────────────────────────────────────────────────────────────────────┘ */
async function copyUploadedFilesToTaskDir(
  input: Record<string, unknown>,
  taskDir: string
): Promise<Record<string, unknown>> {
  const uploadsDir = getUploadsDir()
  const processedInput: Record<string, unknown> = { ...input }

  for (const [key, value] of Object.entries(input)) {
    // 检查是否是文件输入（有 id 和 name 属性）
    if (value && typeof value === 'object' && 'id' in value && 'name' in value) {
      const fileInput = value as { id: string; name: string }
      const fileId = fileInput.id
      const fileName = fileInput.name

      // 查找上传的文件
      if (existsSync(uploadsDir)) {
        const files = await readdir(uploadsDir)
        const matchedFile = files.find(f => f.startsWith(fileId))

        if (matchedFile) {
          const srcPath = join(uploadsDir, matchedFile)
          const destPath = join(taskDir, fileName)

          // 确保任务目录存在
          if (!existsSync(taskDir)) {
            await mkdir(taskDir, { recursive: true })
          }

          // 复制文件
          await copyFile(srcPath, destPath)
          console.log(`[Workflow] Copied file: ${srcPath} -> ${destPath}`)

          // 更新输入，使用文件名而不是 ID
          processedInput[key] = fileName
        } else {
          console.warn(`[Workflow] File not found: ${fileId}`)
          processedInput[key] = `[文件未找到: ${fileName}]`
        }
      }
    }
  }

  return processedInput
}

export async function executeWorkflow(options: WorkflowExecuteOptions): Promise<void> {
  const { workflow, input, runId, signal, onEvent } = options

  // 所有步骤共享同一个工作目录（使用 runId）
  const sharedWorkDir = join(getTasksDir(), runId)

  // 复制上传的文件到共享工作目录
  const processedInput = await copyUploadedFilesToTaskDir(input, sharedWorkDir)

  let context = createContext(processedInput)
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
        sharedWorkDir,  // 传递共享工作目录
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
  sharedWorkDir: string  // 共享工作目录
}

async function executeStep(options: ExecuteStepOptions): Promise<StepResult> {
  const { step, context, stepIndex, totalSteps, runId, signal, onEvent, sharedWorkDir } = options
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
    workDir: sharedWorkDir,  // 使用共享工作目录
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
    sessionId: runId,  // 使用 runId 作为 sessionId，因为所有步骤共享同一目录
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
