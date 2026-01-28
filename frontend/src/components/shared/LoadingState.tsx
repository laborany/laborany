/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      加载状态组件                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

interface LoadingStateProps {
  columns?: number
}

export function LoadingState({ columns = 3 }: LoadingStateProps) {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="h-40 bg-muted rounded-lg" />
        ))}
      </div>
    </div>
  )
}
