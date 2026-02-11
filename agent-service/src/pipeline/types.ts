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

export interface PipelineContext {
  input: Record<string, unknown>
  steps: StepResult[]
  current: number
  files: string[]
}

export type PipelineEvent =
  | { type: 'pipeline_start'; pipelineId: string; totalSteps: number }
  | { type: 'step_start'; stepIndex: number; stepName: string; skillId: string }
  | { type: 'step_progress'; stepIndex: number; content: string }
  | { type: 'step_tool'; stepIndex: number; toolName: string; toolInput?: Record<string, unknown> }
  | { type: 'step_done'; stepIndex: number; result: StepResult }
  | { type: 'step_error'; stepIndex: number; error: string }
  | { type: 'pipeline_done'; context: PipelineContext }
  | { type: 'pipeline_error'; error: string }
  | { type: 'pipeline_stopped' }
