/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         首页 - 我的数字团队                                ║
 * ║                                                                          ║
 * ║  展示用户的数字员工团队，提供快捷操作入口                                    ║
 * ║  设计：人格化展示，前置创建入口，过滤元类型 Skill                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useWorkers } from '../hooks/useWorkers'
import { useWorkflowList } from '../hooks/useWorkflow'
import { ActionBar } from '../components/home/ActionBar'
import { ScenarioCards } from '../components/home/ScenarioCards'
import { WorkerGrid } from '../components/worker/WorkerGrid'
import { WorkflowPreview } from '../components/home/WorkflowPreview'

export default function HomePage() {
  const { user } = useAuth()
  const { workers, loading: workersLoading } = useWorkers()
  const { workflows, loading: workflowsLoading, fetchWorkflows } = useWorkflowList()

  useEffect(() => {
    fetchWorkflows()
  }, [fetchWorkflows])

  const loading = workersLoading || workflowsLoading

  // 转换工作流数据格式
  const workflowItems = workflows.map(w => ({
    id: w.id,
    name: w.name,
    stepCount: w.steps.length,
  }))

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
        <WorkflowPreview workflows={workflowItems} />
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           加载骨架屏                                      │
 * │  使用 shimmer 动画效果增强视觉体验                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function LoadingSkeleton() {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <div className="space-y-6">
          {/* 标题骨架 */}
          <div className="h-10 bg-gradient-to-r from-muted via-muted/50 to-muted bg-[length:200%_100%] animate-shimmer rounded-lg w-1/3" />
          <div className="h-6 bg-gradient-to-r from-muted via-muted/50 to-muted bg-[length:200%_100%] animate-shimmer rounded w-1/2" />

          {/* 场景卡片骨架 */}
          <div className="flex gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-32 h-24 bg-gradient-to-r from-muted via-muted/50 to-muted bg-[length:200%_100%] animate-shimmer rounded-xl"
                style={{ animationDelay: `${i * 100}ms` }}
              />
            ))}
          </div>

          {/* 工作者卡片骨架 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-44 bg-gradient-to-r from-muted via-muted/50 to-muted bg-[length:200%_100%] animate-shimmer rounded-xl"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
