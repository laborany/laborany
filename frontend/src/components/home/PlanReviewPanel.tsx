/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                  PlanReviewPanel - 执行计划审核                        ║
 * ║                                                                        ║
 * ║  展示 execute_generic 的 planSteps，让用户在执行前审核计划             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface PlanReviewPanelProps {
  planSteps: string[]
  onApprove: () => void
  onEdit: () => void
  onCancel: () => void
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                         底部操作按钮配置                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const ACTIONS = [
  { key: 'cancel',  label: '取消',     style: 'bg-muted text-foreground hover:bg-muted/80' },
  { key: 'edit',    label: '调整安排', style: 'bg-secondary text-secondary-foreground hover:bg-secondary/80' },
  { key: 'approve', label: '确认安排', style: 'bg-primary text-primary-foreground hover:bg-primary/90' },
] as const

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      主组件 - 执行计划审核面板                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */
export function PlanReviewPanel({ planSteps, onApprove, onEdit, onCancel }: PlanReviewPanelProps) {
  const handlers: Record<string, () => void> = { cancel: onCancel, edit: onEdit, approve: onApprove }

  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶部标题栏 */}
      <header className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground text-sm">
          &larr; 返回办公桌
        </button>
        <div>
          <h1 className="text-lg font-semibold text-foreground">助理拟定的工作安排</h1>
          <p className="text-xs text-muted-foreground mt-1">确认后，个人助理会按这份安排开始执行或分派给同事。</p>
        </div>
      </header>

      {/* 步骤列表 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-2">
          {planSteps.map((step, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3 flex items-start">
              <span className="text-primary font-bold mr-3">{i + 1}</span>
              <span className="text-sm text-foreground">{step}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 底部操作区 */}
      <div className="shrink-0 px-6 py-4 border-t border-border">
        <div className="max-w-3xl mx-auto flex gap-3 justify-end">
          {ACTIONS.map(({ key, label, style }) => (
            <button
              key={key}
              onClick={handlers[key]}
              className={`${style} px-4 py-2 rounded-lg text-sm`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
