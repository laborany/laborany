/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流执行页                                       ║
 * ║                                                                          ║
 * ║  展示执行进度、实时输出、步骤状态                                           ║
 * ╚══════════════════════════════════════════════���═══════════════════════════╝ */

import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useWorkflowDetail,
  useWorkflowExecutor,
  type WorkflowInputParam,
} from '../hooks/useWorkflow'

const API_BASE = 'http://localhost:8000/api'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           文件上传组件                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function FileInput({
  value,
  onChange,
  accept,
  required,
}: {
  value: { id: string; name: string } | null
  onChange: (file: { id: string; name: string } | null) => void
  accept?: string
  required?: boolean
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)

    try {
      const token = localStorage.getItem('token')
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`${API_BASE}/files/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (!res.ok) throw new Error('上传失败')

      const data = await res.json()
      onChange({ id: data.id, name: file.name })
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = () => {
    onChange(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-center gap-2 p-3 bg-accent/50 rounded-lg">
          <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="flex-1 text-sm truncate">{value.name}</span>
          <button
            type="button"
            onClick={handleRemove}
            className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-red-500"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleFileChange}
            required={required && !value}
            className="hidden"
          />
          {uploading ? (
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
          ) : (
            <>
              <svg className="w-8 h-8 text-muted-foreground mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-sm text-muted-foreground">点击上传文件</span>
              {accept && <span className="text-xs text-muted-foreground mt-1">支持: {accept}</span>}
            </>
          )}
        </label>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           输入表单组件                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function InputForm({
  params,
  onSubmit,
  disabled,
}: {
  params: Record<string, WorkflowInputParam>
  onSubmit: (values: Record<string, unknown>) => void
  disabled: boolean
}) {
  const [values, setValues] = useState<Record<string, unknown>>({})

  // 初始化默认值
  useEffect(() => {
    const defaults: Record<string, unknown> = {}
    for (const [key, param] of Object.entries(params)) {
      if (param.default !== undefined) {
        defaults[key] = param.default
      }
    }
    setValues(defaults)
  }, [params])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // 将文件对象转换为文件 ID
    const submitValues: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(values)) {
      if (value && typeof value === 'object' && 'id' in value) {
        submitValues[key] = (value as { id: string }).id
      } else {
        submitValues[key] = value
      }
    }
    onSubmit(submitValues)
  }

  const paramEntries = Object.entries(params)

  if (paramEntries.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground mb-4">此工作流无需输入参数</p>
        <button
          onClick={() => onSubmit({})}
          disabled={disabled}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          {disabled ? '执行中...' : '开始执行'}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {paramEntries.map(([key, param]) => (
        <div key={key}>
          <label className="block text-sm font-medium text-foreground mb-1">
            {key}
            {param.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          {param.description && (
            <p className="text-xs text-muted-foreground mb-2">{param.description}</p>
          )}
          {param.type === 'file' ? (
            <FileInput
              value={values[key] as { id: string; name: string } | null}
              onChange={file => setValues(prev => ({ ...prev, [key]: file }))}
              accept={param.accept}
              required={param.required}
            />
          ) : param.type === 'boolean' ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(values[key])}
                onChange={e => setValues(prev => ({ ...prev, [key]: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm">启用</span>
            </label>
          ) : (
            <input
              type={param.type === 'number' ? 'number' : 'text'}
              value={String(values[key] || '')}
              onChange={e => {
                const val = param.type === 'number' ? Number(e.target.value) : e.target.value
                setValues(prev => ({ ...prev, [key]: val }))
              }}
              required={param.required}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          )}
        </div>
      ))}
      <button
        type="submit"
        disabled={disabled}
        className="w-full py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
      >
        {disabled ? '执行中...' : '开始执行'}
      </button>
    </form>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           步骤状态指示器                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function StepIndicator({
  status,
  index,
}: {
  status: 'pending' | 'running' | 'completed' | 'failed'
  index: number
}) {
  const statusStyles = {
    pending: 'bg-muted text-muted-foreground',
    running: 'bg-primary text-primary-foreground animate-pulse',
    completed: 'bg-green-500 text-white',
    failed: 'bg-red-500 text-white',
  }

  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${statusStyles[status]}`}>
      {status === 'completed' ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : status === 'failed' ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : status === 'running' ? (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        index + 1
      )}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           文件项组件                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface TaskFile {
  name: string
  path: string
  type: 'file' | 'directory'
  ext?: string
  size?: number
  children?: TaskFile[]
}

function StepFileItem({
  file,
  sessionId,
}: {
  file: TaskFile
  sessionId: string
}) {
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
 * │                           步骤卡片组件                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function StepCard({
  step,
  isExpanded,
  onToggle,
}: {
  step: {
    stepIndex: number
    skillId: string
    name: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    output: string
    error: string | null
    sessionId: string | null
  }
  isExpanded: boolean
  onToggle: () => void
}) {
  const outputRef = useRef<HTMLPreElement>(null)
  const [files, setFiles] = useState<TaskFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)

  // 自动滚动到底部
  useEffect(() => {
    if (outputRef.current && step.status === 'running') {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [step.output, step.status])

  // 步骤完成后获取文件列表
  useEffect(() => {
    if (step.status === 'completed' && step.sessionId && isExpanded) {
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
  }, [step.status, step.sessionId, isExpanded])

  // 递归收集所有文件
  const collectFiles = (items: TaskFile[]): TaskFile[] => {
    const result: TaskFile[] = []
    for (const item of items) {
      if (item.type === 'file') {
        result.push(item)
      } else if (item.children) {
        result.push(...collectFiles(item.children))
      }
    }
    return result
  }

  const allFiles = collectFiles(files)

  return (
    <div className={`border rounded-lg overflow-hidden ${
      step.status === 'running' ? 'border-primary' :
      step.status === 'completed' ? 'border-green-500/50' :
      step.status === 'failed' ? 'border-red-500/50' :
      'border-border'
    }`}>
      {/* 头部 */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-accent/50 transition-colors"
      >
        <StepIndicator status={step.status} index={step.stepIndex} />
        <div className="flex-1 text-left">
          <div className="font-medium text-foreground">{step.name || `步骤 ${step.stepIndex + 1}`}</div>
          <div className="text-xs text-muted-foreground">{step.skillId}</div>
        </div>
        <svg
          className={`w-5 h-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 展开内容 */}
      {isExpanded && (
        <div className="border-t border-border">
          {step.error ? (
            <div className="p-4 bg-red-500/10 text-red-500 text-sm">
              {step.error}
            </div>
          ) : step.output ? (
            <pre
              ref={outputRef}
              className="p-4 text-sm text-foreground whitespace-pre-wrap max-h-64 overflow-auto bg-accent/30"
            >
              {step.output}
            </pre>
          ) : step.status === 'pending' ? (
            <div className="p-4 text-sm text-muted-foreground">
              等待执行...
            </div>
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              执行中...
            </div>
          )}

          {/* 文件列表 */}
          {step.status === 'completed' && step.sessionId && (
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
                    <StepFileItem key={idx} file={file} sessionId={step.sessionId!} />
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
 * │                           进度条组件                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ProgressBar({
  current,
  total,
  status,
}: {
  current: number
  total: number
  status: string
}) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {status === 'completed' ? '已完成' :
           status === 'failed' ? '执行失败' :
           status === 'stopped' ? '已中止' :
           status === 'running' ? `执行中 (${current + 1}/${total})` :
           '准备就绪'}
        </span>
        <span className="text-foreground font-medium">{percentage}%</span>
      </div>
      <div className="h-2 bg-accent rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            status === 'completed' ? 'bg-green-500' :
            status === 'failed' ? 'bg-red-500' :
            'bg-primary'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主页面组件                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export default function WorkflowRunPage() {
  const { workflowId } = useParams<{ workflowId: string }>()
  const navigate = useNavigate()

  const { workflow, loading, error, fetchWorkflow } = useWorkflowDetail(workflowId)
  const { runState, execute, stop, reset } = useWorkflowExecutor(workflow)

  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set())

  // 加载工作流
  useEffect(() => {
    fetchWorkflow()
  }, [fetchWorkflow])

  // 自动展开当前执行的步骤
  useEffect(() => {
    if (runState.status === 'running') {
      setExpandedSteps(prev => new Set([...prev, runState.currentStep]))
    }
  }, [runState.currentStep, runState.status])

  const toggleStep = (index: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const handleExecute = (input: Record<string, unknown>) => {
    setExpandedSteps(new Set([0]))
    execute(input)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error || !workflow) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error || '工作流不存在'}</p>
          <button
            onClick={() => navigate('/workflows')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
          >
            返回列表
          </button>
        </div>
      </div>
    )
  }

  const isRunning = runState.status === 'running'
  const isFinished = ['completed', 'failed', 'stopped'].includes(runState.status)

  return (
    <div className="min-h-screen bg-background">
      {/* 头部 */}
      <header className="h-14 border-b border-border flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/workflows')}
            className="p-2 hover:bg-accent rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xl">{workflow.icon || '🔄'}</span>
            <h1 className="text-lg font-semibold text-foreground">{workflow.name}</h1>
          </div>
        </div>
        {isRunning && (
          <button
            onClick={stop}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
          >
            中止执行
          </button>
        )}
        {isFinished && (
          <button
            onClick={reset}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            重新执行
          </button>
        )}
      </header>

      {/* 内容区 */}
      <main className="p-6 max-w-4xl mx-auto">
        {/* 进度条 */}
        {runState.status !== 'idle' && (
          <div className="mb-6">
            <ProgressBar
              current={runState.steps.filter(s => s.status === 'completed').length}
              total={runState.totalSteps}
              status={runState.status}
            />
          </div>
        )}

        {/* 错误提示 */}
        {runState.error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500">
            {runState.error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：输入表单 */}
          <div className="lg:col-span-1">
            <div className="bg-card border border-border rounded-lg p-4 sticky top-6">
              <h2 className="text-sm font-medium text-foreground mb-4">输入参数</h2>
              <InputForm
                params={workflow.input}
                onSubmit={handleExecute}
                disabled={isRunning}
              />
            </div>
          </div>

          {/* 右侧：步骤列表 */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-sm font-medium text-foreground mb-2">执行步骤</h2>
            {runState.steps.length > 0 ? (
              runState.steps.map((step, index) => (
                <StepCard
                  key={index}
                  step={step}
                  isExpanded={expandedSteps.has(index)}
                  onToggle={() => toggleStep(index)}
                />
              ))
            ) : (
              workflow.steps.map((step, index) => (
                <div
                  key={index}
                  className="border border-border rounded-lg px-4 py-3 flex items-center gap-3"
                >
                  <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center text-sm font-medium text-muted-foreground">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{step.name || `步骤 ${index + 1}`}</div>
                    <div className="text-xs text-muted-foreground">{step.skill}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
