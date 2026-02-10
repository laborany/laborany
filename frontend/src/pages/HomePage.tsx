/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      首页 - 对话式总控助手                               ║
 * ║                                                                        ║
 * ║  状态机：idle → conversing → plan_review → executing → done           ║
 * ║                                                                        ║
 * ║  idle        ：欢迎语 + HomeChat 输入框 + 引导横幅                     ║
 * ║  conversing  ：多轮对话（理解任务 → 匹配 skill → 询问用户）            ║
 * ║  plan_review ：执行计划审核（planSteps 展示 + 批准/修改/取消）         ║
 * ║  executing   ：三面板 ExecutionPanel 内联执行                           ║
 * ║  done        ：执行结果 + "新任务" 按钮                                ║
 * ║                                                                        ║
 * ║  执行模式：skill（useAgent）| workflow（useWorkflowRun）               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useAgent } from '../hooks/useAgent'
import { useWorkflowRun } from '../hooks/useWorkflowRun'
import { useConverse } from '../hooks/useConverse'
import { useCronJobs } from '../hooks/useCron'
import { useSkillNameMap } from '../hooks/useSkillNameMap'
import { type QuickStartItem } from '../contexts/QuickStartContext'
import { GuideBanner } from '../components/home/GuideBanner'
import { ScenarioCards } from '../components/home/ScenarioCards'
import { HomeChat } from '../components/home/chat/HomeChat'
import { ConversationPanel, type DecisionPrompt } from '../components/home/ConversationPanel'
import { CronSetupCard } from '../components/execution'
import { SkillExecutingView, WorkflowExecutingView, type HomePhase, type ExecutionContext } from '../components/home/ExecutingViews'
import { PlanReviewPanel } from '../components/home/PlanReviewPanel'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           本地接口定义                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/** 定时任务待确认数据 */
interface CronPending {
  schedule: string
  timezone?: string
  name?: string
  targetQuery: string
  targetType: 'skill' | 'workflow'
  targetId: string
}

interface PendingDecision {
  action:
    | 'recommend_capability'
    | 'create_capability'
    | 'execute_generic'
    | 'setup_schedule'
  payload: {
    type?: 'skill' | 'workflow'
    id?: string
    query?: string
    mode?: 'skill' | 'workflow'
    cronExpr?: string
    tz?: string
    targetQuery?: string
    name?: string
    targetType?: 'skill' | 'workflow'
    targetId?: string
  }
}

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                           主组件                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */
export default function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { getSkillName, getWorkflowName } = useSkillNameMap()
  const [phase, setPhase] = useState<HomePhase>('idle')
  const [execCtx, setExecCtx] = useState<ExecutionContext | null>(null)
  const [cronPending, setCronPending] = useState<CronPending | null>(null)
  const [selectedCase, setSelectedCase] = useState<QuickStartItem | null>(null)
  const [pendingDecision, setPendingDecision] = useState<PendingDecision | null>(null)
  const [planSteps, setPlanSteps] = useState<string[]>([])
  const handledActionRef = useRef<string | null>(null)

  /* ── Hooks ── */
  const skillId = execCtx?.type === 'skill' ? execCtx.id : ''
  const workflowId = execCtx?.type === 'workflow' ? execCtx.id : ''
  const agent = useAgent(skillId)
  const wfRun = useWorkflowRun(workflowId)
  const converse = useConverse()
  const { createJob } = useCronJobs()

  useEffect(() => {
    if (!converse.action) {
      handledActionRef.current = null
    }
  }, [converse.action])

  /* ────────────────────────────────────────────────────────────────────────
   *  HomeChat 回调：有 skillId 直接跳转，否则进入对话阶段
   * ──────────────────────────────────────────────────────────────────────── */
  const handleExecute = useCallback((targetId: string, query: string, targetType: 'skill' | 'workflow' = 'skill') => {
    if (execCtx) {
      const sameTarget = targetId
        && execCtx.id === targetId
        && execCtx.type === targetType
      if (!sameTarget) {
        setExecCtx(null)
      }
    }

    if (phase === 'executing') {
      setPhase('conversing')
    }

    if (targetId) {
      if (targetType === 'workflow') {
        navigate(`/workflow-run/${targetId}?q=${encodeURIComponent(query)}`)
        return
      }
      navigate(`/execute/${targetId}?q=${encodeURIComponent(query)}`)
      return
    }
    setPhase('conversing')
    converse.sendMessage(query)
  }, [navigate, converse.sendMessage, phase, execCtx])

  /* ────────────────────────────────────────────────────────────────────────
   *  监听 converse action → 策略表分发
   * ──────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!converse.action) return
    if (converse.pendingQuestion) return
    const a = converse.action
    const actionKey = JSON.stringify(a)
    if (handledActionRef.current === actionKey) return
    handledActionRef.current = actionKey

    const resolveRecommend = (): { type: 'skill' | 'workflow'; id: string; query: string } | null => {
      if (a.action === 'recommend_capability') {
        if (!a.targetType || !a.targetId || !a.query) return null
        return { type: a.targetType, id: a.targetId, query: a.query }
      }
      if (a.action === 'navigate_skill') {
        if (!a.skillId || !a.query) return null
        return { type: 'skill', id: a.skillId, query: a.query }
      }
      if (a.action === 'navigate_workflow') {
        if (!a.workflowId || !a.query) return null
        return { type: 'workflow', id: a.workflowId, query: a.query }
      }
      return null
    }

    const recommended = resolveRecommend()
    if (recommended) {
      /* ── 直接跳转，不再弹确认卡片 ── */
      const sid = converse.sessionId || ''
      if (recommended.type === 'workflow') {
        navigate(`/workflow-run/${recommended.id}?q=${encodeURIComponent(recommended.query)}`)
      } else {
        navigate(`/execute/${recommended.id}?q=${encodeURIComponent(recommended.query)}&sid=${sid}`)
      }
      return
    }

    if (a.action === 'execute_generic') {
      const query = a.query || ''
      const steps = a.planSteps || []
      setPendingDecision({ action: 'execute_generic', payload: { query } })
      setPlanSteps(steps)
      return
    }

    if (a.action === 'create_capability' || a.action === 'create_skill') {
      const query = a.seedQuery || a.query || ''
      setPendingDecision({
        action: 'create_capability',
        payload: {
          mode: a.mode || 'skill',
          query,
        },
      })
      return
    }

    if (a.action === 'setup_schedule' || a.action === 'setup_cron') {
      const cronExpr = a.cronExpr || a.cronSchedule || ''
      const targetQuery = a.targetQuery || a.cronTargetQuery || a.query || ''
      const targetType = a.targetType
      const targetId = a.targetId

      if (!cronExpr || !targetQuery || !targetType || !targetId) {
        return
      }

      setPendingDecision({
        action: 'setup_schedule',
        payload: {
          cronExpr,
          tz: a.tz,
          name: a.name,
          targetQuery,
          targetType,
          targetId,
        },
      })
    }
  }, [converse.action, converse.pendingQuestion, converse.sessionId, navigate])

  useEffect(() => {
    if (!converse.pendingQuestion) return
    setPendingDecision(null)
  }, [converse.pendingQuestion])

  const applyDecision = useCallback((decision: PendingDecision) => {
    if (decision.action === 'create_capability') {
      const query = decision.payload.query || ''
      const mode = decision.payload.mode || 'skill'
      const creatorSeed = mode === 'workflow'
        ? `请优先基于以下需求创建可复用 workflow，并在完成后返回可运行入口：\n${query}`
        : query
      setExecCtx({
        type: 'skill',
        id: 'skill-creator',
        query: creatorSeed,
        originQuery: query,
      })
      setPhase('executing')
      return
    }

    if (decision.action === 'execute_generic') {
      const query = decision.payload.query || ''
      if (planSteps.length > 0) {
        setPhase('plan_review')
      } else {
        setExecCtx({ type: 'skill', id: '__generic__', query })
        setPhase('executing')
      }
      return
    }

    if (decision.action === 'setup_schedule') {
      const targetType = decision.payload.targetType
      const targetId = decision.payload.targetId
      const targetQuery = decision.payload.targetQuery
      const schedule = decision.payload.cronExpr

      if (!targetType || !targetId || !targetQuery || !schedule) {
        return
      }

      setCronPending({
        schedule,
        timezone: decision.payload.tz,
        name: decision.payload.name,
        targetQuery,
        targetType,
        targetId,
      })
      setPhase('idle')
    }
  }, [navigate])

  const handleDecision = useCallback((key: string) => {
    if (!pendingDecision) return

    if (key === 'confirm') {
      applyDecision(pendingDecision)
      setPendingDecision(null)
      return
    }

    if (key === 'generic') {
      setPendingDecision(null)
      setExecCtx({ type: 'skill', id: '__generic__', query: pendingDecision.payload.query || '' })
      setPhase('executing')
      return
    }

    if (key === 'ask_more') {
      setPendingDecision(null)
      return
    }

    setPendingDecision(null)
  }, [applyDecision, pendingDecision])

  const decisionPrompt: DecisionPrompt | null = (() => {
    if (!pendingDecision) return null

    if (pendingDecision.action === 'create_capability') {
      const modeLabel = pendingDecision.payload.mode === 'workflow' ? 'workflow' : 'skill'
      return {
        title: '需要创建新技能/流程吗？',
        description: `将进入 creator，优先沉淀为${modeLabel}；创建成功后会自动跳转到新能力。`,
        actions: [
          { key: 'confirm', label: '立即创建', variant: 'primary' },
          { key: 'generic', label: '先用通用技能', variant: 'secondary' },
          { key: 'ask_more', label: '再聊两句', variant: 'ghost' },
        ],
      }
    }

    if (pendingDecision.action === 'execute_generic') {
      return {
        title: '这个需求更适合先用通用技能执行。',
        description: '如你愿意，后续可一键沉淀为新技能或工作流。',
        actions: [
          { key: 'confirm', label: '开始执行', variant: 'primary' },
          { key: 'ask_more', label: '继续确认', variant: 'ghost' },
        ],
      }
    }

    return {
      title: '检测到定时任务意图，是否创建？',
      description: `${pendingDecision.payload.cronExpr || ''}\n将先进入可编辑确认卡，再创建任务。`,
      actions: [
        { key: 'confirm', label: '创建定时任务', variant: 'primary' },
        { key: 'ask_more', label: '继续确认', variant: 'ghost' },
      ],
    }
  })()

  /* ────────────────────────────────────────────────────────────────────────
   *  定时任务确认
   * ──────────────────────────────────────────────────────────────────────── */
  const handleCronConfirm = useCallback(async (next: CronPending) => {
    await createJob({
      name: next.name || next.targetQuery.slice(0, 50) || '定时任务',
      description: next.targetQuery,
      schedule: {
        kind: 'cron',
        expr: next.schedule,
        tz: next.timezone,
      },
      target: {
        type: next.targetType,
        id: next.targetId,
        query: next.targetQuery,
      },
    })
    setCronPending(null)
  }, [createJob])

  const handleCronCancel = useCallback(() => setCronPending(null), [])

  /* ────────────────────────────────────────────────────────────────────────
   *  返回首页（重置一切）
   * ──────────────────────────────────────────────────────────────────────── */
  const handleNewTask = useCallback(() => {
    agent.clear()
    wfRun.clear()
    converse.reset()
    setPhase('idle')
    setSelectedCase(null)
    setExecCtx(null)
    setCronPending(null)
    setPendingDecision(null)
    setPlanSteps([])
    handledActionRef.current = null
  }, [agent.clear, wfRun.clear, converse.reset])

  const handleCapabilityCreated = useCallback((created: {
    type: 'skill' | 'workflow'
    id: string
    originQuery?: string
  }) => {
    const query = created.originQuery || execCtx?.originQuery || execCtx?.query || ''
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('capability:changed', {
        detail: {
          primary: { type: created.type, id: created.id },
          artifacts: [{ type: created.type, id: created.id }],
          originQuery: query,
        },
      }))
    }
    if (created.type === 'workflow') {
      navigate(`/workflow-run/${created.id}?q=${encodeURIComponent(query)}`)
      return
    }
    navigate(`/execute/${created.id}?q=${encodeURIComponent(query)}`)
  }, [execCtx?.originQuery, execCtx?.query, navigate])

  /* ── idle 阶段 ── */
  if (phase === 'idle') {
    return <IdleView
      userName={user?.name}
      onExecute={handleExecute}
      selectedCase={selectedCase}
      onSelectCase={setSelectedCase}
      onClearSelectedCase={() => setSelectedCase(null)}
      cronPending={cronPending}
      onCronConfirm={handleCronConfirm}
      onCronCancel={handleCronCancel}
    />
  }

  /* ── conversing 阶段 ── */
  if (phase === 'conversing') {
    return <ConversationPanel
      messages={converse.messages}
      onSend={converse.sendMessage}
      onStop={converse.stop}
      pendingQuestion={converse.pendingQuestion}
      respondToQuestion={converse.respondToQuestion}
      isThinking={converse.isThinking}
      error={converse.error}
      decisionPrompt={decisionPrompt}
      onDecision={handleDecision}
      onBack={handleNewTask}
      stateSummary={converse.state}
    />
  }

  /* ── plan_review 阶段 ── */
  if (phase === 'plan_review') {
    return <PlanReviewPanel
      planSteps={planSteps}
      onApprove={() => {
        const query = pendingDecision?.payload.query || planSteps.join('\n')
        setExecCtx({ type: 'skill', id: '__generic__', query })
        setPhase('executing')
        setPendingDecision(null)
        setPlanSteps([])
      }}
      onEdit={() => {
        setPhase('conversing')
        setPlanSteps([])
      }}
      onCancel={handleNewTask}
    />
  }

  /* ── executing / done 阶段：按执行类型分发 ── */
  if (execCtx?.type === 'workflow') {
    return <WorkflowExecutingView
      wfRun={wfRun}
      execCtx={execCtx}
      displayTitle={getWorkflowName(execCtx.id)}
      phase={phase}
      onPhaseChange={setPhase}
      onNewTask={handleNewTask}
    />
  }

  return <SkillExecutingView
    agent={agent}
    execCtx={execCtx!}
    displayTitle={getSkillName(execCtx!.id)}
    phase={phase}
    onPhaseChange={setPhase}
    onNewTask={handleNewTask}
    onCapabilityCreated={handleCapabilityCreated}
  />
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      IdleView - 首页空闲态                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function IdleView({ userName, onExecute, selectedCase, onSelectCase, onClearSelectedCase, cronPending, onCronConfirm, onCronCancel }: {
  userName?: string
  onExecute: (targetId: string, query: string, targetType?: 'skill' | 'workflow') => void
  selectedCase: QuickStartItem | null
  onSelectCase: (item: QuickStartItem) => void
  onClearSelectedCase: () => void
  cronPending: CronPending | null
  onCronConfirm: (next: CronPending) => Promise<void>
  onCronCancel: () => void
}) {
  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">
            {userName || '用户'}，有什么可以帮你？
          </h1>
          <p className="text-muted-foreground text-sm">
            直接描述你的任务，我来帮你完成
          </p>
        </div>
        <ScenarioCards
          selectedId={selectedCase?.id}
          onSelect={onSelectCase}
        />
        <HomeChat
          onExecute={onExecute}
          selectedCase={selectedCase}
          onClearSelectedCase={onClearSelectedCase}
        />
        <GuideBanner />
        {cronPending && (
          <CronSetupCard
            schedule={cronPending.schedule}
            timezone={cronPending.timezone}
            targetQuery={cronPending.targetQuery}
            targetType={cronPending.targetType}
            targetId={cronPending.targetId}
            onConfirm={onCronConfirm}
            onCancel={onCronCancel}
          />
        )}
      </div>
    </div>
  )
}
