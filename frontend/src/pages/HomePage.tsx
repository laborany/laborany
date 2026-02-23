import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useAgent } from '../hooks/useAgent'
import { useConverse, type ConverseAction } from '../hooks/useConverse'
import { useCronJobs } from '../hooks/useCron'
import { useSkillNameMap } from '../hooks/useSkillNameMap'
import { type QuickStartItem } from '../contexts/QuickStartContext'
import { API_BASE } from '../config'
import { GuideBanner } from '../components/home/GuideBanner'
import { ScenarioCards } from '../components/home/ScenarioCards'
import ChatInput from '../components/shared/ChatInput'
import { setPendingFiles } from '../utils/pendingFiles'
import { ConversationPanel, type DecisionPrompt } from '../components/home/ConversationPanel'
import { CronSetupCard } from '../components/execution'
import { SkillExecutingView, type HomePhase, type ExecutionContext } from '../components/home/ExecutingViews'
import { PlanReviewPanel } from '../components/home/PlanReviewPanel'
import { CandidateConfirmView, FallbackBanner, ErrorView } from '../components/home/DispatchViews'

const FILE_IDS_MARKER_RE = /\[(?:LABORANY_FILE_IDS|已上传文件 ID|Uploaded file IDs?)\s*:\s*([^\]]+)\]/gi

interface CandidateInfo {
  variant: 'recommend' | 'create'
  targetId?: string
  query: string
  reason?: string
  confidence?: number
  matchType?: 'exact' | 'candidate'
}

interface GenericExecutionPlan {
  query: string
  originQuery: string
  planSteps: string[]
}

interface CronPending {
  schedule: string
  timezone?: string
  name?: string
  targetQuery: string
  targetId: string
}

interface RunningTaskBrief {
  sessionId: string
  skillId: string
  skillName: string
  startedAt: string
  source?: 'runtime' | 'converse'
  query?: string
}

export default function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { getCapabilityName } = useSkillNameMap()
  const cachedProfileName = typeof window !== 'undefined'
    ? (localStorage.getItem('laborany.profile.name') || '').trim()
    : ''
  const displayUserName = user?.name?.trim() || cachedProfileName

  const [phase, setPhase] = useState<HomePhase>('idle')
  const [execCtx, setExecCtx] = useState<ExecutionContext | null>(null)
  const [cronPending, setCronPending] = useState<CronPending | null>(null)
  const [selectedCase, setSelectedCase] = useState<QuickStartItem | null>(null)
  const [candidate, setCandidate] = useState<CandidateInfo | null>(null)
  const [genericPlan, setGenericPlan] = useState<GenericExecutionPlan | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [scheduleDecision, setScheduleDecision] = useState<DecisionPrompt | null>(null)
  const [scheduleAction, setScheduleAction] = useState<ConverseAction | null>(null)
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

  const appendSessionFilesMarker = useCallback((rawQuery: string): string => {
    const query = rawQuery.trim()
    if (!query) return query

    const fileIds = converse.sessionFileIds
    if (!fileIds.length) return query

    const cleaned = query.replace(FILE_IDS_MARKER_RE, '').trim()
    return `${cleaned}\n\n[LABORANY_FILE_IDS: ${fileIds.join(', ')}]`
  }, [converse.sessionFileIds])

  const handleExecute = useCallback((targetId: string, query: string, files?: File[]) => {
    latestUserQueryRef.current = query
    if (targetId) {
      if (files && files.length > 0) setPendingFiles(files)
      navigate(`/execute/${targetId}?q=${encodeURIComponent(query)}`)
      return
    }
    setPhase('analyzing')
    converse.sendMessage(query, files)
  }, [navigate, converse.sendMessage])

  useEffect(() => {
    if (!converse.action || converse.pendingQuestion) return
    const action = converse.action
    const actionKey = JSON.stringify(action)
    if (handledActionRef.current === actionKey) return
    handledActionRef.current = actionKey

    if (action.action === 'recommend_capability' && action.targetId && action.query) {
      setCandidate({
        variant: 'recommend',
        targetId: action.targetId,
        query: appendSessionFilesMarker(action.query),
        reason: action.reason,
        confidence: action.confidence,
        matchType: action.matchType,
      })
      setPhase('candidate_found')
      return
    }

    if (action.action === 'execute_generic') {
      const originQuery = latestUserQueryRef.current || action.query || ''
      const query = appendSessionFilesMarker(action.query || originQuery)
      if (action.planSteps && action.planSteps.length > 0) {
        setGenericPlan({ query, originQuery, planSteps: action.planSteps })
        setPhase('plan_review')
      } else {
        setExecCtx({ type: 'skill', id: '__generic__', query, originQuery })
        setPhase('fallback_general')
      }
      return
    }

    if (action.action === 'create_capability') {
      const seedQuery = action.seedQuery || action.query || latestUserQueryRef.current || ''
      setCandidate({ variant: 'create', query: appendSessionFilesMarker(seedQuery), reason: action.reason })
      setPhase('candidate_found')
      return
    }

    if (action.action === 'setup_schedule') {
      const cronExpr = action.cronExpr || ''
      const targetQuery = action.targetQuery || action.query || ''
      const targetId = action.targetId
      if (!cronExpr || !targetQuery || !targetId) return

      setScheduleAction(action)
      setScheduleDecision({
        title: '检测到定时任务意图，是否创建？',
        description: `${cronExpr}\n将先进入可编辑确认卡，再创建任务。`,
        actions: [
          { key: 'confirm', label: '创建定时任务', variant: 'primary' },
          { key: 'ask_more', label: '继续确认', variant: 'ghost' },
        ],
      })
    }
  }, [appendSessionFilesMarker, converse.action, converse.pendingQuestion])

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
    setScheduleDecision(null)
    setScheduleAction(null)
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

  useEffect(() => {
    if (converse.pendingQuestion) {
      setScheduleDecision(null)
      setScheduleAction(null)
    }
  }, [converse.pendingQuestion])

  const handleCandidateConfirm = useCallback(() => {
    if (!candidate) return

    if (candidate.variant === 'recommend' && candidate.targetId) {
      // converse 的 sessionId 不是 runtime 任务会话，不应作为执行页 sid 传入。
      navigate(`/execute/${candidate.targetId}?q=${encodeURIComponent(candidate.query)}`)
      return
    }

    if (candidate.variant === 'create') {
      setExecCtx({
        type: 'skill',
        id: 'skill-creator',
        query: appendSessionFilesMarker(candidate.query),
        originQuery: latestUserQueryRef.current || candidate.query,
      })
      setPhase('creating_proposal')
    }
  }, [appendSessionFilesMarker, candidate, navigate])

  const handleCandidateReject = useCallback(() => {
    const query = appendSessionFilesMarker(candidate?.query || '')
    setCandidate(null)
    setExecCtx({
      type: 'skill',
      id: '__generic__',
      query,
      originQuery: latestUserQueryRef.current || query,
    })
    setPhase('fallback_general')
  }, [appendSessionFilesMarker, candidate])

  const handleScheduleDecision = useCallback((key: string) => {
    if (key === 'confirm' && scheduleAction) {
      const cronExpr = scheduleAction.cronExpr || ''
      const targetQuery = scheduleAction.targetQuery || scheduleAction.query || ''
      const targetId = scheduleAction.targetId || ''
      setCronPending({
        schedule: cronExpr,
        timezone: scheduleAction.tz,
        name: scheduleAction.name,
        targetQuery,
        targetId,
      })
      setPhase('idle')
    }
    setScheduleDecision(null)
    setScheduleAction(null)
  }, [scheduleAction])

  const handleCronConfirm = useCallback(async (next: CronPending) => {
    await createJob({
      name: next.name || next.targetQuery.slice(0, 50) || '定时任务',
      description: next.targetQuery,
      schedule: { kind: 'cron', expr: next.schedule, tz: next.timezone },
      target: { type: 'skill', id: next.targetId, query: next.targetQuery },
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
    setScheduleDecision(null)
    setScheduleAction(null)
    handledActionRef.current = null
  }, [agent.clear, converse.reset])

  const handleBackFromExecution = useCallback(() => {
    // 任务启动期也要允许返回首页并继续后台运行；尚未拿到 sessionId 时避免提前中断。
    const hasSession = Boolean(agent.sessionId)
    const isExecutionPhase =
      phase === 'executing'
      || phase === 'fallback_general'
      || phase === 'creating_proposal'
      || phase === 'creating_confirm'
      || phase === 'installing'
      || phase === 'routing'
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
    setScheduleDecision(null)
    setScheduleAction(null)
    handledActionRef.current = null
    void refreshBackgroundTasks()
  }, [agent.clear, agent.detach, agent.isRunning, agent.sessionId, phase, refreshBackgroundTasks])

  const handleResumeBackgroundTask = useCallback((task: RunningTaskBrief) => {
    if (task.source === 'converse' || task.skillId === '__converse__') {
      void resumeConverseSession(task.sessionId)
      return
    }
    navigate(`/execute/${task.skillId}?sid=${encodeURIComponent(task.sessionId)}`)
  }, [navigate, resumeConverseSession])

  const handleCapabilityCreated = useCallback((created: {
    type: 'skill'
    id: string
    originQuery?: string
  }) => {
    setPhase('routing')
    const query = appendSessionFilesMarker(created.originQuery || execCtx?.originQuery || execCtx?.query || '')
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('capability:changed', {
        detail: {
          primary: { type: created.type, id: created.id },
          artifacts: [{ type: created.type, id: created.id }],
          originQuery: query,
        },
      }))
    }
    navigate(`/execute/${created.id}?q=${encodeURIComponent(query)}`)
  }, [appendSessionFilesMarker, execCtx?.originQuery, execCtx?.query, navigate])

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
      onStop={converse.stop}
      pendingQuestion={converse.pendingQuestion}
      respondToQuestion={converse.respondToQuestion}
      isThinking={converse.isThinking}
      error={converse.error}
      decisionPrompt={scheduleDecision}
      onDecision={handleScheduleDecision}
      onBack={handleNewTask}
      stateSummary={converse.state}
    />
  }

  if (phase === 'candidate_found' && candidate) {
    const displayName = candidate.variant === 'recommend' && candidate.targetId
      ? getCapabilityName(candidate.targetId)
      : '创建新技能'
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
          query: appendSessionFilesMarker(executionQuery),
          originQuery: genericPlan.originQuery,
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
          <span className="text-sm text-muted-foreground">正在安装新能力...</span>
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
        />
      </div>
    </div>
  )
}

function IdleView({ userName, onExecute, selectedCase, onSelectCase, cronPending, onCronConfirm, onCronCancel, backgroundTasks, onResumeTask }: {
  userName?: string
  onExecute: (targetId: string, query: string, files?: File[]) => void
  selectedCase: QuickStartItem | null
  onSelectCase: (item: QuickStartItem) => void
  cronPending: CronPending | null
  onCronConfirm: (next: CronPending) => Promise<void>
  onCronCancel: () => void
  backgroundTasks: RunningTaskBrief[]
  onResumeTask: (task: RunningTaskBrief) => void
}) {
  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">
            {userName || '用户'}，有什么可以帮你？
          </h1>
          <p className="text-muted-foreground text-sm">
            直接描述你的任务，我来帮你完成。
          </p>
        </div>
        {backgroundTasks.length > 0 && (
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">后台仍有运行中的任务</p>
              <span className="text-xs text-muted-foreground">{backgroundTasks.length} 个</span>
            </div>
            <div className="space-y-2">
              {backgroundTasks.slice(0, 3).map((task) => (
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
                    {task.skillId === '__converse__'
                      ? `分派会话: ${task.sessionId.slice(0, 12)}... · 点击继续对话`
                      : `会话: ${task.sessionId.slice(0, 12)}... · 点击继续查看`}
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
            ? `向 ${selectedCase.name} 描述你的任务...`
            : '描述你想完成的任务...'
          }
          autoFocus
        />
        <GuideBanner />
        {cronPending && (
          <CronSetupCard
            schedule={cronPending.schedule}
            timezone={cronPending.timezone}
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
