/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║              分发状态视图 - 首页状态机各阶段的 UI 组件                  ║
 * ║                                                                        ║
 * ║  CandidateConfirmView  ：候选能力确认（candidate_found 状态）          ║
 * ║  FallbackBanner         ：通用助手提示横幅                              ║
 * ║  ErrorView              ：统一错误态（error 状态）                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │              CandidateConfirmView - 候选能力确认卡片                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function CandidateConfirmView({ targetName, reason, confidence, matchType, onConfirm, onReject, onBack }: {
  targetName: string
  reason?: string
  confidence?: number
  matchType?: 'exact' | 'candidate'
  onConfirm: () => void
  onReject: () => void
  onBack: () => void
}) {
  const confidenceText = typeof confidence === 'number'
    ? `匹配置信度：${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`
    : ''
  const matchTypeText = matchType === 'exact'
    ? '匹配类型：精确匹配'
    : matchType === 'candidate'
      ? '匹配类型：候选匹配'
      : ''

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回
        </button>

        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              匹配到已有能力
            </p>
            <p className="text-lg font-semibold text-foreground">{targetName}</p>
          </div>

          {reason && (
            <p className="text-sm text-muted-foreground">{reason}</p>
          )}

          {(confidenceText || matchTypeText) && (
            <div className="text-xs text-muted-foreground space-y-1">
              {confidenceText && <p>{confidenceText}</p>}
              {matchTypeText && <p>{matchTypeText}</p>}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              使用这个能力
            </button>
            <button
              onClick={onReject}
              className="flex-1 px-4 py-2 rounded-lg text-sm bg-muted text-foreground hover:bg-muted/80 transition-colors"
            >
              不使用
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │              FallbackBanner - 通用助手提示横幅                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function FallbackBanner() {
  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950 px-4 py-2 text-sm text-blue-700 dark:text-blue-300">
      已切换到通用助手模式 — 可自动调用已有能力完成子任务
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │              ErrorView - 统一错误态                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function ErrorView({ message, onRetry, onBack }: {
  message: string
  onRetry: () => void
  onBack: () => void
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-4 text-center">
        <div className="text-red-500 text-4xl">⚠</div>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            重试
          </button>
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-lg text-sm bg-muted text-foreground hover:bg-muted/80 transition-colors"
          >
            返回首页
          </button>
        </div>
      </div>
    </div>
  )
}
