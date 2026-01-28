/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      员工网格布局                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Link } from 'react-router-dom'
import type { DigitalWorker } from '../../types'
import { WorkerCard } from './WorkerCard'

interface WorkerGridProps {
  workers: DigitalWorker[]
  title?: string
  showViewAll?: boolean
  onDemo?: (id: string) => void
}

export function WorkerGrid({
  workers,
  title = '我的数字团队',
  showViewAll = true,
  onDemo,
}: WorkerGridProps) {
  return (
    <div>
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {showViewAll && (
          <div className="flex gap-3">
            <Link
              to="/skills"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              查看全部
            </Link>
            <Link
              to="/skills?tab=official"
              className="text-sm text-primary hover:text-primary/80 transition-colors"
            >
              市场
            </Link>
          </div>
        )}
      </div>

      {/* 空状态 */}
      {workers.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workers.map((worker) => (
            <WorkerCard key={worker.id} worker={worker} onDemo={onDemo} />
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
        <svg
          className="w-8 h-8 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">
        还没有数字员工
      </h3>
      <p className="text-muted-foreground mb-4">
        前往劳动力市场招聘你的第一位数字员工
      </p>
      <Link
        to="/skills"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        浏览市场
      </Link>
    </div>
  )
}
