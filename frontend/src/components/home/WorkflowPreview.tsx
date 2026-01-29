/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      工作流预览组件                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Link } from 'react-router-dom'

interface Workflow {
  id: string
  name: string
  stepCount: number
  lastRun?: string
}

interface WorkflowPreviewProps {
  workflows: Workflow[]
}

export function WorkflowPreview({ workflows }: WorkflowPreviewProps) {
  if (workflows.length === 0) return null

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">我的工作流</h2>
        <div className="flex gap-2">
          <Link
            to="/workflows"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            查看全部
          </Link>
          <Link
            to="/workflows/new"
            className="text-sm text-primary hover:text-primary/80 transition-colors"
          >
            新建
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        {workflows.slice(0, 3).map((workflow) => (
          <WorkflowItem key={workflow.id} workflow={workflow} />
        ))}
      </div>
    </div>
  )
}

function WorkflowItem({ workflow }: { workflow: Workflow }) {
  return (
    <div className="card p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-xl">🔄</span>
        <div>
          <div className="font-medium text-foreground">{workflow.name}</div>
          <div className="text-xs text-muted-foreground">
            {workflow.stepCount} 个步骤
            {workflow.lastRun && ` · 上次运行：${workflow.lastRun}`}
          </div>
        </div>
      </div>
      <Link
        to={`/workflows/${workflow.id}/edit`}
        className="px-4 py-1.5 text-sm bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
      >
        编辑
      </Link>
    </div>
  )
}
