/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         首页 - 我的数字团队                                ║
 * ║                                                                          ║
 * ║  展示用户的数字员工团队，提供快捷操作入口                                    ║
 * ║  设计：人格化展示，前置创建入口，过滤元类型 Skill                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useAuth } from '../hooks/useAuth'
import { useWorkers } from '../hooks/useWorkers'
import { ActionBar } from '../components/home/ActionBar'
import { ScenarioCards } from '../components/home/ScenarioCards'
import { WorkerGrid } from '../components/worker/WorkerGrid'
import { WorkflowPreview } from '../components/home/WorkflowPreview'

export default function HomePage() {
  const { user } = useAuth()
  const { workers, loading } = useWorkers()

  // TODO: 从 API 获取工作流列表
  const workflows: { id: string; name: string; stepCount: number; lastRun?: string }[] = []

  if (loading) {
    return <LoadingSkeleton />
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        {/* 欢迎区域 + 主行动按钮 */}
        <ActionBar userName={user?.name} />

        {/* 场景快捷入口 */}
        <ScenarioCards />

        {/* 我的数字团队 */}
        <WorkerGrid workers={workers} />

        {/* 工作流预览 */}
        <WorkflowPreview workflows={workflows} />
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           加载骨架屏                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function LoadingSkeleton() {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-muted rounded-lg w-1/3" />
          <div className="h-6 bg-muted rounded w-1/2" />
          <div className="flex gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="w-32 h-24 bg-muted rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 bg-muted rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
