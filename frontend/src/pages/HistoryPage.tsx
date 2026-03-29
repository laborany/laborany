
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAgent, type PendingQuestion } from '../hooks/useAgent'
import { useConverse } from '../hooks/useConverse'
import { useSkillNameMap } from '../hooks/useSkillNameMap'
import type { AgentMessage, TaskFile, SessionDetail, SessionLiveStatus, WidgetState, WorkDetailResponse, WorkSummary } from '../types'
import { API_BASE } from '../config'
import { ExecutionPanel } from '../components/execution'
import { Tooltip } from '../components/ui'
import {
  appendMessageWithVariants,
  applyVariantSelections,
  loadStoredVariantSelections,
} from '../lib/messageVariants'
import {
  buildQuestionResponsePayload,
  buildQuestionResponseText,
  inferQuestionContextFromQuestions,
  normalizeQuestionContext,
} from '../lib/question-response'
import { isControlInstructionText } from '../lib/workRecords'
import { ConversationWorkspaceView } from '../components/shared/ConversationWorkspaceView'
import { WorkDetailHeader } from '../components/shared/WorkDetailHeader'

export default function HistoryPage() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSessions()
  }, [])

  async function fetchSessions() {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      await res.json()
    } catch {
      // 忽略错误
    } finally {
      setLoading(false)
    }
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
    <div className="flex h-[calc(100vh-64px)] min-w-0 flex-1 flex-col">
      <div className="border-b border-border px-6 py-5">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-foreground">工作记录</h2>
          <p className="text-sm text-muted-foreground">
            左侧常驻展示最近工作，点击任意一项后，可在这里查看完整协作过程、交付结果与后续动作。
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-8">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <svg className="h-8 w-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6a2 2 0 012-2h6m0 0V3m0 6l-7 7-4-4" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-foreground">选择一项工作</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            从左侧最近工作中选择一条记录，这里会显示该工作的协作过程、负责人、产物和可继续推进的会话。
          </p>
        </div>
      </div>
    </div>
  )
}

function normalizeMessageContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim()
}

function toTimestampMs(message: AgentMessage): number | null {
  const value = message.timestamp?.getTime?.()
  if (!Number.isFinite(value)) return null
  return value
}

function summarizeToolInput(toolInput?: Record<string, unknown>): string {
  if (!toolInput) return ''
  const keys = ['file_path', 'path', 'command', 'pattern', 'url', 'query', 'description']
  const parts = keys
    .map((key) => toolInput[key])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => normalizeMessageContent(value).slice(0, 120))

  return parts.join('|')
}

function buildMessageSignature(
  message: AgentMessage,
  mode: 'strict' | 'loose' = 'strict',
): string {
  const ts = toTimestampMs(message)
  const tsBucket = ts === null ? 0 : Math.floor(ts / 1000)
  const toolHint = message.toolName || ''
  const toolInputHint = summarizeToolInput(message.toolInput)
  const contentSnippet = (message.content || '').slice(0, 200)
  return [
    message.type,
    toolHint,
    toolInputHint,
    normalizeMessageContent(contentSnippet),
    mode === 'strict' ? String(tsBucket) : '',
  ].join('|')
}

function mergeTimelineMessages(
  historyMessages: AgentMessage[],
  liveMessages: AgentMessage[],
): AgentMessage[] {
  if (!liveMessages.length) return historyMessages

  const strictSeen = new Set(historyMessages.map((message) => buildMessageSignature(message, 'strict')))
  const recentHistory = historyMessages.slice(Math.max(0, historyMessages.length - 24))
  const looseTimestampMap = new Map<string, number[]>()
  for (const message of recentHistory) {
    const looseSignature = buildMessageSignature(message, 'loose')
    const ts = toTimestampMs(message)
    if (ts === null) continue
    const existing = looseTimestampMap.get(looseSignature)
    if (existing) {
      existing.push(ts)
    } else {
      looseTimestampMap.set(looseSignature, [ts])
    }
  }

  const merged = [...historyMessages]
  const LOOSE_DEDUPE_WINDOW_MS = 15_000
  for (const message of liveMessages) {
    const strictSignature = buildMessageSignature(message, 'strict')
    if (strictSeen.has(strictSignature)) continue

    const looseSignature = buildMessageSignature(message, 'loose')
    const liveTs = toTimestampMs(message)
    const looseCandidates = looseTimestampMap.get(looseSignature) || []
    const shouldSkipByLooseMatch = liveTs !== null
      && looseCandidates.some((historyTs) => Math.abs(liveTs - historyTs) <= LOOSE_DEDUPE_WINDOW_MS)

    if (shouldSkipByLooseMatch) continue

    merged.push(message)
    strictSeen.add(strictSignature)
    if (liveTs !== null) {
      const existing = looseTimestampMap.get(looseSignature)
      if (existing) {
        existing.push(liveTs)
      } else {
        looseTimestampMap.set(looseSignature, [liveTs])
      }
    }
  }
  return merged
}

function buildPendingQuestionFromHistory(session: SessionDetail | null): PendingQuestion | null {
  if (!session?.messages?.length) return null
  if (session.status !== 'waiting_input') return null

  let lastAskIndex = -1
  for (let index = session.messages.length - 1; index >= 0; index--) {
    const msg = session.messages[index]
    if (msg.type === 'tool_use' && /^AskU(?:ser|er)Question$/i.test(msg.toolName || '')) {
      lastAskIndex = index
      break
    }
  }

  if (lastAskIndex === -1) return null

  const hasUserReply = session.messages
    .slice(lastAskIndex + 1)
    .some((msg) => msg.type === 'user' && Boolean((msg.content || '').trim()))

  if (hasUserReply) return null

  const askMessage = session.messages[lastAskIndex]
  const toolInput = askMessage.toolInput && typeof askMessage.toolInput === 'object'
    ? askMessage.toolInput as Record<string, unknown>
    : {}

  const rawQuestions = Array.isArray(toolInput.questions)
    ? toolInput.questions
    : (() => {
      const question = typeof toolInput.question === 'string' ? toolInput.question.trim() : ''
      if (!question) return []
      return [{
        question,
        header:
          typeof toolInput.header === 'string' && toolInput.header.trim()
            ? toolInput.header.trim()
            : '问题',
        options: Array.isArray(toolInput.options) ? toolInput.options : [],
        multiSelect: Boolean(toolInput.multiSelect),
      }]
    })()

  const questions = rawQuestions
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const candidate = item as Record<string, unknown>
      const question = typeof candidate.question === 'string' ? candidate.question.trim() : ''
      if (!question) return null

      const header =
        typeof candidate.header === 'string' && candidate.header.trim()
          ? candidate.header.trim()
          : '问题'

      const options = Array.isArray(candidate.options)
        ? candidate.options
          .map((opt) => {
            if (typeof opt === 'string') {
              const label = opt.trim()
              if (!label) return null
              return { label, description: '' }
            }
            if (!opt || typeof opt !== 'object') return null
            const option = opt as Record<string, unknown>
            const label = typeof option.label === 'string' ? option.label.trim() : ''
            if (!label) return null
            return {
              label,
              description: typeof option.description === 'string' ? option.description : '',
            }
          })
          .filter(Boolean) as Array<{ label: string; description: string }>
        : []

      return {
        question,
        header,
        options,
        multiSelect: Boolean(candidate.multiSelect),
      }
    })
    .filter(Boolean) as PendingQuestion['questions']

  if (!questions.length) return null

  return {
    id: `history_question_${session.id}_${askMessage.id}`,
    toolUseId: `history_tool_${askMessage.id}`,
    questions,
    missingFields: Array.isArray(toolInput.missingFields)
      ? toolInput.missingFields.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : undefined,
    questionContext: normalizeQuestionContext(toolInput.questionContext)
      || inferQuestionContextFromQuestions(questions),
  }
}

const CONVERSE_SYNC_RETRY_DELAY_MS = 900

/* ── SQLite datetime('now') 返回 UTC 但不带时区标记，
 *    补上 'Z' 让 JS 正确识别为 UTC，toLocaleString 自动转本地时区 ── */
function parseUTCDate(dateStr: string): Date {
  const s = dateStr.trim()
  if (s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s)) return new Date(s)
  return new Date(s + 'Z')
}

/**
 * convertMessages
 * 将后端 SessionDetail 的原始消息转换为前端 AgentMessage 格式
 * 纯函数，提取到组件外部以便 useMemo 稳定引用
 */
function convertMessages(session: SessionDetail | null): AgentMessage[] {
  if (!session) return []

  const messages: AgentMessage[] = []

  for (const msg of session.messages) {
    if (msg.type === 'user' && msg.content) {
      messages.push({
        id: String(msg.id),
        type: 'user',
        content: msg.content,
        timestamp: parseUTCDate(msg.createdAt),
        serverMessageId: msg.id,
        meta: msg.meta || null,
      })
    } else if (msg.type === 'assistant' && msg.content) {
      const widgetMeta = msg.meta?.widget
      const assistantMessage: AgentMessage = {
        id: String(msg.id),
        type: 'assistant',
        content: widgetMeta ? '' : msg.content,
        timestamp: parseUTCDate(msg.createdAt),
        serverMessageId: msg.id,
        meta: msg.meta || null,
        ...(widgetMeta ? { widgetId: widgetMeta.widgetId, widgetTitle: widgetMeta.title } : {}),
      }
      if (widgetMeta) {
        messages.push(assistantMessage)
      } else {
        const merged = appendMessageWithVariants(messages, assistantMessage)
        messages.length = 0
        messages.push(...merged)
      }
    } else if (msg.type === 'tool_use' && msg.toolName) {
      const parsedToolInput =
        msg.toolInput && typeof msg.toolInput === 'object'
          ? msg.toolInput as Record<string, unknown>
          : undefined

      messages.push({
        id: String(msg.id),
        type: 'tool',
        content: '',
        toolName: msg.toolName,
        toolInput: parsedToolInput,
        timestamp: parseUTCDate(msg.createdAt),
        serverMessageId: msg.id,
        meta: msg.meta || null,
      })
    } else if (msg.type === 'tool_result' && msg.toolResult) {
      messages.push({
        id: `${msg.id}-result`,
        type: 'tool',
        content: msg.toolResult.substring(0, 500) + (msg.toolResult.length > 500 ? '...' : ''),
        toolName: '执行结果',
        timestamp: parseUTCDate(msg.createdAt),
        serverMessageId: msg.id,
        meta: msg.meta || null,
      })
    }
  }

  if (messages.length === 0) {
    messages.push({
      id: 'query',
      type: 'user',
      content: session.query,
      timestamp: parseUTCDate(session.created_at),
    })
  }

  return messages
}

function SessionDetailContent({
  routeSessionId = '',
  routeWorkId = '',
}: {
  routeSessionId?: string
  routeWorkId?: string
}) {
  const navigate = useNavigate()
  const { getSkillName } = useSkillNameMap()
  const assistantLabel = '个人助理'
  const [activeTab, setActiveTab] = useState<'employee' | 'assistant'>('employee')
  const [resolvedSessionId, setResolvedSessionId] = useState<string | null>(null)
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [assistantSession, setAssistantSession] = useState<SessionDetail | null>(null)
  const [relatedRecordSessionIds, setRelatedRecordSessionIds] = useState<string[]>([])
  const [workTitle, setWorkTitle] = useState('')
  const [workId, setWorkId] = useState<string | null>(null)
  const [workSummary, setWorkSummary] = useState<WorkSummary | null>(null)
  const [liveStatus, setLiveStatus] = useState<SessionLiveStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [continuing, setContinuing] = useState(false)
  const [taskFiles, setTaskFiles] = useState<TaskFile[]>([])
  const [filesVersion, setFilesVersion] = useState(0)
  const [deleting, setDeleting] = useState(false)

  const [viewingWidget, setViewingWidget] = useState<WidgetState | null>(null)
  const sessionId = routeSessionId || resolvedSessionId || ''

  const attachInFlightRef = useRef<Promise<void> | null>(null)
  const attachedSessionRef = useRef<string | null>(null)
  const prevConverseThinkingRef = useRef(false)
  const converseThinkingRef = useRef(false)

  const executionSkillId = session?.skill_id === '__converse__'
    ? '__generic__'
    : (session?.skill_id || '__generic__')
  const isConverseSession = session?.skill_id === '__converse__'
  const agent = useAgent(executionSkillId)
  const converse = useConverse()
  converseThinkingRef.current = converse.isThinking
  const historyPendingQuestion = useMemo(
    () => buildPendingQuestionFromHistory(session),
    [session],
  )

  useEffect(() => {
    setLoading(true)
    setContinuing(false)
    attachInFlightRef.current = null
    attachedSessionRef.current = null
    prevConverseThinkingRef.current = false
    converse.reset()
    setSession(null)
    setAssistantSession(null)
    setRelatedRecordSessionIds([])
    setWorkId(null)
    setWorkSummary(null)
    setLiveStatus(null)
    setTaskFiles([])
    setFilesVersion(0)
    setViewingWidget(null)
    setResolvedSessionId(null)
    setActiveTab('employee')
  }, [routeSessionId, routeWorkId])

  useEffect(() => {
    if (!sessionId || !isConverseSession) return
    let cancelled = false

    void (async () => {
      const resumed = await converse.resumeSession(sessionId)
      if (cancelled) return
      if (resumed) {
        setContinuing(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [sessionId, isConverseSession, converse.resumeSession])

  useEffect(() => {
    if (isConverseSession) return
    const assistantSessionId = (assistantSession?.id || '').trim()
    if (!assistantSessionId) return
    void converse.resumeSession(assistantSessionId)
  }, [assistantSession?.id, isConverseSession, converse.resumeSession])

  useEffect(() => {
    if (!sessionId || !session || isConverseSession) return
    let cancelled = false

    async function refreshLiveStatus() {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`${API_BASE}/sessions/${sessionId}/live-status`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = (await res.json()) as SessionLiveStatus
        if (cancelled) return
        setLiveStatus(data)

        if (
          data.isRunning
          && data.canAttach
          && !agent.isRunning
          && attachedSessionRef.current !== sessionId
          && !attachInFlightRef.current
        ) {
          setContinuing(true)
          attachedSessionRef.current = sessionId || null
          agent.resumeSession(sessionId!)
          attachInFlightRef.current = agent.attachToSession(sessionId!)
            .catch(() => {
              attachedSessionRef.current = null
            })
            .finally(() => {
              attachInFlightRef.current = null
            })
        }
      } catch {
        // 忽略错误
      }
    }

    refreshLiveStatus()
    const timer = setInterval(refreshLiveStatus, 5000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [sessionId, session, isConverseSession, agent.isRunning, agent.resumeSession, agent.attachToSession])

  useEffect(() => {
    if (!session?.work_dir) {
      setTaskFiles([])
      setFilesVersion(0)
      return
    }
    fetchTaskFiles()
  }, [session?.work_dir])

  const fetchSessionDetail = useCallback(async (targetSessionId: string) => {
    if (!targetSessionId) return null
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/sessions/${targetSessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('获取会话详情失败')
      const data = await res.json() as SessionDetail
      setSession(data)
      return data
    } catch {
      // 忽略错误
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchWorkDetailById = useCallback(async (targetWorkId: string, currentSession?: SessionDetail | null) => {
    const normalizedWorkId = targetWorkId.trim()
    if (!normalizedWorkId) return

    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/works/${encodeURIComponent(normalizedWorkId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return

      const data = await res.json() as WorkDetailResponse
      if (!data.work) return

      setWorkId(data.work.id)
      setWorkSummary(data.work)
      setWorkTitle(data.work.title || '')
      setRelatedRecordSessionIds(data.sessions.map((item) => item.id))

      const assistantSessionId = data.session_links?.assistant_session_id || ''
      const assistant = assistantSessionId
        ? data.sessions.find((item) => item.id === assistantSessionId)
        : data.sessions.find((item) => item.skill_id === '__converse__')
      const hasEmployeeSession = data.sessions.some((item) => item.skill_id !== '__converse__')
      if (!assistant || !hasEmployeeSession || assistant.id === currentSession?.id) return

      const detailRes = await fetch(`${API_BASE}/sessions/${assistant.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!detailRes.ok) return

      const assistantDetail = await detailRes.json() as SessionDetail
      setAssistantSession(assistantDetail)
    } catch {
      // 忽略错误
    }
  }, [])

  useEffect(() => {
    if (routeWorkId) {
      let cancelled = false

      void (async () => {
        try {
          const token = localStorage.getItem('token')
          const res = await fetch(`${API_BASE}/works/${encodeURIComponent(routeWorkId)}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!res.ok) {
            setLoading(false)
            return
          }

          const data = await res.json() as WorkDetailResponse
          if (!data.work) {
            setLoading(false)
            return
          }

          const displaySessionId = data.session_links?.entry_session_id
            || data.work.latest_session_id
            || data.work.primary_session_id
            || data.sessions[data.sessions.length - 1]?.id
            || ''
          if (!displaySessionId) {
            setLoading(false)
            return
          }

          if (cancelled) return
          setWorkId(data.work.id)
          setWorkSummary(data.work)
          setWorkTitle(data.work.title || '')
          setRelatedRecordSessionIds(data.sessions.map((item) => item.id))
          setResolvedSessionId(displaySessionId)

          const sessionDetail = await fetchSessionDetail(displaySessionId)
          if (!sessionDetail || cancelled) return

          if (cancelled) return
          await fetchWorkDetailById(data.work.id, sessionDetail)
        } catch {
          // 忽略错误
          setLoading(false)
        }
      })()

      return () => {
        cancelled = true
      }
    }

    if (!routeSessionId) {
      setLoading(false)
      return
    }

    void fetchSessionDetail(routeSessionId)
  }, [routeWorkId, routeSessionId, fetchSessionDetail])

  useEffect(() => {
    if (routeWorkId) return
    if (!sessionId || !session) return
    const sessionWorkId = (session.work_id || '').trim()
    if (!sessionWorkId) return
    void fetchWorkDetailById(sessionWorkId, session)
  }, [routeWorkId, sessionId, session, fetchWorkDetailById])

  const syncConverseSnapshot = useCallback(async () => {
    if (!sessionId) return
    if (converseThinkingRef.current) return
    await fetchSessionDetail(sessionId)
    if (converseThinkingRef.current) return
    await converse.resumeSession(sessionId)
  }, [sessionId, fetchSessionDetail, converse.resumeSession])

  const effectiveStatus = liveStatus?.isRunning
    ? 'running'
    : liveStatus?.needsInput
      ? 'waiting_input'
      : session?.status
  const effectiveStatusBadgeClass =
    effectiveStatus === 'running'
      ? 'badge badge-primary'
      : effectiveStatus === 'waiting_input'
        ? 'badge badge-warning'
      : effectiveStatus === 'completed'
        ? 'badge badge-success'
        : effectiveStatus === 'failed'
          ? 'badge badge-error'
          : 'badge bg-secondary text-secondary-foreground'

  function renderStatusLabel(status: string | undefined) {
    if (!status) return '--'
    if (status === 'running') return '运行中'
    if (status === 'waiting_input') return '待回复'
    if (status === 'completed') return '已完成'
    if (status === 'failed') return '失败'
    if (status === 'stopped' || status === 'aborted') return '已中止'
    return status
  }

  async function fetchTaskFiles() {
    if (!sessionId) return
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/task/${sessionId}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setTaskFiles(data.files || [])
        setFilesVersion((value) => value + 1)
      }
    } catch {
      // 忽略错误
    }
  }

  const getFileUrl = useCallback(
    (path: string) => `${API_BASE}/task/${sessionId}/files/${path}`,
    [sessionId],
  )

  async function handleContinue(query: string) {
    const normalizedQuery = query.trim()
    if (!session || !sessionId || !normalizedQuery) return

    if (isConverseSession) {
      if (converse.messages.length === 0) {
        await converse.resumeSession(sessionId)
      }
      setContinuing(true)
      await converse.sendMessage(normalizedQuery)
      return
    }

    agent.resumeSession(sessionId)
    setContinuing(true)
    await agent.execute(normalizedQuery)
  }

  const handleQuestionSubmit = useCallback(
    async (_questionId: string, answers: Record<string, string>) => {
      const targetQuestion = agent.pendingQuestion || historyPendingQuestion
      const responsePayload = targetQuestion
        ? buildQuestionResponsePayload(targetQuestion, answers)
        : null
      const answerText = responsePayload ? buildQuestionResponseText(responsePayload) : ''

      if (!answerText) return
      await handleContinue(answerText)
    },
    [agent.pendingQuestion, handleContinue, historyPendingQuestion],
  )

  async function handleDeleteSession() {
    if (!sessionId) return

    const targetSessionIds = relatedRecordSessionIds.length > 1
      ? relatedRecordSessionIds
      : [sessionId]
    const confirmText = targetSessionIds.length > 1
      ? '确定要删除这条协作工作记录吗？这会删除该工作下的个人助理和员工执行会话，此操作无法撤销。'
      : '确定要删除这条工作记录吗？此操作无法撤销。'

    if (!confirm(confirmText)) {
      return
    }

    setDeleting(true)
    try {
      const token = localStorage.getItem('token')
      if (workId) {
        const res = await fetch(`${API_BASE}/works/${workId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error((data as { error?: string }).error || '删除失败')
        }
      } else {
        for (const targetSessionId of targetSessionIds) {
          const res = await fetch(`${API_BASE}/sessions/${targetSessionId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          })

          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error((data as { error?: string }).error || '删除失败')
          }
        }
      }

      navigate('/history')
    } catch {
      alert('删除失败，请稍后重试')
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => {
    if (!continuing) return

    if (isConverseSession) {
      if (!converse.isThinking && converse.messages.length > 0) {
        fetchTaskFiles()
      }
      return
    }

    if (!agent.isRunning && agent.messages.length > 0) {
      fetchTaskFiles()
    }
  }, [
    continuing,
    isConverseSession,
    converse.isThinking,
    converse.messages.length,
    agent.isRunning,
    agent.messages.length,
  ])

  useEffect(() => {
    if (!continuing || !sessionId || !session?.work_dir) return
    const running = isConverseSession ? converse.isThinking : agent.isRunning
    if (!running) return

    const timer = setInterval(() => {
      void fetchTaskFiles()
    }, 5000)

    return () => {
      clearInterval(timer)
    }
  }, [
    continuing,
    sessionId,
    session?.work_dir,
    isConverseSession,
    converse.isThinking,
    agent.isRunning,
  ])

  useEffect(() => {
    if (!sessionId || !isConverseSession || !continuing) return

    const wasThinking = prevConverseThinkingRef.current
    prevConverseThinkingRef.current = converse.isThinking

    // 仅在一轮 converse 从 running -> idle 时做一次服务端同步
    if (converse.isThinking || !wasThinking) return

    let cancelled = false
    void (async () => {
      await syncConverseSnapshot()
      if (cancelled) return

      // 二次兜底：避免偶发网络/写库时序导致首轮同步拿到旧快照
      await new Promise((resolve) => window.setTimeout(resolve, CONVERSE_SYNC_RETRY_DELAY_MS))
      if (cancelled) return
      if (converseThinkingRef.current) return
      await syncConverseSnapshot()
    })()

    return () => {
      cancelled = true
    }
  }, [
    sessionId,
    isConverseSession,
    continuing,
    converse.isThinking,
    syncConverseSnapshot,
  ])

  const historyMessages = useMemo(
    () => {
      const converted = convertMessages(session)
      if (!isConverseSession || !sessionId) return converted
      return applyVariantSelections(converted, loadStoredVariantSelections(sessionId))
    },
    [session, isConverseSession, sessionId],
  )
  const allMessages = useMemo(() => {
    if (isConverseSession) {
      return converse.messages.length > 0 ? converse.messages : historyMessages
    }
    return continuing && agent.messages.length > 0
      ? mergeTimelineMessages(historyMessages, agent.messages)
      : historyMessages
  }, [isConverseSession, converse.messages, historyMessages, continuing, agent.messages])
  const handleShowWidget = useCallback((widgetId: string) => {
    const widgetMsg = allMessages.find((m) => m.widgetId === widgetId && m.meta?.widget)
    if (!widgetMsg?.meta?.widget) return
    const w = widgetMsg.meta.widget
    setViewingWidget({
      widgetId: w.widgetId,
      title: w.title,
      html: w.html,
      status: w.status as WidgetState['status'],
    })
  }, [allMessages])
  const handleWidgetInteraction = useCallback((data: unknown) => {
    const text = `[来自组件交互]\n${JSON.stringify(data, null, 2)}`
    void handleContinue(text)
  }, [handleContinue])
  const chatIsRunning = isConverseSession ? converse.isThinking : agent.isRunning
  const activePendingQuestion = isConverseSession
    ? converse.pendingQuestion
    : (agent.pendingQuestion || (!continuing ? historyPendingQuestion : null))
  const questionSubmitHandler = isConverseSession
    ? converse.respondToQuestion
    : (agent.pendingQuestion ? agent.respondToQuestion : handleQuestionSubmit)
  const stopHandler = isConverseSession ? converse.stop : agent.stop
  const assistantMessages = useMemo(
    () => convertMessages(assistantSession),
    [assistantSession],
  )
  const hasAssistantTab = Boolean(
    assistantSession
    && relatedRecordSessionIds.length > 1
    && session?.skill_id !== '__converse__',
  )
  const employeeRoleLabel = getSkillName(session?.skill_id)
  const currentOwnerLabel = getSkillName(workSummary?.current_owner_skill_id || undefined) || null
  const fallbackSessionTitle = session?.query && !isControlInstructionText(session.query)
    ? session.query
    : ''
  const displayWorkTitle = workTitle || fallbackSessionTitle || '这项工作'
  const headerTabs = hasAssistantTab
    ? [
      { id: 'assistant', label: assistantLabel },
      { id: 'employee', label: employeeRoleLabel },
    ]
    : undefined
  const phaseLabel = (() => {
    const phase = (workSummary?.phase || '').trim()
    if (!phase) return null
    if (phase === 'assistant_running') return '状态：助理处理中'
    if (phase === 'assistant_waiting') return '状态：等待老板补充'
    if (phase === 'employee_running') return '状态：员工执行中'
    if (phase === 'employee_waiting') return '状态：等待补充信息'
    if (phase === 'employee_completed' || phase === 'assistant_completed') return '状态：已完成'
    if (phase === 'employee_failed' || phase === 'assistant_failed') return '状态：执行失败'
    return `状态：${phase}`
  })()
  const headerMetaText = session ? parseUTCDate(session.created_at).toLocaleString('zh-CN') : ''
  const runtimeHeadline = (() => {
    if (!liveStatus?.isRunning) return null
    if (!chatIsRunning) {
      return continuing
        ? '后台仍在运行，正在恢复连接...'
        : '后台仍在运行，可恢复实时连接'
    }
    if (liveStatus.runtimeMode === 'tool') {
      return liveStatus.runtimeSummary || '正在使用工具'
    }
    if (liveStatus.runtimeMode === 'waiting_input') {
      return liveStatus.runtimeSummary || '等待补充信息'
    }
    return liveStatus.runtimeSummary || '思考中'
  })()
  const runtimeToneClass = liveStatus?.runtimeMode === 'failed'
    ? 'border-rose-200 bg-rose-50 text-rose-900'
    : liveStatus?.runtimeMode === 'waiting_input'
      ? 'border-sky-200 bg-sky-50 text-sky-900'
      : 'border-amber-200 bg-amber-50 text-amber-900'
  const runtimeBanner = liveStatus?.isRunning
    ? (
      <div className={`mb-3 rounded-xl border px-4 py-3 text-sm ${runtimeToneClass}`}>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="font-medium">{runtimeHeadline}</span>
        </div>
        {phaseLabel && (
          <p className="mt-1 text-xs opacity-80">{phaseLabel}</p>
        )}
        {liveStatus.activeToolName && (
          <p className="mt-1 text-xs opacity-80">
            当前工具：{liveStatus.activeToolName}
            {liveStatus.activeToolInputSummary ? ` · ${liveStatus.activeToolInputSummary}` : ''}
          </p>
        )}
        {!chatIsRunning && liveStatus.canAttach && (
          <p className="mt-1 text-xs opacity-80">重新进入后会自动恢复到实时工作流。</p>
        )}
      </div>
    )
    : null
  const headerRightSlot = (
    <>
      <Tooltip content="删除会话" side="bottom">
        <button
          onClick={handleDeleteSession}
          disabled={deleting || effectiveStatus === 'running'}
          className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={effectiveStatus === 'running'
            ? '无法删除正在运行的会话'
            : (relatedRecordSessionIds.length > 1 ? '删除整条协作工作记录' : '删除这条工作记录')}
        >
          {deleting ? (
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          )}
        </button>
      </Tooltip>
    </>
  )

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="h-64 bg-muted rounded-lg" />
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center py-12 text-muted-foreground">
          会话不存在
        </div>
      </div>
    )
  }

  if (hasAssistantTab && activeTab === 'assistant') {
    return (
      <div className="flex h-[calc(100vh-64px)]">
        <div className="mx-auto flex h-full max-w-4xl flex-1 flex-col px-4 py-6">
        {runtimeBanner}
        <WorkDetailHeader
          title={displayWorkTitle}
          onBack={() => navigate('/history')}
          statusLabel={renderStatusLabel(effectiveStatus)}
          statusBadgeClassName={effectiveStatusBadgeClass}
          stageLabel={phaseLabel}
          ownerLabel={currentOwnerLabel}
          metaText={headerMetaText}
          rightSlot={headerRightSlot}
          tabs={headerTabs}
          activeTab={hasAssistantTab ? activeTab : undefined}
          onTabChange={hasAssistantTab ? (tabId) => setActiveTab(tabId as 'employee' | 'assistant') : undefined}
        />
        <ConversationWorkspaceView
          messages={converse.messages.length > 0 ? converse.messages : assistantMessages}
          isRunning={converse.isThinking}
          pendingQuestion={converse.pendingQuestion}
          respondToQuestion={converse.respondToQuestion}
          onSubmit={converse.sendMessage}
          onStop={converse.stop}
          placeholder="继续把要求交给个人助理..."
          emptyText="暂无助理会话记录"
        />
        </div>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-64px)]">
      <ExecutionPanel
        key={`${sessionId || 'empty'}:${session?.work_dir || 'no-workdir'}`}
        messages={allMessages}
        isRunning={chatIsRunning}
        error={isConverseSession ? converse.error : agent.error}
        connectionStatus={isConverseSession ? null : agent.connectionStatus}
        taskFiles={taskFiles}
        workDir={session?.work_dir || null}
        filesVersion={filesVersion}
        onSubmit={handleContinue}
        onStop={stopHandler}
        sessionId={sessionId || null}
        getFileUrl={getFileUrl}
        fetchTaskFiles={fetchTaskFiles}
        pendingQuestion={activePendingQuestion}
        respondToQuestion={questionSubmitHandler}
        placeholder="输入新的问题继续对话..."
        headerSlot={(
          <>
            {runtimeBanner}
            <WorkDetailHeader
              title={displayWorkTitle}
              onBack={() => navigate('/history')}
              statusLabel={renderStatusLabel(effectiveStatus)}
              statusBadgeClassName={effectiveStatusBadgeClass}
              stageLabel={phaseLabel}
              ownerLabel={currentOwnerLabel}
              metaText={headerMetaText}
              rightSlot={headerRightSlot}
              tabs={headerTabs}
              activeTab={hasAssistantTab ? activeTab : undefined}
              onTabChange={hasAssistantTab ? (tabId) => setActiveTab(tabId as 'employee' | 'assistant') : undefined}
            />
          </>
        )}
        activeWidget={viewingWidget}
        streamingWidget={isConverseSession ? converse.streamingWidget : undefined}
        onCloseWidget={() => setViewingWidget(null)}
        onWidgetInteraction={isConverseSession ? (_widgetId, data) => { handleWidgetInteraction(data) } : undefined}
        onWidgetFallbackToText={isConverseSession ? () => { void handleContinue('[请改为文本解释]') } : undefined}
        onShowWidget={handleShowWidget}
        onExpandWidget={handleShowWidget}
      />
    </div>
  )
}

export function SessionDetailPage() {
  const params = useParams<{ workId?: string }>()
  const routeWorkId = typeof params.workId === 'string' ? params.workId.trim() : ''
  return <SessionDetailContent routeWorkId={routeWorkId} />
}

export function LegacySessionDetailPage() {
  const params = useParams<{ sessionId?: string }>()
  const routeSessionId = typeof params.sessionId === 'string' ? params.sessionId.trim() : ''
  const navigate = useNavigate()
  const [resolved, setResolved] = useState<'redirecting' | 'fallback'>('redirecting')

  useEffect(() => {
    let cancelled = false

    if (!routeSessionId) {
      setResolved('fallback')
      return () => { cancelled = true }
    }

    void (async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(routeSessionId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          if (!cancelled) setResolved('fallback')
          return
        }

        const data = await res.json() as SessionDetail
        const workId = (data.work_id || '').trim()
        if (workId) {
          navigate(`/history/work/${encodeURIComponent(workId)}`, { replace: true })
          return
        }

        if (!cancelled) setResolved('fallback')
      } catch {
        if (!cancelled) setResolved('fallback')
      }
    })()

    return () => { cancelled = true }
  }, [routeSessionId, navigate])

  if (resolved === 'redirecting') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="h-64 bg-muted rounded-lg" />
        </div>
      </div>
    )
  }

  return <SessionDetailContent routeSessionId={routeSessionId} />
}
