/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                  执行态视图组件 - 从 HomePage 提取                      ║
 * ║                                                                        ║
 * ║  ExecutionHeader       ：执行态顶部导航栏                               ║
 * ║  SkillExecutingView    ：统一执行态（三面板布局）                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useRef, useEffect } from 'react'
import type { useAgent } from '../../hooks/useAgent'
import { ExecutionPanel } from '../execution'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           共享类型定义                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export type HomePhase =
  | 'idle'
  | 'analyzing'
  | 'candidate_found'
  | 'creating_proposal'
  | 'creating_confirm'
  | 'installing'
  | 'routing'
  | 'plan_review'
  | 'executing'
  | 'fallback_general'
  | 'done'
  | 'error'

export interface ExecutionContext {
  type: 'skill'
  id: string
  query: string
  originQuery?: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │              ExecutionHeader - 执行态顶部导航栏                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function ExecutionHeader({ title, isRunning, isDone, onStop, onNewTask }: {
  title: string
  isRunning: boolean
  isDone: boolean
  onStop: () => void
  onNewTask: () => void
}) {
  return (
    <div className="flex items-center justify-between mb-4 shrink-0">
      <div className="flex items-center gap-4">
        <button
          onClick={onNewTask}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>
      <div className="flex items-center gap-3">
        {isRunning && (
          <button
            onClick={onStop}
            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-sm transition-colors"
          >
            停止任务
          </button>
        )}
        {isDone && (
          <button
            onClick={onNewTask}
            className="px-3 py-1 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            新任务
          </button>
        )}
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │        SkillExecutingView - 统一 Capability 执行态（三面板布局）        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function SkillExecutingView({ agent, execCtx, displayTitle, phase, onPhaseChange, onNewTask, onCapabilityCreated, onError }: {
  agent: ReturnType<typeof useAgent>
  execCtx: ExecutionContext
  displayTitle: string
  phase: HomePhase
  onPhaseChange: (p: HomePhase) => void
  onNewTask: () => void
  onCapabilityCreated: (created: { type: 'skill'; id: string; originQuery?: string }) => void
  onError: (msg: string) => void
}) {
  const hasExecutedRef = useRef(false)
  const createdHandledRef = useRef<string | null>(null)
  const effectiveRunning = agent.isRunning && !agent.pendingQuestion

  useEffect(() => {
    hasExecutedRef.current = false
    createdHandledRef.current = null
  }, [execCtx.id, execCtx.query])

  useEffect(() => {
    if (hasExecutedRef.current || !execCtx.id) return
    hasExecutedRef.current = true
    agent.execute(execCtx.query, undefined, { originQuery: execCtx.originQuery })
  }, [agent.execute, execCtx.id, execCtx.originQuery, execCtx.query])

  const isExecutionPhase =
    phase === 'executing'
    || phase === 'fallback_general'
    || phase === 'creating_proposal'
    || phase === 'creating_confirm'
    || phase === 'installing'
    || phase === 'routing'

  useEffect(() => {
    if (execCtx.id === 'skill-creator') return
    if (
      isExecutionPhase
      && !effectiveRunning
      && agent.messages.length > 0
      && Boolean(agent.runCompletedAt)
    ) {
      onPhaseChange('done')
    }
  }, [
    isExecutionPhase,
    effectiveRunning,
    agent.messages.length,
    agent.runCompletedAt,
    execCtx.id,
    onPhaseChange,
  ])

  useEffect(() => {
    if (execCtx.id !== 'skill-creator') return
    if (phase === 'creating_proposal' && agent.pendingQuestion) {
      onPhaseChange('creating_confirm')
      return
    }
    if (phase === 'creating_confirm' && !agent.pendingQuestion && effectiveRunning) {
      onPhaseChange('creating_proposal')
    }
  }, [execCtx.id, phase, agent.pendingQuestion, effectiveRunning, onPhaseChange])

  useEffect(() => {
    if (execCtx.id !== 'skill-creator') return
    const created = agent.createdCapability
    if (!created) return
    const primary = created.primary || { type: created.type, id: created.id }
    const normalizedPrimary = { type: 'skill' as const, id: primary.id }
    const key = `${normalizedPrimary.type}:${normalizedPrimary.id}`
    if (createdHandledRef.current === key) return
    createdHandledRef.current = key
    onPhaseChange('installing')
    onCapabilityCreated({
      type: normalizedPrimary.type,
      id: normalizedPrimary.id,
      originQuery: created.originQuery || execCtx.originQuery || execCtx.query,
    })
  }, [agent.createdCapability, execCtx.id, execCtx.originQuery, execCtx.query, onCapabilityCreated, onPhaseChange])

  /* ── skill-creator 出错时，上报错误状态 ── */
  useEffect(() => {
    if (execCtx.id !== 'skill-creator') return
    if (agent.error && !effectiveRunning) {
      const normalized = agent.error.toLowerCase()
      if (normalized.includes('timeout') || normalized.includes('超时')) {
        onError('创建技能超时，请点击“新任务”后重试，或精简需求后再创建。')
        return
      }
      onError(agent.error)
    }
  }, [execCtx.id, agent.error, effectiveRunning, onError])

  return (
    <div className="h-[calc(100vh-64px)]">
      <ExecutionPanel
        messages={agent.messages}
        isRunning={effectiveRunning}
        error={agent.error}
        connectionStatus={agent.connectionStatus}
        taskFiles={agent.taskFiles}
        workDir={agent.workDir}
        filesVersion={agent.filesVersion}
        compositeSteps={agent.compositeSteps}
        currentCompositeStep={agent.currentCompositeStep}
        onSubmit={agent.execute}
        onStop={agent.stop}
        sessionId={agent.sessionId}
        getFileUrl={agent.getFileUrl}
        fetchTaskFiles={agent.fetchTaskFiles}
        pendingQuestion={agent.pendingQuestion}
        respondToQuestion={agent.respondToQuestion}
        placeholder="继续对话..."
        headerSlot={
          <ExecutionHeader
            title={displayTitle}
            isRunning={effectiveRunning}
            isDone={phase === 'done'}
            onStop={agent.stop}
            onNewTask={onNewTask}
          />
        }
      />
    </div>
  )
}
