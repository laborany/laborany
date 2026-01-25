/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流类型定义                                     ║
 * ║                                                                          ║
 * ║  设计哲学：数据自动传递，顺序即依赖，失败是数据流的一部分                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           工作流步骤定义                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface WorkflowStep {
  skill: string           // Skill ID
  name: string            // 步骤名称（用于显示）
  prompt: string          // Prompt 模板，支持 {{input.xxx}} 和 {{steps[n].xxx}}
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           工作流输入参数定义                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface WorkflowInputParam {
  type: 'string' | 'number' | 'boolean'
  description: string
  required?: boolean
  default?: string | number | boolean
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           工作流定义                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface WorkflowDefinition {
  id: string
  name: string
  description: string
  icon?: string
  steps: WorkflowStep[]
  input: Record<string, WorkflowInputParam>
  on_failure: 'stop' | 'continue' | 'retry'
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           步骤执行结果                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface StepResult {
  stepIndex: number
  skillId: string
  sessionId: string
  status: 'completed' | 'failed'
  output: string          // 最终文本输出
  error?: string
  files: string[]         // 生成的文件列表
  startedAt: string
  completedAt: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           工作流执行上下文                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface WorkflowContext {
  input: Record<string, unknown>    // 用户输入参数
  steps: StepResult[]               // 已完成步骤的结果
  current: number                   // 当前步骤索引
  files: string[]                   // 所有生成的文件
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           工作流执行事件                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           工作流执行选项                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface WorkflowExecuteOptions {
  workflow: WorkflowDefinition
  input: Record<string, unknown>
  runId: string
  signal: AbortSignal
  onEvent: (event: WorkflowEvent) => void
}
