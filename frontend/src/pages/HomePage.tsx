import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useAgent } from '../hooks/useAgent'
import { useConverse } from '../hooks/useConverse'
import { useCronJobs } from '../hooks/useCron'
import type { Schedule } from '../hooks/useCron'
import { useSkillNameMap } from '../hooks/useSkillNameMap'
import { useModelProfile } from '../contexts/ModelProfileContext'
import { type QuickStartItem } from '../contexts/QuickStartContext'
import { API_BASE } from '../config'
import { GuideBanner } from '../components/home/GuideBanner'
import { ScenarioCards } from '../components/home/ScenarioCards'
import ChatInput from '../components/shared/ChatInput'
import { ConversationPanel } from '../components/home/ConversationPanel'
import { CronSetupCard } from '../components/execution'
import { SkillExecutingView, type HomePhase, type ExecutionContext } from '../components/home/ExecutingViews'
import { PlanReviewPanel } from '../components/home/PlanReviewPanel'
import { CandidateConfirmView, FallbackBanner, ErrorView } from '../components/home/DispatchViews'
import { buildExecutePath, stripAttachmentMarkers, uploadAttachments } from '../lib/attachments'
import { supportsGenerativeWidgets } from '../lib/widgetSupport'
import { getAssistantPhaseHint, isAssistantExecutionPhase } from '../lib/assistantFlow'
import { buildAssistantHandoffQuery } from '../lib/assistantHandoff'

interface CandidateInfo {
  variant: 'recommend' | 'create'
  targetId?: string
  query: string
  attachmentIds: string[]
  reason?: string
  confidence?: number
  matchType?: 'exact' | 'candidate'
}

interface GenericExecutionPlan {
  query: string
  originQuery: string
  attachmentIds: string[]
  planSteps: string[]
}

interface CronPending {
  schedule: Schedule
  name?: string
  targetQuery: string
  targetId?: string
}

interface RunningTaskBrief {
  sessionId: string
  skillId: string
  skillName: string
  startedAt: string
  source?: 'desktop' | 'converse' | 'cron' | 'feishu' | 'qq'
  query?: string
}

function getTaskSourceLabel(source?: RunningTaskBrief['source']): string {
  if (source === 'cron') return '日历安排'
  if (source === 'feishu') return '飞书'
  if (source === 'qq') return 'QQ'
  if (source === 'converse') return '助理会话'
  return '桌面工作'
}

export default function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { getCapabilityName } = useSkillNameMap()
  const { activeProfileId, profiles } = useModelProfile()
  const cachedProfileName = typeof window !== 'undefined'
    ? (localStorage.getItem('laborany.profile.name') || '').trim()
    : ''
  const displayUserName = user?.name?.trim() || cachedProfileName
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) || profiles[0] || null
  const canRenderWidgets = supportsGenerativeWidgets(activeProfile)

  const [phase, setPhase] = useState<HomePhase>('idle')
  const [execCtx, setExecCtx] = useState<ExecutionContext | null>(null)
  const [cronPending, setCronPending] = useState<CronPending | null>(null)
  const [selectedCase, setSelectedCase] = useState<QuickStartItem | null>(null)
  const [candidate, setCandidate] = useState<CandidateInfo | null>(null)
  const [genericPlan, setGenericPlan] = useState<GenericExecutionPlan | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [backgroundTasks, setBackgroundTasks] = useState<RunningTaskBrief[]>([])

  const handledActionRef = useRef<string | null>(null)
  const latestUserQueryRef = useRef('')

  const skillId = execCtx?.id || ''
  const agent = useAgent(skillId)
  const converse = useConverse()
  const { createJob } = useCronJobs()

  const refreshBackgroundTasks = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/sessions/running-tasks`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) {
        setBackgroundTasks([])
        return
      }
      const data = await res.json() as { tasks?: RunningTaskBrief[] }
      const tasks = Array.isArray(data.tasks) ? data.tasks : []
      tasks.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
      setBackgroundTasks(tasks)
    } catch {
      setBackgroundTasks([])
    }
  }, [])

  useEffect(() => {
    if (!converse.action) handledActionRef.current = null
  }, [converse.action])

  const handleExecute = useCallback(async (targetId: string, query: string, files?: File[]) => {
    latestUserQueryRef.current = query
    if (targetId) {
      try {
        const attachmentIds = await uploadAttachments(files || [], localStorage.getItem('token'))
        const handoffQuery = buildAssistantHandoffQuery({
          bossRequest: query,
          assigneeName: getCapabilityName(targetId),
          mode: 'employee',
          preparedTask: query,
        })
        navigate(buildExecutePath(targetId, query, attachmentIds), {
          state: { handoffQuery, originQuery: query },
        })
      } catch (error) {
        setErrorMsg(error instanceof Error ? error.message : '文件上传失败')
        setPhase('error')
      }
      return
    }
    setPhase('analyzing')
    void converse.sendMessage(query, files)
  }, [navigate, converse.sendMessage, getCapabilityName])

  useEffect(() => {
    if (!converse.action || converse.pendingQuestion) return
    const action = converse.action
    const actionKey = JSON.stringify(action)
    if (handledActionRef.current === actionKey) return
    handledActionRef.current = actionKey

    if (action.action === 'recommend_capability' && action.targetId && action.query) {
      const attachmentIds = action.attachmentIds || converse.sessionFileIds
      setCandidate({
        variant: 'recommend',
        targetId: action.targetId,
        query: stripAttachmentMarkers(action.query),
        attachmentIds,
        reason: action.reason,
        confidence: action.confidence,
        matchType: action.matchType,
      })
      setPhase('candidate_found')
      return
    }

    if (action.action === 'execute_generic') {
      const originQuery = latestUserQueryRef.current || action.query || ''
      const query = stripAttachmentMarkers(action.query || originQuery)
      const attachmentIds = action.attachmentIds || converse.sessionFileIds
      if (action.planSteps && action.planSteps.length > 0) {
        setGenericPlan({ query, originQuery, attachmentIds, planSteps: action.planSteps })
        setPhase('plan_review')
      } else {
        setExecCtx({
          type: 'skill',
          id: '__generic__',
          query: originQuery,
          originQuery,
          attachmentIds,
          workId: converse.sessionId || undefined,
          handoffQuery: buildAssistantHandoffQuery({
            bossRequest: originQuery,
            mode: 'assistant',
            preparedTask: query,
          }),
        })
        setPhase('fallback_general')
      }
      return
    }

    if (action.action === 'create_capability') {
      const seedQuery = action.seedQuery || action.query || latestUserQueryRef.current || ''
      const attachmentIds = action.attachmentIds || converse.sessionFileIds
      setCandidate({
        variant: 'create',
        query: stripAttachmentMarkers(seedQuery),
        attachmentIds,
        reason: action.reason,
      })
      setPhase('candidate_found')
      return
    }

    if (action.action === 'setup_schedule') {
      const resolvedSchedule: Schedule = action.scheduleKind === 'at' && typeof action.atMs === 'number'
        ? { kind: 'at', atMs: Math.round(action.atMs) }
        : action.scheduleKind === 'every' && typeof action.everyMs === 'number'
          ? { kind: 'every', everyMs: Math.round(action.everyMs) }
          : {
              kind: 'cron',
              expr: action.cronExpr || '0 9 * * *',
              tz: action.tz,
            }
      const targetQuery = stripAttachmentMarkers(
        action.targetQuery
        || action.query
        || latestUserQueryRef.current
        || '',
      )
      const targetId = action.targetId || ''
      setCronPending({
        schedule: resolvedSchedule,
        name: action.name,
        targetQuery,
        targetId,
      })
      setPhase('idle')
      return
    }
  }, [converse.action, converse.pendingQuestion, converse.sessionFileIds])

  useEffect(() => {
    if (phase !== 'idle') return
    void refreshBackgroundTasks()
    const timer = setInterval(() => { void refreshBackgroundTasks() }, 5000)
    return () => clearInterval(timer)
  }, [phase, refreshBackgroundTasks])

  const resumeConverseSession = useCallback(async (sessionId: string): Promise<boolean> => {
    const ok = await converse.resumeSession(sessionId)
    if (!ok) return false
    setPhase('analyzing')
    setSelectedCase(null)
    setExecCtx(null)
    setCronPending(null)
    setCandidate(null)
    setGenericPlan(null)
    setErrorMsg('')
    handledActionRef.current = null
    return true
  }, [converse.resumeSession])

  useEffect(() => {
    const converseSid = (searchParams.get('converseSid') || '').trim()
    if (!converseSid) return
    let cancelled = false
    void (async () => {
      await resumeConverseSession(converseSid)
      if (cancelled) return
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('converseSid')
      setSearchParams(nextParams, { replace: true })
    })()
    return () => {
      cancelled = true
    }
  }, [searchParams, setSearchParams, resumeConverseSession])

  useEffect(() => {
    if (converse.error && phase === 'analyzing') {
      setErrorMsg(converse.error)
      setPhase('error')
    }
  }, [converse.error, phase])

  const handleCandidateConfirm = useCallback(() => {
    if (!candidate) return

    if (candidate.variant === 'recommend' && candidate.targetId) {
      const bossRequest = latestUserQueryRef.current || candidate.query
      const handoffQuery = buildAssistantHandoffQuery({
        bossRequest,
        assigneeName: getCapabilityName(candidate.targetId),
        mode: 'employee',
        reason: candidate.reason,
        preparedTask: candidate.query,
      })
      navigate(buildExecutePath(candidate.targetId, bossRequest, candidate.attachmentIds, {
        converseSid: converse.sessionId || undefined,
      }), {
        state: {
          handoffQuery,
          originQuery: bossRequest,
          converseSessionId: converse.sessionId || undefined,
        },
      })
      return
    }

    if (candidate.variant === 'create') {
      const bossRequest = latestUserQueryRef.current || candidate.query
      setExecCtx({
        type: 'skill',
        id: 'skill-creator',
        query: bossRequest,
        originQuery: bossRequest,
        attachmentIds: candidate.attachmentIds,
        workId: converse.sessionId || undefined,
        handoffQuery: buildAssistantHandoffQuery({
          bossRequest,
          mode: 'hr',
          reason: candidate.reason,
          preparedTask: candidate.query,
        }),
      })
      setPhase('creating_proposal')
    }
  }, [candidate, navigate, getCapabilityName])

  const handleCandidateReject = useCallback(async () => {
    const rejectInstruction = '这次先不要安排给其他同事。请你先自己分析并直接给我一个结果；如果后续我补充了新的要求，或者任务发生变化，你再判断是否需要继续分派。'

    setCandidate(null)
    setExecCtx(null)
    setGenericPlan(null)
    setCronPending(null)
    setErrorMsg('')
    handledActionRef.current = null
    setPhase('analyzing')

    try {
      await converse.sendMessage(rejectInstruction)
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : '服务异常，请稍后重试')
      setPhase('error')
    }
  }, [candidate, converse.sendMessage])

  const handleCronConfirm = useCallback(async (next: CronPending) => {
    const targetId = (next.targetId || '').trim() || '__generic__'
    await createJob({
      name: next.name || next.targetQuery.slice(0, 50) || '日历安排',
      description: next.targetQuery,
      schedule: next.schedule,
      target: { type: 'skill', id: targetId, query: next.targetQuery },
    })
    setCronPending(null)
  }, [createJob])

  const handleNewTask = useCallback(() => {
    agent.clear()
    converse.reset()
    setPhase('idle')
    setSelectedCase(null)
    setExecCtx(null)
    setCronPending(null)
    setCandidate(null)
    setGenericPlan(null)
    setErrorMsg('')
    handledActionRef.current = null
  }, [agent.clear, converse.reset])

  const handleBackFromExecution = useCallback(() => {
    // 任务启动期也要允许返回首页并继续后台运行；尚未拿到 sessionId 时避免提前中断。
    const hasSession = Boolean(agent.sessionId)
    const isExecutionPhase = isAssistantExecutionPhase(phase)
    const launchingWithoutSession = !hasSession && (agent.isRunning || isExecutionPhase)

    if (agent.isRunning && hasSession) {
      agent.detach()
    }

    if (!launchingWithoutSession) {
      agent.clear()
      setExecCtx(null)
    }

    setPhase('idle')
    setSelectedCase(null)
    setCronPending(null)
    setCandidate(null)
    setGenericPlan(null)
    setErrorMsg('')
    handledActionRef.current = null
    void refreshBackgroundTasks()
  }, [agent.clear, agent.detach, agent.isRunning, agent.sessionId, phase, refreshBackgroundTasks])

  const handleResumeBackgroundTask = useCallback((task: RunningTaskBrief) => {
    navigate(`/history/${encodeURIComponent(task.sessionId)}`)
  }, [navigate])

  const handleCapabilityCreated = useCallback((created: {
    type: 'skill'
    id: string
    originQuery?: string
  }) => {
    setPhase('routing')
    const query = stripAttachmentMarkers(created.originQuery || execCtx?.originQuery || execCtx?.query || '')
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('capability:changed', {
        detail: {
          primary: { type: created.type, id: created.id },
          artifacts: [{ type: created.type, id: created.id }],
          originQuery: query,
        },
      }))
    }
    navigate(buildExecutePath(created.id, query, execCtx?.attachmentIds || [], {
      converseSid: converse.sessionId || undefined,
    }), {
      state: {
        handoffQuery: buildAssistantHandoffQuery({
          bossRequest: query,
          assigneeName: getCapabilityName(created.id),
          mode: 'employee',
          preparedTask: query,
        }),
        originQuery: query,
        converseSessionId: converse.sessionId || undefined,
      },
    })
  }, [converse.sessionId, execCtx?.attachmentIds, execCtx?.originQuery, execCtx?.query, navigate, getCapabilityName])

  if (phase === 'idle') {
    return <IdleView
      userName={displayUserName}
      onExecute={handleExecute}
      selectedCase={selectedCase}
      onSelectCase={setSelectedCase}
      cronPending={cronPending}
      onCronConfirm={handleCronConfirm}
      onCronCancel={() => setCronPending(null)}
      backgroundTasks={backgroundTasks}
      onResumeTask={handleResumeBackgroundTask}
    />
  }

  if (phase === 'analyzing') {
    return <ConversationPanel
      messages={converse.messages}
      onSend={converse.sendMessage}
      onRegenerate={converse.regenerateMessage}
      onSelectVariant={converse.selectVariant}
      onStop={converse.stop}
      pendingQuestion={converse.pendingQuestion}
      respondToQuestion={converse.respondToQuestion}
      isThinking={converse.isThinking}
      error={converse.error}
      regeneratingMessageId={converse.regeneratingMessageId}
      onBack={handleNewTask}
      activeWidget={converse.activeWidget}
      onCloseWidget={() => converse.setActiveWidget(null)}
      onWidgetFallbackToText={() => {
        converse.setActiveWidget(null)
        void converse.sendMessage('[请改为文本解释]')
      }}
      onShowWidget={converse.showWidget}
      onExpandWidget={converse.expandWidget}
      streamingWidget={converse.streamingWidget}
      onVisualizeMessage={canRenderWidgets
        ? (content) => {
          void converse.sendMessage([
            '请把下面这段内容改成当前对话里直接渲染的交互式可视化组件。',
            '要求：',
            '- 这是直接解释，不是执行任务。',
            '- 不要推荐 skill，不要输出 LABORANY_ACTION。',
            '- 不要写文件，不要打开浏览器，不要用 ASCII 图代替。',
            '- 如果当前会话提供 mcp__generative-ui__load_guidelines 和 mcp__generative-ui__show_widget，请直接调用。',
            '- 如果最终无法渲染 widget，就直接给出简洁文本图解，不要暴露内部工具限制。',
            '',
            '原内容：',
            content,
          ].join('\n'))
        }
        : undefined}
      mcpNotice={converse.mcpNotice}
      onWidgetInteraction={(_widgetId, data) => {
        const text = `[来自组件交互]\n${JSON.stringify(data, null, 2)}`
        void converse.sendMessage(text)
      }}
      assistantHint={getAssistantPhaseHint(phase)}
    />
  }

  if (phase === 'candidate_found' && candidate) {
    const displayName = candidate.variant === 'recommend' && candidate.targetId
      ? getCapabilityName(candidate.targetId)
      : '联系 HR 招聘新同事'
    return <CandidateConfirmView
      targetName={displayName}
      reason={candidate.reason}
      confidence={candidate.confidence}
      matchType={candidate.matchType}
      onConfirm={handleCandidateConfirm}
      onReject={handleCandidateReject}
      onBack={handleNewTask}
    />
  }

  if (phase === 'plan_review' && genericPlan) {
    return <PlanReviewPanel
      planSteps={genericPlan.planSteps}
      onApprove={() => {
        const planText = genericPlan.planSteps
          .map((step, idx) => `${idx + 1}. ${step}`)
          .join('\n')
        const executionQuery = planText
          ? [
            genericPlan.query,
            '',
            '[执行计划]',
            planText,
            '',
            '请按照这个计划执行，必要时可优化并说明调整原因。',
          ].join('\n')
          : genericPlan.query
        setExecCtx({
          type: 'skill',
          id: '__generic__',
          query: genericPlan.originQuery,
          originQuery: genericPlan.originQuery,
          attachmentIds: genericPlan.attachmentIds,
          handoffQuery: buildAssistantHandoffQuery({
            bossRequest: genericPlan.originQuery,
            mode: 'assistant',
            planSteps: genericPlan.planSteps,
            preparedTask: stripAttachmentMarkers(executionQuery),
          }),
        })
        setPhase('executing')
        setGenericPlan(null)
      }}
      onEdit={() => {
        setPhase('analyzing')
        setGenericPlan(null)
      }}
      onCancel={handleNewTask}
    />
  }

  if (phase === 'error') {
    return <ErrorView
      message={errorMsg || '服务异常，请稍后重试'}
      onRetry={handleNewTask}
      onBack={handleNewTask}
    />
  }

  if (phase === 'installing') {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">正在为公司办理新同事入职...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      {phase === 'fallback_general' && (
        <div className="px-6 pt-4">
          <FallbackBanner />
        </div>
      )}
      <div className="flex-1">
        <SkillExecutingView
          agent={agent}
          execCtx={execCtx!}
          displayTitle={getCapabilityName(execCtx?.id || '')}
          phase={phase}
          onPhaseChange={setPhase}
          onBack={handleBackFromExecution}
          onNewTask={handleNewTask}
          onCapabilityCreated={handleCapabilityCreated}
          onError={(msg) => { setErrorMsg(msg); setPhase('error') }}
          activeWidget={agent.activeWidget}
          onCloseWidget={() => agent.setActiveWidget(null)}
          onWidgetInteraction={(_widgetId, data) => {
            const text = `[来自组件交互]\n${JSON.stringify(data, null, 2)}`
            void agent.execute(text)
          }}
          onWidgetFallbackToText={() => {
            agent.setActiveWidget(null)
            void agent.execute('[请改为文本解释]')
          }}
          onShowWidget={agent.showWidget}
        />
      </div>
    </div>
  )
}

function IdleView({ userName, onExecute, selectedCase, onSelectCase, cronPending, onCronConfirm, onCronCancel, backgroundTasks, onResumeTask }: {
  userName?: string
  onExecute: (targetId: string, query: string, files?: File[]) => void | Promise<void>
  selectedCase: QuickStartItem | null
  onSelectCase: (item: QuickStartItem) => void
  cronPending: CronPending | null
  onCronConfirm: (next: CronPending) => Promise<void>
  onCronCancel: () => void
  backgroundTasks: RunningTaskBrief[]
  onResumeTask: (task: RunningTaskBrief) => void
}) {
  const todayWorkCount = backgroundTasks.length + (cronPending ? 1 : 0)

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary/80 mb-3">
              老板办公桌
            </p>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              {userName || '老板'}，今天想让公司先处理什么事？
            </h1>
            <p className="text-muted-foreground text-sm leading-6">
              直接把需求交给个人助理。简单的事务助理会自己处理，复杂或更专业的工作会先帮你确认清楚，再安排给合适的同事执行。
            </p>
          </div>

          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
            <p className="text-sm font-semibold text-foreground mb-4">今日概览</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-background px-4 py-3">
                <p className="text-xs text-muted-foreground">进行中的工作</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{backgroundTasks.length}</p>
              </div>
              <div className="rounded-xl border border-border bg-background px-4 py-3">
                <p className="text-xs text-muted-foreground">今日安排</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{todayWorkCount}</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-dashed border-primary/30 bg-background/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">助理提示</p>
              <p className="mt-1 text-sm text-foreground">
                尽量一次把目标、截止时间、参考材料和你希望看到的结果说清楚，助理会更容易一次性安排到位。
              </p>
            </div>
          </div>
        </div>

        {backgroundTasks.length > 0 && (
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">公司里还有同事正在处理工作</p>
              <span className="text-xs text-muted-foreground">{backgroundTasks.length} 项</span>
            </div>
            <div className="space-y-2">
              {backgroundTasks.map((task) => (
                <button
                  key={task.sessionId}
                  type="button"
                  onClick={() => onResumeTask(task)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-accent/40"
                >
                  <p className="text-sm font-medium text-foreground">
                    {task.skillName || task.query || task.skillId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {`${getTaskSourceLabel(task.source)} · 工单 ${task.sessionId.slice(0, 12)}... · 点击查看进展`}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
        <ScenarioCards
          selectedId={selectedCase?.id}
          onSelect={onSelectCase}
        />
        <ChatInput
          onSubmit={(query, files) => onExecute(selectedCase?.targetId || '', query, files)}
          onStop={() => {}}
          isRunning={false}
          variant="home"
          placeholder={selectedCase
            ? `把这项工作交给助理，助理会安排：${selectedCase.name}`
            : '直接告诉个人助理：你想让公司帮你完成什么工作...'
          }
          autoFocus
        />
        <GuideBanner />
        {cronPending && (
            <CronSetupCard
              schedule={cronPending.schedule}
              targetQuery={cronPending.targetQuery}
              targetId={cronPending.targetId}
              onConfirm={onCronConfirm}
            onCancel={onCronCancel}
          />
        )}
      </div>
    </div>
  )
}
