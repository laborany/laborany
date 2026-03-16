import { useState } from 'react'
import type { ReactNode } from 'react'

export function GuideBlock({
  title,
  tone,
  children,
}: {
  title: string
  tone: 'purple' | 'blue'
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const style = tone === 'purple'
    ? 'border-purple-200/70 bg-purple-50/50 text-purple-900'
    : 'border-blue-200/70 bg-blue-50/50 text-blue-900'

  return (
    <div className={`rounded border ${style}`}>
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full px-3 py-2 text-left text-sm font-medium"
      >
        {title} {expanded ? '▲' : '▼'}
      </button>
      {expanded && (
        <div className="space-y-2 px-3 pb-3 text-xs text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  )
}
