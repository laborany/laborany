/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      加载状态组件                                         ║
 * ║                                                                          ║
 * ║  使用 shimmer 动画效果增强视觉体验                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

interface LoadingStateProps {
  columns?: number
}

export function LoadingState({ columns = 3 }: LoadingStateProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={i}
            className="h-40 bg-gradient-to-r from-muted via-muted/50 to-muted bg-[length:200%_100%] animate-shimmer rounded-lg"
            style={{ animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
