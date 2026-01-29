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
