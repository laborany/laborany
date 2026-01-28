/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      员工卡片组件                                         ║
 * ║                                                                          ║
 * ║  人格化设计：将 Skill 展示为"数字员工"                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Link } from 'react-router-dom'
import type { DigitalWorker } from '../../types'
import { WorkerAvatar } from './WorkerAvatar'

interface WorkerCardProps {
  worker: DigitalWorker
  onDemo?: (id: string) => void
}

export function WorkerCard({ worker, onDemo }: WorkerCardProps) {
  return (
    <div className="card-hover p-6 flex flex-col">
      {/* 头部：头像 + 基本信息 */}
      <div className="flex items-start gap-4 mb-4">
        <WorkerAvatar icon={worker.icon} />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate">
            {worker.name}
          </h3>
          {worker.category && (
            <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-secondary text-secondary-foreground rounded-full">
              {worker.category}
            </span>
          )}
        </div>
      </div>

      {/* 描述 */}
      <p className="text-sm text-muted-foreground line-clamp-2 flex-1">
        {worker.description}
      </p>

      {/* 上次使用时间 */}
      {worker.lastUsed && (
        <div className="mt-3 text-xs text-muted-foreground">
          上次使用：{worker.lastUsed}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="mt-4 pt-4 border-t border-border flex gap-2">
        <Link
          to={`/execute/${worker.id}`}
          className="btn-primary flex-1 text-center py-2 text-sm"
        >
          使用
        </Link>
        {onDemo && (
          <button
            onClick={() => onDemo(worker.id)}
            className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
            title="使用示例数据试运行"
          >
            试运行
          </button>
        )}
      </div>
    </div>
  )
}
