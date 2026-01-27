/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流历史页面                                     ║
 * ║                                                                          ║
 * ║  展示工作流执行历史，支持查看详情和文件下载                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useWorkflowHistory } from '../hooks/useWorkflow'

const API_BASE = '/api'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface WorkflowRunDetail {
  id: string
  workflowId: string
  workflowName: string
  workflowIcon?: string
  status: string
  input: Record<string, unknown>
  context?: Record<string, unknown>
  currentStep: number
  totalSteps: number
  startedAt: string
  completedAt?: string
  steps: StepRunDetail[]
}

interface StepRunDetail {
  stepIndex: number
  skillId: string
  sessionId: string
  status: string
  output: string
  error?: string
  startedAt: string
  completedAt?: string
}

interface TaskFile {
  name: string
  path: string
  type: 'file' | 'directory'
  ext?: string
  size?: number
  children?: TaskFile[]
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           工作流历史列表                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export default function WorkflowHistoryPage() {
  const { runs, loading, fetchHistory } = useWorkflowHistory()

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  function getStatusBadge(status: string) {
    const styles: Record<string, string> = {
      running: 'bg-primary/20 text-primary',
      completed: 'bg-green-500/20 text-green-500',
      failed: 'bg-red-500/20 text-red-500',
      stopped: 'bg-secondary text-secondary-foreground',
    }
    const labels: Record<string, string> = {
      running: '运行中',
      completed: '已完成',
      failed: '失败',
      stopped: '已中止',
    }
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.stopped}`}>
        {labels[status] || status}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/workflows" className="text-muted-foreground hover:text-foreground transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-foreground">工作流执行历史</h2>
      </div>

      {runs.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
            <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-muted-foreground">暂无执行历史</p>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <Link
              key={run.id}
              to={`/workflow-history/${run.id}`}
              className="block bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{run.workflowIcon || '🔄'}</span>
                  <div>
                    <p className="font-medium text-foreground">{run.workflowName}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {formatDate(run.startedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {run.currentStep + 1}/{run.totalSteps} 步
                  </span>
                  {getStatusBadge(run.status)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           文件项组件                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function StepFileItem({ file, sessionId }: { file: TaskFile; sessionId: string }) {
  const url = `${API_BASE}/task/${sessionId}/files/${file.path}`
  const isPreviewable = ['html', 'htm', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'pdf', 'txt', 'md'].includes(
    file.ext || '',
  )

  const icons: Record<string, string> = {
    html: '🌐', htm: '🌐', pdf: '📕', doc: '📘', docx: '📘',
    xls: '📗', xlsx: '📗', ppt: '📙', pptx: '📙',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️',
    txt: '📄', md: '📝', json: '📋', csv: '📊',
  }
  const icon = icons[file.ext || ''] || '📄'

  return (
    <div className="flex items-center justify-between py-1.5 text-sm hover:bg-accent rounded-md px-2 -mx-2 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span>{icon}</span>
        <span className="truncate text-foreground">{file.name}</span>
      </div>
      <div className="flex items-center gap-2 ml-2">
        {isPreviewable && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:text-primary/80 transition-colors"
          >
            预览
          </a>
        )}
        <a
          href={url}
          download={file.name}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          下载
        </a>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           步骤详情卡片                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function StepDetailCard({ step }: { step: StepRunDetail }) {
  const [expanded, setExpanded] = useState(false)
  const [files, setFiles] = useState<TaskFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)

  useEffect(() => {
    if (expanded && step.sessionId && step.status === 'completed') {
      setLoadingFiles(true)
      const token = localStorage.getItem('token')
      fetch(`${API_BASE}/task/${step.sessionId}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => res.json())
        .then(data => setFiles(data.files || []))
        .catch(() => setFiles([]))
        .finally(() => setLoadingFiles(false))
    }
  }, [expanded, step.sessionId, step.status])

  const collectFiles = (items: TaskFile[]): TaskFile[] => {
    const result: TaskFile[] = []
    for (const item of items) {
      if (item.type === 'file') result.push(item)
      else if (item.children) result.push(...collectFiles(item.children))
    }
    return result
  }

  const allFiles = collectFiles(files)

  const statusStyles: Record<string, string> = {
    pending: 'bg-muted text-muted-foreground',
    running: 'bg-primary text-primary-foreground',
    completed: 'bg-green-500 text-white',
    failed: 'bg-red-500 text-white',
  }

  return (
    <div className={`border rounded-lg overflow-hidden ${
      step.status === 'completed' ? 'border-green-500/50' :
      step.status === 'failed' ? 'border-red-500/50' : 'border-border'
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-accent/50 transition-colors"
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${statusStyles[step.status]}`}>
          {step.status === 'completed' ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : step.status === 'failed' ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            step.stepIndex + 1
          )}
        </div>
        <div className="flex-1 text-left">
          <div className="font-medium text-foreground">步骤 {step.stepIndex + 1}</div>
          <div className="text-xs text-muted-foreground">{step.skillId}</div>
        </div>
        <svg
          className={`w-5 h-5 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-border">
          {step.error ? (
            <div className="p-4 bg-red-500/10 text-red-500 text-sm">{step.error}</div>
          ) : step.output ? (
            <pre className="p-4 text-sm text-foreground whitespace-pre-wrap max-h-64 overflow-auto bg-accent/30">
              {step.output}
            </pre>
          ) : (
            <div className="p-4 text-sm text-muted-foreground">无输出内容</div>
          )}

          {step.sessionId && step.status === 'completed' && (
            <div className="border-t border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="text-sm font-medium text-foreground">产出文件</span>
                {allFiles.length > 0 && (
                  <span className="text-xs text-muted-foreground">({allFiles.length} 个)</span>
                )}
              </div>
              {loadingFiles ? (
                <div className="text-sm text-muted-foreground">加载中...</div>
              ) : allFiles.length > 0 ? (
                <div className="space-y-1">
                  {allFiles.map((file, idx) => (
                    <StepFileItem key={idx} file={file} sessionId={step.sessionId} />
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">暂无产出文件</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           工作流执行详情页面                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function WorkflowRunDetailPage() {
  const { runId } = useParams<{ runId: string }>()
  const navigate = useNavigate()
  const [runDetail, setRunDetail] = useState<WorkflowRunDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (runId) fetchRunDetail()
  }, [runId])

  async function fetchRunDetail() {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/workflow/run/${runId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('获取执行详情失败')
      const data = await res.json()
      setRunDetail(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取执行详情失败')
    } finally {
      setLoading(false)
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  function getStatusBadge(status: string) {
    const styles: Record<string, string> = {
      running: 'bg-primary/20 text-primary',
      completed: 'bg-green-500/20 text-green-500',
      failed: 'bg-red-500/20 text-red-500',
      stopped: 'bg-secondary text-secondary-foreground',
    }
    const labels: Record<string, string> = {
      running: '运行中',
      completed: '已完成',
      failed: '失败',
      stopped: '已中止',
    }
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.stopped}`}>
        {labels[status] || status}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="h-32 bg-muted rounded-lg" />
          {[1, 2].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !runDetail) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center py-12">
          <p className="text-red-500 mb-4">{error || '执行记录不存在'}</p>
          <button
            onClick={() => navigate('/workflow-history')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
          >
            返回历史列表
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 头部 */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/workflow-history')}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{runDetail.workflowIcon || '🔄'}</span>
          <div>
            <h2 className="text-xl font-bold text-foreground">{runDetail.workflowName}</h2>
            <p className="text-sm text-muted-foreground">{formatDate(runDetail.startedAt)}</p>
          </div>
        </div>
        <div className="ml-auto">
          {getStatusBadge(runDetail.status)}
        </div>
      </div>

      {/* 概览卡片 */}
      <div className="bg-card border border-border rounded-lg p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">状态</span>
            <p className="font-medium text-foreground mt-1">{
              runDetail.status === 'completed' ? '已完成' :
              runDetail.status === 'failed' ? '失败' :
              runDetail.status === 'running' ? '运行中' : '已中止'
            }</p>
          </div>
          <div>
            <span className="text-muted-foreground">步骤进度</span>
            <p className="font-medium text-foreground mt-1">{runDetail.steps.length}/{runDetail.totalSteps}</p>
          </div>
          <div>
            <span className="text-muted-foreground">开始时间</span>
            <p className="font-medium text-foreground mt-1">{formatDate(runDetail.startedAt)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">完成时间</span>
            <p className="font-medium text-foreground mt-1">
              {runDetail.completedAt ? formatDate(runDetail.completedAt) : '-'}
            </p>
          </div>
        </div>

        {/* 输入参数 */}
        {Object.keys(runDetail.input).length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <span className="text-sm text-muted-foreground">输入参数</span>
            <div className="mt-2 text-sm">
              {Object.entries(runDetail.input).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <span className="text-muted-foreground">{key}:</span>
                  <span className="text-foreground">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 步骤列表 */}
      <h3 className="text-lg font-medium text-foreground mb-4">执行步骤</h3>
      <div className="space-y-3">
        {runDetail.steps.map((step) => (
          <StepDetailCard key={step.stepIndex} step={step} />
        ))}
      </div>
    </div>
  )
}
