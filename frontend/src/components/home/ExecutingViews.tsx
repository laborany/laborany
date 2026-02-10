/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                  执行态视图组件 - 从 HomePage 提取                      ║
 * ║                                                                        ║
 * ║  ExecutionHeader       ：执行态顶部导航栏（复用于 Skill / Workflow）    ║
 * ║  SkillExecutingView    ：Skill 执行态（三面板布局）                     ║
 * ║  WorkflowExecutingView ：工作流执行态（带 StepProgress）               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useRef, useEffect, useCallback } from 'react'
import type { useAgent } from '../../hooks/useAgent'
import type { useWorkflowRun } from '../../hooks/useWorkflowRun'
import { ExecutionPanel } from '../execution'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           共享类型定义                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export type HomePhase = 'idle' | 'conversing' | 'plan_review' | 'executing' | 'done'

export interface ExecutionContext {
  type: 'skill' | 'workflow'
  id: string
  query: string
  originQuery?: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │              ExecutionHeader - 执行态顶部导航栏                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ExecutionHeader({ title, isRunning, isDone, onStop, onNewTask }: {
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
 * │              SkillExecutingView - Skill 执行态（三面板布局）             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function SkillExecutingView({ agent, execCtx, displayTitle, phase, onPhaseChange, onNewTask, onCapabilityCreated }: {
  agent: ReturnType<typeof useAgent>
  execCtx: ExecutionContext
  displayTitle: string
  phase: HomePhase
  onPhaseChange: (p: HomePhase) => void
  onNewTask: () => void
  onCapabilityCreated: (created: { type: 'skill' | 'workflow'; id: string; originQuery?: string }) => void
}) {
  const hasExecutedRef = useRef(false)
  const createdHandledRef = useRef<string | null>(null)

  useEffect(() => {
    hasExecutedRef.current = false
    createdHandledRef.current = null
  }, [execCtx.id, execCtx.query])

  useEffect(() => {
    if (hasExecutedRef.current) return
    if (!execCtx.id) return
    hasExecutedRef.current = true
    agent.execute(execCtx.query, undefined, {
      originQuery: execCtx.originQuery,
    })
  }, [agent.execute, execCtx.id, execCtx.originQuery, execCtx.query])

  useEffect(() => {
    if (phase === 'executing' && !agent.isRunning && agent.messages.length > 0) {
      onPhaseChange('done')
    }
  }, [phase, agent.isRunning, agent.messages.length, onPhaseChange])

  useEffect(() => {
    if (execCtx.id !== 'skill-creator') return
    const created = agent.createdCapability
    if (!created) return
    const primary = created.primary || { type: created.type, id: created.id }
    const key = `${primary.type}:${primary.id}`
    if (createdHandledRef.current === key) return
    createdHandledRef.current = key
    onCapabilityCreated({
      type: primary.type,
      id: primary.id,
      originQuery: created.originQuery || execCtx.originQuery || execCtx.query,
    })
  }, [agent.createdCapability, execCtx.id, execCtx.originQuery, execCtx.query, onCapabilityCreated])

  return (
    <div className="h-[calc(100vh-64px)]">
      <ExecutionPanel
        messages={agent.messages}
        isRunning={agent.isRunning}
        error={agent.error}
        taskFiles={agent.taskFiles}
        workDir={agent.workDir}
        filesVersion={agent.filesVersion}
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
            isRunning={agent.isRunning}
            isDone={phase === 'done'}
            onStop={agent.stop}
            onNewTask={onNewTask}
          />
        }
      />
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │          WorkflowExecutingView - 工作流执行态（带 StepProgress）        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function WorkflowExecutingView({ wfRun, execCtx, displayTitle, phase, onPhaseChange, onNewTask }: {
  wfRun: ReturnType<typeof useWorkflowRun>
  execCtx: ExecutionContext
  displayTitle: string
  phase: HomePhase
  onPhaseChange: (p: HomePhase) => void
  onNewTask: () => void
}) {
  const hasExecutedRef = useRef(false)
  const isRunning = wfRun.status === 'running'

  useEffect(() => {
    if (hasExecutedRef.current) return
    hasExecutedRef.current = true
    wfRun.execute({ query: execCtx.query })
  }, [wfRun.execute, execCtx.query])

  useEffect(() => {
    const terminal = wfRun.status === 'done' || wfRun.status === 'error'
    if (phase === 'executing' && terminal && wfRun.messages.length > 0) {
      onPhaseChange('done')
    }
  }, [phase, wfRun.status, wfRun.messages.length, onPhaseChange])

  const noop = useCallback(() => {}, [])
  const noopUrl = useCallback((p: string) => p, [])

  return (
    <div className="h-[calc(100vh-64px)]">
      <ExecutionPanel
        messages={wfRun.messages}
        isRunning={isRunning}
        error={wfRun.error}
        taskFiles={[]}
        workDir={null}
        filesVersion={0}
        onSubmit={noop}
        onStop={wfRun.stop}
        sessionId={null}
        getFileUrl={noopUrl}
        fetchTaskFiles={noop}
        pendingQuestion={null}
        respondToQuestion={noop}
        placeholder="工作流执行中..."
        workflowSteps={wfRun.steps}
        currentWorkflowStep={wfRun.currentStep}
        headerSlot={
          <ExecutionHeader
            title={displayTitle}
            isRunning={isRunning}
            isDone={phase === 'done'}
            onStop={wfRun.stop}
            onNewTask={onNewTask}
          />
        }
      />
    </div>
  )
}

export { ExecutionHeader, SkillExecutingView, WorkflowExecutingView }
