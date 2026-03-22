
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useAgent, type PendingQuestion } from '../hooks/useAgent'
import { useConverse } from '../hooks/useConverse'
import { useSkillNameMap } from '../hooks/useSkillNameMap'
import { useVitePreview } from '../hooks/useVitePreview'
import type { AgentMessage, TaskFile, Session, SessionDetail, SessionLiveStatus, WidgetState } from '../types'
import { API_BASE } from '../config'
import ChatInput from '../components/shared/ChatInput'
import MessageList from '../components/shared/MessageList'
import { QuestionInput } from '../components/shared/QuestionInput'
import { RightSidebar } from '../components/shared/RightSidebar'
import { ResizeHandle, useResizablePanel } from '../components/shared/ResizeHandle'
import {
  ArtifactPreview,
  VitePreview,
  getExt,
  getCategory,
  type FileArtifact,
} from '../components/preview'
import { findLatestPreviewableTaskFile, findTaskFileByArtifactPath, toArtifactPath } from '../components/shared/taskFileUtils'
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
import { WidgetPanel } from '../components/widget/WidgetPanel'
import { findWorkRecordBySessionId, isControlInstructionText } from '../lib/workRecords'
import { CollaborationTabs } from '../components/shared/CollaborationTabs'
import { ConversationWorkspaceView } from '../components/shared/ConversationWorkspaceView'

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

function toFileArtifact(
  file: TaskFile,
  getFileUrl: (path: string) => string,
  workDir: string | null,
): FileArtifact {
  const ext = file.ext || getExt(file.name)
  const fullPath = toArtifactPath(file.path, workDir)
  return {
    name: file.name,
    path: fullPath,
    ext,
    category: getCategory(ext),
    size: file.size,
    url: getFileUrl(file.path),
  }
}

function buildHistoryPreviewSelectionHint(session: SessionDetail | null): string {
  if (!session) return ''

  const userMessageHints = (session.messages || [])
    .filter((message) => message.type === 'user' && typeof message.content === 'string')
    .slice(-2)
    .map((message) => (message.content || '').trim())
    .filter(Boolean)

  return [session.query, ...userMessageHints]
    .map((item) => item.trim())
    .filter(Boolean)
    .join('\n')
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

const CHAT_PANEL_MIN = 300
const CHAT_PANEL_MAX = 800
const CHAT_PANEL_DEFAULT = 450
const SIDEBAR_WIDTH = 280
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

export function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { getSkillName } = useSkillNameMap()
  const assistantLabel = '个人助理'
  const [activeTab, setActiveTab] = useState<'employee' | 'assistant'>('employee')
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [assistantSession, setAssistantSession] = useState<SessionDetail | null>(null)
  const [relatedRecordSessionIds, setRelatedRecordSessionIds] = useState<string[]>([])
  const [workTitle, setWorkTitle] = useState('')
  const [liveStatus, setLiveStatus] = useState<SessionLiveStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [continuing, setContinuing] = useState(false)
  const [taskFiles, setTaskFiles] = useState<TaskFile[]>([])
  const [deleting, setDeleting] = useState(false)

  const [isPreviewVisible, setIsPreviewVisible] = useState(false)
  const [isRightSidebarVisible, setIsRightSidebarVisible] = useState(false)
  const [selectedArtifact, setSelectedArtifact] = useState<FileArtifact | null>(null)
  const [showLivePreview, setShowLivePreview] = useState(false)
  const [viewingWidget, setViewingWidget] = useState<WidgetState | null>(null)

  // 自动展开标记
  const hasAutoExpandedRef = useRef(false)
  const selectedPathRef = useRef<string | null>(null)
  const attachInFlightRef = useRef<Promise<void> | null>(null)
  const attachedSessionRef = useRef<string | null>(null)
  const prevConverseThinkingRef = useRef(false)
  const converseThinkingRef = useRef(false)

  const {
    width: chatPanelWidth,
    handleResize: handleChatResize,
    handleResizeEnd: handleChatResizeEnd,
  } = useResizablePanel({
    initialWidth: CHAT_PANEL_DEFAULT,
    minWidth: CHAT_PANEL_MIN,
    maxWidth: CHAT_PANEL_MAX,
    storageKey: 'laborany-history-chat-panel-width',
  })

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
  const previewSelectionHint = useMemo(
    () => buildHistoryPreviewSelectionHint(session),
    [session],
  )

  // Live Preview hook
  const {
    status: previewStatus,
    previewUrl,
    error: liveError,
    startPreview,
    stopPreview,
  } = useVitePreview(sessionId || null)

  useEffect(() => {
    setContinuing(false)
    attachInFlightRef.current = null
    attachedSessionRef.current = null
    prevConverseThinkingRef.current = false
    converse.reset()
    setAssistantSession(null)
    setRelatedRecordSessionIds([])
    setActiveTab('employee')
    if (sessionId) {
      fetchSessionDetail()
    }
  }, [sessionId])

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
    if (session?.work_dir) {
      fetchTaskFiles()
    }
  }, [session?.work_dir])

  const fetchSessionDetail = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('获取会话详情失败')
      const data = await res.json()
      setSession(data)
    } catch {
      // 忽略错误
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  const fetchRelatedWorkRecord = useCallback(async (targetSessionId: string, currentSession: SessionDetail) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return

      const allSessions = await res.json() as Session[]
      const record = findWorkRecordBySessionId(allSessions, targetSessionId, getSkillName)
      if (!record) return

      setWorkTitle(record.title)
      setRelatedRecordSessionIds(record.sessions.map((item) => item.id))

      const assistant = record.sessions.find((item) => item.skill_id === '__converse__')
      const hasEmployeeSession = record.sessions.some((item) => item.skill_id !== '__converse__')
      if (!assistant || !hasEmployeeSession || assistant.id === currentSession.id) return

      const detailRes = await fetch(`${API_BASE}/sessions/${assistant.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!detailRes.ok) return

      const assistantDetail = await detailRes.json() as SessionDetail
      setAssistantSession(assistantDetail)
    } catch {
      // 忽略错误
    }
  }, [getSkillName])

  useEffect(() => {
    if (!sessionId || !session) return
    void fetchRelatedWorkRecord(sessionId, session)
  }, [sessionId, session, fetchRelatedWorkRecord])

  const syncConverseSnapshot = useCallback(async () => {
    if (!sessionId) return
    if (converseThinkingRef.current) return
    await fetchSessionDetail()
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
      }
    } catch {
      // 忽略错误
    }
  }

  const getFileUrl = useCallback(
    (path: string) => `${API_BASE}/task/${sessionId}/files/${path}`,
    [sessionId],
  )

  const handleSelectArtifact = useCallback((artifact: FileArtifact) => {
    setSelectedArtifact(artifact)
    setIsPreviewVisible(true)
    setShowLivePreview(false)
  }, [])

  const handleStartLivePreview = useCallback(() => {
    if (session?.work_dir) {
      setShowLivePreview(true)
      setIsPreviewVisible(true)
      startPreview(session.work_dir)
    }
  }, [session?.work_dir, startPreview])

  useEffect(() => {
    selectedPathRef.current = selectedArtifact?.path || null
  }, [selectedArtifact?.path])

  useEffect(() => {
    if (hasAutoExpandedRef.current) return
    if (taskFiles.length === 0) return

    setIsRightSidebarVisible(true)
    hasAutoExpandedRef.current = true

    const latestFile = findLatestPreviewableTaskFile(taskFiles, {
      hintText: previewSelectionHint,
    })
    if (!latestFile) return

    handleSelectArtifact(toFileArtifact(latestFile, getFileUrl, session?.work_dir || null))
  }, [taskFiles, handleSelectArtifact, getFileUrl, session?.work_dir, previewSelectionHint])

  useEffect(() => {
    if (taskFiles.length === 0) return

    const currentFile = selectedPathRef.current
      ? findTaskFileByArtifactPath(taskFiles, selectedPathRef.current, session?.work_dir || null)
      : null

    if (currentFile) {
      setSelectedArtifact(toFileArtifact(currentFile, getFileUrl, session?.work_dir || null))
      return
    }

    const latestFile = findLatestPreviewableTaskFile(taskFiles, {
      hintText: previewSelectionHint,
    })
    if (latestFile) {
      setSelectedArtifact(toFileArtifact(latestFile, getFileUrl, session?.work_dir || null))
    }
  }, [taskFiles, getFileUrl, session?.work_dir, previewSelectionHint])

  const handleClosePreview = useCallback(() => {
    setIsPreviewVisible(false)
    setSelectedArtifact(null)
    setShowLivePreview(false)
  }, [])

  async function handleContinue(query: string) {
    const normalizedQuery = query.trim()
    if (!session || !sessionId || !normalizedQuery) return

    if (isConverseSession) {
      if (converse.messages.length === 0) {
        await converse.resumeSession(sessionId)
      }
      setContinuing(true)
      hasAutoExpandedRef.current = false
      await converse.sendMessage(normalizedQuery)
      return
    }

    agent.resumeSession(sessionId)
    setContinuing(true)
    hasAutoExpandedRef.current = false  // reset so new artifacts can auto-expand
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
  const showResizeHandle = isPreviewVisible || isRightSidebarVisible || Boolean(viewingWidget)
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
  const activeRoleLabel = activeTab === 'assistant' ? assistantLabel : employeeRoleLabel
  const fallbackSessionTitle = session?.query && !isControlInstructionText(session.query)
    ? session.query
    : ''
  const displayWorkTitle = workTitle || fallbackSessionTitle || '这项工作'

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
        <div className="mb-4 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/history" className="text-muted-foreground hover:text-foreground transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-foreground">{displayWorkTitle}</h2>
                <p className="text-sm text-muted-foreground">当前视角：{activeRoleLabel}</p>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {parseUTCDate(session.created_at).toLocaleString('zh-CN')}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-border bg-card/60 px-4 py-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                协作视角
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                按处理顺序查看这项工作的不同阶段，默认先打开当前执行中的角色。
              </p>
            </div>
            <CollaborationTabs
              tabs={[
                { id: 'assistant', label: assistantLabel },
                { id: 'employee', label: employeeRoleLabel },
              ]}
              activeTab={activeTab}
              onChange={(tabId) => setActiveTab(tabId as 'employee' | 'assistant')}
            />
          </div>
        </div>
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
      <div className="flex h-full">
      {/* 左侧：聊天面板 */}
      <div
        className="flex flex-col px-4 py-6 overflow-hidden"
        style={{
          width: showResizeHandle ? chatPanelWidth : '100%',
          maxWidth: showResizeHandle ? undefined : '56rem',
          margin: showResizeHandle ? undefined : '0 auto',
        }}
      >
        {/* 顶部导航 */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-4">
            <Link to="/history" className="text-muted-foreground hover:text-foreground transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-foreground">
                {displayWorkTitle}
              </h2>
              <p className="text-sm text-muted-foreground">当前视角：{activeRoleLabel}</p>
            </div>
            <span className={effectiveStatusBadgeClass}>
              {renderStatusLabel(effectiveStatus)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Live Preview 按钮 */}
            {session.work_dir && (
              <Tooltip content="在浏览器中实时预览" side="bottom">
                <button
                  onClick={handleStartLivePreview}
                  className={`text-sm flex items-center gap-1.5 transition-colors ${
                    showLivePreview ? 'text-green-500' : 'text-primary hover:text-primary/80'
                  }`}
                >
                  🔍 Live
                </button>
              </Tooltip>
            )}
            {/* 侧边栏切换 */}
            {taskFiles.length > 0 && (
              <Tooltip content="切换侧边栏" side="bottom">
                <button
                  onClick={() => setIsRightSidebarVisible(!isRightSidebarVisible)}
                  className={`text-sm flex items-center gap-1.5 transition-colors ${
                    isRightSidebarVisible ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                  </svg>
                </button>
              </Tooltip>
            )}
            {/* 删除按钮 */}
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
            {/* 时间 */}
            <div className="text-sm text-muted-foreground">
              {parseUTCDate(session.created_at).toLocaleString('zh-CN')}
            </div>
          </div>
        </div>
        {hasAssistantTab && (
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-card/60 px-4 py-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                协作视角
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                按处理顺序查看这项工作的不同阶段，默认先打开当前执行中的角色。
              </p>
            </div>
            <CollaborationTabs
              tabs={[
                { id: 'assistant', label: assistantLabel },
                { id: 'employee', label: employeeRoleLabel },
              ]}
              activeTab={activeTab}
              onChange={(tabId) => setActiveTab(tabId as 'employee' | 'assistant')}
            />
          </div>
        )}

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto mb-4 min-h-0">
          <MessageList
            messages={allMessages}
            isRunning={chatIsRunning}
            sessionKey={sessionId}
            initialScrollOnMount="bottom"
            onRegenerate={isConverseSession && converse.messages.length > 0 ? converse.regenerateMessage : undefined}
            onSelectVariant={isConverseSession && converse.messages.length > 0 ? converse.selectVariant : undefined}
            regeneratingMessageId={isConverseSession && converse.messages.length > 0 ? converse.regeneratingMessageId : null}
            onShowWidget={handleShowWidget}
            onExpandWidget={handleShowWidget}
            streamingWidget={isConverseSession ? converse.streamingWidget : undefined}
            onWidgetInteraction={isConverseSession ? (_widgetId, data) => { handleWidgetInteraction(data) } : undefined}
            onWidgetFallbackToText={isConverseSession ? () => { void handleContinue('[请改为文本解释]') } : undefined}
          />
        </div>

        {/* 继续对话输入框 */}
        <div className="border-t border-border pt-4 shrink-0">
          {activePendingQuestion ? (
            <>
              <p className="text-sm text-muted-foreground mb-2">请先回答当前问题：</p>
              <QuestionInput
                pendingQuestion={activePendingQuestion}
                onSubmit={questionSubmitHandler}
              />
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-2">继续对话：</p>
              <ChatInput
                onSubmit={handleContinue}
                onStop={stopHandler}
                isRunning={chatIsRunning}
                placeholder="输入新的问题继续对话..."
              />
            </>
          )}
        </div>
      </div>

      {/* 分隔杆（聊天面板与预览/侧栏之间） */}
      {showResizeHandle && (
        <ResizeHandle
          onResize={handleChatResize}
          onResizeEnd={handleChatResizeEnd}
          direction="horizontal"
        />
      )}

      {/* 中间：Widget 面板（优先于预览） */}
      {viewingWidget && (
        <div className="flex-1 min-w-[300px]">
          <WidgetPanel
            widget={viewingWidget}
            onClose={() => setViewingWidget(null)}
            onWidgetInteraction={isConverseSession ? (_widgetId, data) => { handleWidgetInteraction(data) } : undefined}
            onFallbackToText={isConverseSession ? () => { void handleContinue('[请改为文本解释]') } : undefined}
          />
        </div>
      )}

      {/* 中间：预览面板（Widget 不活跃时显示） */}
      {isPreviewVisible && !viewingWidget && (
        <div className="flex-1 min-w-[300px] border-l border-border">
          {showLivePreview ? (
            /* Live Preview */
            <div className="flex h-full flex-col">
              <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Live Preview</span>
                  {previewStatus === 'running' && (
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  )}
                </div>
                <button
                  onClick={handleClosePreview}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <VitePreview
                  status={previewStatus}
                  previewUrl={previewUrl}
                  error={liveError}
                  onStart={handleStartLivePreview}
                  onStop={stopPreview}
                />
              </div>
            </div>
          ) : selectedArtifact ? (
            /* 静态预览 */
            <ArtifactPreview artifact={selectedArtifact} onClose={handleClosePreview} />
          ) : null}
        </div>
      )}

      {/* 右侧：工具侧栏 */}
      {isRightSidebarVisible && (
        <div style={{ width: SIDEBAR_WIDTH }} className="shrink-0">
          <RightSidebar
            messages={allMessages}
            isRunning={chatIsRunning}
            artifacts={taskFiles}
            selectedArtifact={selectedArtifact}
            onSelectArtifact={handleSelectArtifact}
            getFileUrl={getFileUrl}
            workDir={session?.work_dir || null}
          />
        </div>
      )}
      </div>
    </div>
  )
}
