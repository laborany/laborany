/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     工作流执行页面                                        ║
 * ║                                                                          ║
 * ║  职责：加载工作流定义 → 渲染输入表单 → 执行 → 展示结果                     ║
 * ║  设计：与 ExecutePage 风格一致，简洁单列布局                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useParams, useSearchParams, Link } from 'react-router-dom'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useWorkflowDetail } from '../hooks/useWorkflow'
import type { WorkflowInputParam } from '../hooks/useWorkflow'
import { useWorkflowRun } from '../hooks/useWorkflowRun'
import MessageList from '../components/shared/MessageList'

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                           主组件                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */
export default function WorkflowRunPage() {
  const { workflowId } = useParams<{ workflowId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { workflow, loading: wfLoading, fetchWorkflow } = useWorkflowDetail(workflowId)
  const { messages, status, error, execute, stop, clear } = useWorkflowRun(workflowId || '')
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const hasAutoExecutedRef = useRef(false)

  /* ────────────────────────────────────────────────────────────────────────
   *  加载工作流定义
   * ──────────────────────────────────────────────────────────────────────── */
  useEffect(() => { fetchWorkflow() }, [fetchWorkflow])

  /* ────────────────────────────────────────────────────────────────────────
   *  URL 参数 ?q=xxx 预填并自动执行
   * ──────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (hasAutoExecutedRef.current || !workflow) return
    const q = searchParams.get('q')
    if (!q) return

    hasAutoExecutedRef.current = true
    setSearchParams({}, { replace: true })

    const firstKey = findAutoFillKey(workflow.input)
    if (firstKey) {
      execute({ [firstKey]: q })
    }
  }, [workflow, searchParams, setSearchParams, execute])

  /* ────────────────────────────────────────────────────────────────────────
   *  表单字段变更
   * ──────────────────────────────────────────────────────────────────────── */
  const setField = useCallback((key: string, value: string) => {
    setFormValues(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleExecute = useCallback(() => {
    if (!workflow) return
    const input = buildInput(workflow.input, formValues)
    execute(input)
  }, [workflow, formValues, execute])

  const handleClear = useCallback(() => {
    clear()
    setFormValues({})
  }, [clear])

  const isRunning = status === 'running'

  /* ────────────────────────────────────────────────────────────────────────
   *  加载中
   * ──────────────────────────────────────────────────────────────────────── */
  if (wfLoading) {
    return <PageSkeleton />
  }

  if (!workflow) {
    return <NotFound />
  }

  return (
    <div className="flex h-[calc(100vh-64px)]">
      <div className="flex flex-col px-4 py-6 overflow-hidden w-full max-w-3xl mx-auto">
        {/* 顶部导航 */}
        <Header
          name={workflow.name}
          icon={workflow.icon}
          isRunning={isRunning}
          hasMessages={messages.length > 0}
          onStop={stop}
          onClear={handleClear}
        />

        {/* 错误提示 */}
        {error && <ErrorBanner message={error} />}

        {/* 消息列表 / 输入表单 */}
        <div className="flex-1 overflow-y-auto mb-4 min-h-0">
          {messages.length === 0 ? (
            <InputForm
              params={workflow.input}
              values={formValues}
              onChange={setField}
              onSubmit={handleExecute}
              isRunning={isRunning}
            />
          ) : (
            <MessageList messages={messages} isRunning={isRunning} />
          )}
        </div>

        {/* 底部执行按钮（表单模式下） */}
        {messages.length === 0 && (
          <div className="shrink-0">
            <button
              onClick={handleExecute}
              disabled={isRunning}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors text-sm font-medium"
            >
              {isRunning ? '执行中...' : '开始执行'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     辅助函数                                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/** 找到第一个适合自动填充的 string 类型参数 key */
function findAutoFillKey(params: Record<string, WorkflowInputParam>): string | null {
  const preferred = ['description', 'query', 'topic', 'content', 'input']
  for (const key of preferred) {
    if (params[key]?.type === 'string') return key
  }
  const first = Object.entries(params).find(([, p]) => p.type === 'string')
  return first ? first[0] : null
}

/** 将表单值转换为执行输入（按参数类型转换） */
function buildInput(
  params: Record<string, WorkflowInputParam>,
  values: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, param] of Object.entries(params)) {
    const raw = values[key] ?? (param.default != null ? String(param.default) : '')
    if (param.type === 'number') { result[key] = Number(raw) || 0; continue }
    if (param.type === 'boolean') { result[key] = raw === 'true'; continue }
    result[key] = raw
  }
  return result
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     子组件：页面骨架                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function PageSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
    </div>
  )
}

function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <p className="text-muted-foreground">工作流不存在</p>
      <Link to="/" className="text-primary hover:underline text-sm">返回首页</Link>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     子组件：顶部导航栏                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function Header({ name, icon, isRunning, hasMessages, onStop, onClear }: {
  name: string
  icon?: string
  isRunning: boolean
  hasMessages: boolean
  onStop: () => void
  onClear: () => void
}) {
  return (
    <div className="flex items-center justify-between mb-4 shrink-0">
      <div className="flex items-center gap-4">
        <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-lg font-semibold text-foreground">
          {icon && <span className="mr-2">{icon}</span>}
          {name}
        </h2>
      </div>
      <div className="flex items-center gap-3">
        {isRunning && (
          <button onClick={onStop} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-sm transition-colors">
            停止
          </button>
        )}
        {hasMessages && !isRunning && (
          <button onClick={onClear} className="text-sm text-primary hover:text-primary/80 transition-colors">
            重新执行
          </button>
        )}
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     子组件：错误横幅                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm flex items-center gap-2 shrink-0">
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {message}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     子组件：输入参数表单                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function InputForm({ params, values, onChange, onSubmit, isRunning }: {
  params: Record<string, WorkflowInputParam>
  values: Record<string, string>
  onChange: (key: string, value: string) => void
  onSubmit: () => void
  isRunning: boolean
}) {
  const entries = Object.entries(params)

  if (entries.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p className="text-sm">此工作流无需输入参数，点击下方按钮直接执行</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 py-4">
      <p className="text-sm text-muted-foreground mb-2">请填写以下参数：</p>
      {entries.map(([key, param]) => (
        <ParamField
          key={key}
          name={key}
          param={param}
          value={values[key] ?? ''}
          onChange={v => onChange(key, v)}
          onEnter={onSubmit}
          disabled={isRunning}
        />
      ))}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     子组件：单个参数字段                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ParamField({ name, param, value, onChange, onEnter, disabled }: {
  name: string
  param: WorkflowInputParam
  value: string
  onChange: (v: string) => void
  onEnter: () => void
  disabled: boolean
}) {
  const label = param.description || name
  const placeholder = param.default != null ? `默认: ${param.default}` : ''

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEnter() }
  }

  if (param.type === 'boolean') {
    return (
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={e => onChange(String(e.target.checked))}
          disabled={disabled}
          className="rounded border-border"
        />
        <span className="text-sm text-foreground">{label}</span>
      </label>
    )
  }

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">
        {label}
        {param.required && <span className="text-destructive ml-1">*</span>}
      </label>
      {param.type === 'string' ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 resize-none text-sm"
        />
      ) : (
        <input
          type={param.type === 'number' ? 'number' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 text-sm"
        />
      )}
    </div>
  )
}
