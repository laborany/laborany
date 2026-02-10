/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     StepProgress 步骤进度组件                            ║
 * ║                                                                          ║
 * ║  设计：垂直时间线，每个节点一个步骤                                         ║
 * ║  状态用数据结构驱动渲染，消除 if/else 分支                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState } from 'react'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface WorkflowStep {
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  output?: string
  startedAt?: string
  completedAt?: string
}

export interface StepProgressProps {
  steps: WorkflowStep[]
  currentStep?: number
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  状态样式表 —— 用数据结构消除分支                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const STATUS_STYLES: Record<WorkflowStep['status'], {
  dot: string
  icon: string
  line: string
  label: string
}> = {
  pending:   { dot: 'bg-muted-foreground/30', icon: '', line: 'bg-border', label: 'text-muted-foreground' },
  running:   { dot: 'bg-primary animate-pulse', icon: '', line: 'bg-primary/40', label: 'text-foreground font-medium' },
  completed: { dot: 'bg-green-500', icon: 'M5 13l4 4L19 7', line: 'bg-green-500/40', label: 'text-foreground' },
  failed:    { dot: 'bg-red-500', icon: 'M6 18L18 6M6 6l12 12', line: 'bg-red-500/40', label: 'text-red-500' },
}

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                           主组件                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */
export function StepProgress({ steps, currentStep }: StepProgressProps) {
  if (steps.length === 0) return null

  return (
    <div className="py-3 px-4 border-b border-border bg-card/50">
      <p className="text-xs text-muted-foreground mb-2 font-medium">
        工作流进度 ({steps.filter(s => s.status === 'completed').length}/{steps.length})
      </p>
      <div className="space-y-0">
        {steps.map((step, i) => (
          <StepNode
            key={i}
            step={step}
            isLast={i === steps.length - 1}
            isCurrent={i === currentStep}
          />
        ))}
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      StepNode 单个步骤节点                               │
 * │  垂直时间线：圆点 + 连接线 + 名称 + 可折叠输出                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function StepNode({ step, isLast, isCurrent }: {
  step: WorkflowStep
  isLast: boolean
  isCurrent: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const style = STATUS_STYLES[step.status]
  const hasIcon = style.icon !== ''

  return (
    <div className="flex gap-3 relative">
      {/* 时间线：圆点 + 连接线 */}
      <div className="flex flex-col items-center w-4 shrink-0">
        <div className={`w-3 h-3 rounded-full mt-0.5 ${style.dot} flex items-center justify-center`}>
          {hasIcon && (
            <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d={style.icon} />
            </svg>
          )}
        </div>
        {!isLast && <div className={`w-0.5 flex-1 my-0.5 ${style.line}`} />}
      </div>

      {/* 步骤内容 */}
      <div className={`pb-3 min-w-0 ${isLast ? '' : ''}`}>
        <button
          onClick={() => step.output && setExpanded(!expanded)}
          className={`text-sm ${style.label} ${step.output ? 'cursor-pointer hover:underline' : 'cursor-default'}`}
        >
          {step.name}
          {isCurrent && step.status === 'running' && (
            <span className="ml-2 text-xs text-primary">执行中...</span>
          )}
        </button>
        {expanded && step.output && (
          <pre className="mt-1 text-xs text-muted-foreground bg-muted/50 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap">
            {step.output}
          </pre>
        )}
      </div>
    </div>
  )
}
