/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流列表页                                       ║
 * ║                                                                          ║
 * ║  展示所有工作流，支持创建、编辑、删除、执行                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useWorkflowList, useWorkflowCRUD, type Workflow } from '../hooks/useWorkflow'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           工作流卡片组件                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function WorkflowCard({
  workflow,
  onDelete,
}: {
  workflow: Workflow
  onDelete: (id: string) => void
}) {
  const navigate = useNavigate()
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors">
      {/* 头部 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{workflow.icon || '🔄'}</span>
          <div>
            <h3 className="font-medium text-foreground">{workflow.name}</h3>
            <p className="text-sm text-muted-foreground">
              {workflow.steps.length} 个步骤
            </p>
          </div>
        </div>

        {/* 菜单按钮 */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-8 z-20 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[120px]">
                <button
                  onClick={() => {
                    setShowMenu(false)
                    navigate(`/workflows/${workflow.id}/edit`)
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-accent"
                >
                  编辑
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false)
                    onDelete(workflow.id)
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-accent"
                >
                  删除
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 描述 */}
      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
        {workflow.description || '暂无描述'}
      </p>

      {/* 步骤预览 */}
      <div className="flex items-center gap-1 mb-4 overflow-hidden">
        {workflow.steps.slice(0, 4).map((step, index) => (
          <div key={index} className="flex items-center">
            <span className="px-2 py-1 bg-accent rounded text-xs truncate max-w-[80px]">
              {step.name}
            </span>
            {index < Math.min(workflow.steps.length - 1, 3) && (
              <svg className="w-4 h-4 text-muted-foreground mx-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </div>
        ))}
        {workflow.steps.length > 4 && (
          <span className="text-xs text-muted-foreground">+{workflow.steps.length - 4}</span>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <button
          onClick={() => navigate(`/workflow-run/${workflow.id}`)}
          className="flex-1 py-2 text-center bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
        >
          执行
        </button>
        <Link
          to={`/workflows/${workflow.id}/edit`}
          className="flex-1 py-2 text-center border border-border text-foreground rounded-lg hover:bg-accent transition-colors text-sm"
        >
          编辑
        </Link>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           空状态组件                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">还没有工作流</h3>
      <p className="text-muted-foreground mb-6">
        创建你的第一个工作流，将多个技能组合成自动化流程
      </p>
      <Link
        to="/workflows/new"
        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
      >
        创建工作流
      </Link>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主页面组件                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export default function WorkflowsPage() {
  const { workflows, loading, error, fetchWorkflows } = useWorkflowList()
  const { deleteWorkflow } = useWorkflowCRUD()
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  useEffect(() => {
    fetchWorkflows()
  }, [fetchWorkflows])

  const handleDelete = async (id: string) => {
    if (deleteConfirm === id) {
      try {
        await deleteWorkflow(id)
        fetchWorkflows()
      } catch {
        // 错误已在 hook 中处理
      }
      setDeleteConfirm(null)
    } else {
      setDeleteConfirm(id)
      setTimeout(() => setDeleteConfirm(null), 3000)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 头部 */}
      <header className="h-14 border-b border-border flex items-center justify-between pl-6 pr-40">
        <h1 className="text-lg font-semibold text-foreground">工作流</h1>
        <Link
          to="/workflows/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          创建工作流
        </Link>
      </header>

      {/* 内容区 */}
      <main className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
          </div>
        ) : error ? (
          <div className="text-center py-16 text-red-500">{error}</div>
        ) : workflows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflows.map(workflow => (
              <WorkflowCard
                key={workflow.id}
                workflow={workflow}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>

      {/* 删除确认提示 */}
      {deleteConfirm && (
        <div className="fixed bottom-4 right-4 bg-card border border-border rounded-lg shadow-lg p-4">
          <p className="text-sm text-foreground mb-2">确定要删除这个工作流吗？</p>
          <p className="text-xs text-muted-foreground">再次点击删除按钮确认</p>
        </div>
      )}
    </div>
  )
}
