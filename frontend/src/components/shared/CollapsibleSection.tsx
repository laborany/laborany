/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       CollapsibleSection 组件                             ║
 * ║                                                                          ║
 * ║  可折叠分区组件，支持平滑动画展开/收起                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, ReactNode } from 'react'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface CollapsibleSectionProps {
  title: string
  children: ReactNode
  defaultExpanded?: boolean
  icon?: ReactNode
  badge?: string | number
  className?: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           组件实现                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function CollapsibleSection({
  title,
  children,
  defaultExpanded = true,
  icon,
  badge,
  className = '',
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <div className={`border-b border-border/50 ${className}`}>
      {/* 标题栏 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3 transition-colors hover:bg-accent/30"
      >
        <div className="flex items-center gap-2">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <span className="text-sm font-medium text-foreground">{title}</span>
          {badge !== undefined && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {badge}
            </span>
          )}
        </div>
        <span className="p-0.5 text-muted-foreground">
          <svg
            className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {/* 内容区域 - 使用 CSS Grid 实现平滑动画 */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ${
          isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-3">{children}</div>
        </div>
      </div>
    </div>
  )
}
