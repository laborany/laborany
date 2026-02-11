/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      主行动按钮栏                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Link } from 'react-router-dom'

interface ActionBarProps {
  userName?: string
}

export function ActionBar({ userName }: ActionBarProps) {
  return (
    <div className="mb-10">
      {/* 欢迎语 */}
      <h1 className="text-3xl font-bold text-foreground mb-4">
        你好，{userName || '用户'}
      </h1>

      {/* 主行动按钮 */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          to="/create"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <PlusIcon />
          招聘新员工
        </Link>
        <Link
          to="/create"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm font-medium"
        >
          <CompositeIcon />
          创建复合技能
        </Link>
        <Link
          to="/skills"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm font-medium"
        >
          <MarketIcon />
          劳动力市场
        </Link>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           图标组件                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
    </svg>
  )
}

function CompositeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" />
    </svg>
  )
}

function MarketIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  )
}
