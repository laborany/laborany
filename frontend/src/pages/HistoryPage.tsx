
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAgent, type PendingQuestion } from '../hooks/useAgent'
import { useSkillNameMap } from '../hooks/useSkillNameMap'
import { useVitePreview } from '../hooks/useVitePreview'
import type { TaskFile, Session, SessionDetail, SessionLiveStatus } from '../types'
import { API_BASE } from '../config'
import ChatInput from '../components/shared/ChatInput'
import MessageList from '../components/shared/MessageList'
import { QuestionInput } from '../components/shared/QuestionInput'
import { RightSidebar } from '../components/shared/RightSidebar'
import { ResizeHandle, useResizablePanel } from '../components/shared/ResizeHandle'
import {
  ArtifactPreview,
  VitePreview,
  isPreviewable,
  getExt,
  getCategory,
  type FileArtifact,
} from '../components/preview'
import { Tooltip } from '../components/ui'

export default function HistoryPage() {
  const [sessions, setSessions] = useState<Session[]>([])
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
      const data = await res.json()
      setSessions(data)
    } catch {
      // 忽略错误
    } finally {
      setLoading(false)
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  function getStatusBadge(status: string) {
    const styles: Record<string, string> = {
      running: 'badge-primary',
      completed: 'badge-success',
      failed: 'badge-error',
      stopped: 'bg-secondary text-secondary-foreground',
      aborted: 'bg-secondary text-secondary-foreground',
    }
    const labels: Record<string, string> = {
      running: '运行中',
      completed: '已完成',
      failed: '失败',
      stopped: '已中止',
      aborted: '已中止',
    }
    return (
      <span className={`badge ${styles[status] || styles.stopped}`}>
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
        <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-foreground">历史会话</h2>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
            <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-muted-foreground">暂无历史会话</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <Link
              key={session.id}
              to={`/history/${session.id}`}
              className="block card-hover p-4"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="font-medium text-foreground line-clamp-2">
                    {session.query}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatDate(session.created_at)}
                  </p>
                </div>
                <div className="ml-4 flex items-center gap-2">
                  {getStatusBadge(session.status)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function findFirstPreviewableFile(files: TaskFile[]): TaskFile | null {
  for (const file of files) {
    if (file.type === 'file' && isPreviewable(file.ext || '')) return file
    if (file.children) {
      const found = findFirstPreviewableFile(file.children)
      if (found) return found
    }
  }
  return null
}

function toFileArtifact(
  file: TaskFile,
  getFileUrl: (path: string) => string,
  workDir: string | null,
): FileArtifact {
  const ext = file.ext || getExt(file.name)
  const fullPath = workDir ? `${workDir}/${file.path}`.replace(/\\/g, '/') : file.path
  return {
    name: file.name,
    path: fullPath,
    ext,
    category: getCategory(ext),
    size: file.size,
    url: getFileUrl(file.path),
  }
}

function buildPendingQuestionFromHistory(session: SessionDetail | null): PendingQuestion | null {
  if (!session?.messages?.length) return null

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
  }
}

const CHAT_PANEL_MIN = 300
const CHAT_PANEL_MAX = 800
const CHAT_PANEL_DEFAULT = 450
const SIDEBAR_WIDTH = 280

export function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { getSkillName } = useSkillNameMap()
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [liveStatus, setLiveStatus] = useState<SessionLiveStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [continuing, setContinuing] = useState(false)
  const [taskFiles, setTaskFiles] = useState<TaskFile[]>([])

  const [isPreviewVisible, setIsPreviewVisible] = useState(false)
  const [isRightSidebarVisible, setIsRightSidebarVisible] = useState(false)
  const [selectedArtifact, setSelectedArtifact] = useState<FileArtifact | null>(null)
  const [showLivePreview, setShowLivePreview] = useState(false)

  // 自动展开标记
  const hasAutoExpandedRef = useRef(false)
  const attachInFlightRef = useRef<Promise<void> | null>(null)
  const attachedSessionRef = useRef<string | null>(null)

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
    : (session?.skill_id || '')
  const agent = useAgent(executionSkillId)
  const historyPendingQuestion = useMemo(
    () => buildPendingQuestionFromHistory(session),
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
    if (sessionId) {
      fetchSessionDetail()
    }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
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
        // 韫囩晫鏆愰柨娆掝嚖
      }
    }

    refreshLiveStatus()
    const timer = setInterval(refreshLiveStatus, 5000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [sessionId, agent.isRunning, agent.resumeSession, agent.attachToSession])

  useEffect(() => {
    if (session?.work_dir) {
      fetchTaskFiles()
    }
  }, [session?.work_dir])

  async function fetchSessionDetail() {
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
  }

  const effectiveStatus = liveStatus?.isRunning ? 'running' : session?.status
  const effectiveStatusBadgeClass =
    effectiveStatus === 'running'
      ? 'badge badge-primary'
      : effectiveStatus === 'completed'
        ? 'badge badge-success'
        : effectiveStatus === 'failed'
          ? 'badge badge-error'
          : 'badge bg-secondary text-secondary-foreground'

  function renderStatusLabel(status: string | undefined) {
    if (!status) return '--'
    if (status === 'running') return '运行中'
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
    if (hasAutoExpandedRef.current) return
    if (taskFiles.length === 0) return

    setIsRightSidebarVisible(true)
    hasAutoExpandedRef.current = true

    const firstFile = findFirstPreviewableFile(taskFiles)
    if (!firstFile) return

    handleSelectArtifact(toFileArtifact(firstFile, getFileUrl, session?.work_dir || null))
  }, [taskFiles, handleSelectArtifact, getFileUrl, session?.work_dir])

  const handleClosePreview = useCallback(() => {
    setIsPreviewVisible(false)
    setSelectedArtifact(null)
    setShowLivePreview(false)
  }, [])

  function convertMessages() {
    if (!session) return []

    const messages: Array<{
      id: string
      type: 'user' | 'assistant' | 'tool' | 'error'
      content: string
      toolName?: string
      toolInput?: Record<string, unknown>
      timestamp: Date
    }> = []

    for (const msg of session.messages) {
      if (msg.type === 'user' && msg.content) {
        messages.push({
          id: String(msg.id),
          type: 'user',
          content: msg.content,
          timestamp: new Date(msg.createdAt),
        })
      } else if (msg.type === 'assistant' && msg.content) {
        messages.push({
          id: String(msg.id),
          type: 'assistant',
          content: msg.content,
          timestamp: new Date(msg.createdAt),
        })
      } else if (msg.type === 'tool_use' && msg.toolName) {
        const parsedToolInput =
          msg.toolInput && typeof msg.toolInput === 'object'
            ? msg.toolInput as Record<string, unknown>
            : undefined

        messages.push({
          id: String(msg.id),
          type: 'tool',
          content: msg.toolInput ? JSON.stringify(msg.toolInput, null, 2) : '',
          toolName: msg.toolName,
          toolInput: parsedToolInput,
          timestamp: new Date(msg.createdAt),
        })
      } else if (msg.type === 'tool_result' && msg.toolResult) {
        messages.push({
          id: `${msg.id}-result`,
          type: 'tool',
          content: msg.toolResult.substring(0, 500) + (msg.toolResult.length > 500 ? '...' : ''),
          toolName: '执行结果',
          timestamp: new Date(msg.createdAt),
        })
      }
    }

    if (messages.length === 0) {
      messages.push({
        id: 'query',
        type: 'user',
        content: session.query,
        timestamp: new Date(session.created_at),
      })
    }

    return messages
  }

  async function handleContinue(query: string) {
    if (!session) return
    agent.resumeSession(sessionId!)
    setContinuing(true)
    hasAutoExpandedRef.current = false  // 重置，让新产物可触发自动展开
    agent.execute(query)
  }

  const handleQuestionSubmit = useCallback(
    async (_questionId: string, answers: Record<string, string>) => {
      const answerText = Object.values(answers)
        .map((answer) => answer.trim())
        .filter(Boolean)
        .join('\n')

      if (!answerText) return
      await handleContinue(answerText)
    },
    [handleContinue],
  )

  useEffect(() => {
    if (continuing && !agent.isRunning && agent.messages.length > 0) {
      fetchTaskFiles()
    }
  }, [continuing, agent.isRunning, agent.messages.length])

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

  const historyMessages = convertMessages()
  const allMessages = continuing ? [...historyMessages, ...agent.messages] : historyMessages
  const activePendingQuestion = agent.pendingQuestion || (!continuing ? historyPendingQuestion : null)

  // 计算是否显示分隔条
  const showResizeHandle = isPreviewVisible || isRightSidebarVisible

  return (
    <div className="flex h-[calc(100vh-64px)]">
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
            <h2 className="text-lg font-semibold text-foreground">
              {getSkillName(session.skill_id)}
            </h2>
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
            {/* 时间 */}
            <div className="text-sm text-muted-foreground">
              {new Date(session.created_at).toLocaleString('zh-CN')}
            </div>
          </div>
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto mb-4 min-h-0">
          <MessageList messages={allMessages} isRunning={agent.isRunning} />
        </div>

        {/* 继续对话输入框 */}
        <div className="border-t border-border pt-4 shrink-0">
          {activePendingQuestion ? (
            <>
              <p className="text-sm text-muted-foreground mb-2">请先回答当前问题：</p>
              <QuestionInput
                pendingQuestion={activePendingQuestion}
                onSubmit={agent.pendingQuestion ? agent.respondToQuestion : handleQuestionSubmit}
              />
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-2">继续对话：</p>
              <ChatInput
                onSubmit={handleContinue}
                onStop={agent.stop}
                isRunning={agent.isRunning}
                placeholder="输入新的问题继续对话..."
              />
            </>
          )}
        </div>
      </div>

      {/* 分隔条（聊天面板与预览/侧栏之间） */}
      {showResizeHandle && (
        <ResizeHandle
          onResize={handleChatResize}
          onResizeEnd={handleChatResizeEnd}
          direction="horizontal"
        />
      )}

      {/* 中间：预览面板 */}
      {isPreviewVisible && (
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
            isRunning={agent.isRunning}
            artifacts={taskFiles}
            selectedArtifact={selectedArtifact}
            onSelectArtifact={handleSelectArtifact}
            getFileUrl={getFileUrl}
            workDir={session?.work_dir || null}
          />
        </div>
      )}
    </div>
  )
}
