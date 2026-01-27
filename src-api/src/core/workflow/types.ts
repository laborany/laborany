/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流类型定义                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

export interface WorkflowStep {
  skill: string
  name: string
  prompt: string
}

export interface WorkflowInputParam {
  type: 'string' | 'number' | 'boolean'
  description: string
  required?: boolean
  default?: string | number | boolean
}

export interface WorkflowDefinition {
  id: string
  name: string
  description: string
  icon?: string
  steps: WorkflowStep[]
  input: Record<string, WorkflowInputParam>
  on_failure: 'stop' | 'continue' | 'retry'
}

export interface StepResult {
  stepIndex: number
  skillId: string
  sessionId: string
  status: 'completed' | 'failed'
  output: string
  error?: string
  files: string[]
  startedAt: string
  completedAt: string
}

export interface WorkflowContext {
  input: Record<string, unknown>
  steps: StepResult[]
  current: number
  files: string[]
}

export type WorkflowEvent =
  | { type: 'workflow_start'; workflowId: string; totalSteps: number }
  | { type: 'step_start'; stepIndex: number; stepName: string; skillId: string }
  | { type: 'step_progress'; stepIndex: number; content: string }
  | { type: 'step_tool'; stepIndex: number; toolName: string; toolInput?: Record<string, unknown> }
  | { type: 'step_done'; stepIndex: number; result: StepResult }
  | { type: 'step_error'; stepIndex: number; error: string }
  | { type: 'workflow_done'; context: WorkflowContext }
  | { type: 'workflow_error'; error: string }
  | { type: 'workflow_stopped' }

export interface WorkflowExecuteOptions {
  workflow: WorkflowDefinition
  input: Record<string, unknown>
  runId: string
  signal: AbortSignal
  onEvent: (event: WorkflowEvent) => void
}
