/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         历史会话页面                                       ║
 * ║                                                                          ║
 * ║  展示用户的历史会话记录，支持查看详情和继续对话                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useAgent } from '../hooks/useAgent'
import { useVitePreview } from '../hooks/useVitePreview'
import type { TaskFile, Session, SessionDetail } from '../types'
import { API_BASE } from '../config'
import ChatInput from '../components/shared/ChatInput'
import MessageList from '../components/shared/MessageList'
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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           历史会话列表                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
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
    }
    const labels: Record<string, string> = {
      running: '运行中',
      completed: '已完成',
      failed: '失败',
      stopped: '已中止',
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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      递归查找第一个可预览文件                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      TaskFile → FileArtifact 转换                         │
 * │                                                                          │
 * │  注意：path 字段需要是绝对路径，用于 PDF 转换等需要文件系统路径的场景         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function toFileArtifact(
  file: TaskFile,
  getFileUrl: (path: string) => string,
  workDir: string | null,
): FileArtifact {
  const ext = file.ext || getExt(file.name)
  // 构建绝对路径：workDir + 相对路径
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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      布局常量                                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const CHAT_PANEL_MIN = 300
const CHAT_PANEL_MAX = 800
const CHAT_PANEL_DEFAULT = 450
const SIDEBAR_WIDTH = 280

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           会话详情页面                                     │
 * │  显示历史消息，支持继续对话，对齐 ExecutePage 的三面板布局                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [continuing, setContinuing] = useState(false)
  const [taskFiles, setTaskFiles] = useState<TaskFile[]>([])

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                           状态管理（对齐 ExecutePage）                     │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const [isPreviewVisible, setIsPreviewVisible] = useState(false)
  const [isRightSidebarVisible, setIsRightSidebarVisible] = useState(false)
  const [selectedArtifact, setSelectedArtifact] = useState<FileArtifact | null>(null)
  const [showLivePreview, setShowLivePreview] = useState(false)

  // 自动展开标记
  const hasAutoExpandedRef = useRef(false)

  // 可拖拽面板宽度
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

  // 用于继续对话的 agent hook
  const agent = useAgent(session?.skill_id || '')

  // Live Preview hook
  const {
    status: liveStatus,
    previewUrl,
    error: liveError,
    startPreview,
    stopPreview,
  } = useVitePreview(sessionId || null)

  useEffect(() => {
    if (sessionId) {
      fetchSessionDetail()
      fetchTaskFiles()
    }
  }, [sessionId])

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

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                      选中 artifact 时打开预览                             │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const handleSelectArtifact = useCallback((artifact: FileArtifact) => {
    setSelectedArtifact(artifact)
    setIsPreviewVisible(true)
    setShowLivePreview(false)
  }, [])

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                      启动 Live Preview                                   │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const handleStartLivePreview = useCallback(() => {
    if (session?.work_dir) {
      setShowLivePreview(true)
      setIsPreviewVisible(true)
      startPreview(session.work_dir)
    }
  }, [session?.work_dir, startPreview])

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                      自动展开预览面板                                     │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  useEffect(() => {
    if (hasAutoExpandedRef.current) return
    if (taskFiles.length === 0) return

    setIsRightSidebarVisible(true)
    hasAutoExpandedRef.current = true

    const firstFile = findFirstPreviewableFile(taskFiles)
    if (!firstFile) return

    handleSelectArtifact(toFileArtifact(firstFile, getFileUrl, session?.work_dir || null))
  }, [taskFiles, handleSelectArtifact, getFileUrl, session?.work_dir])

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                      关闭预览                                            │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const handleClosePreview = useCallback(() => {
    setIsPreviewVisible(false)
    setSelectedArtifact(null)
    setShowLivePreview(false)
  }, [])

  // 将历史消息转换为 MessageList 需要的格式
  function convertMessages() {
    if (!session) return []

    const messages: Array<{
      id: string
      type: 'user' | 'assistant' | 'tool' | 'error'
      content: string
      toolName?: string
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
        messages.push({
          id: String(msg.id),
          type: 'tool',
          content: msg.toolInput ? JSON.stringify(msg.toolInput, null, 2) : '',
          toolName: msg.toolName,
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

  // 继续对话
  async function handleContinue(query: string) {
    if (!session) return
    setContinuing(true)
    navigate(`/execute/${session.skill_id}?continue=${sessionId}&query=${encodeURIComponent(query)}`)
  }

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

  // 计算是否显示分隔条
  const showResizeHandle = isPreviewVisible || isRightSidebarVisible

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* ════════════════════════════════════════════════════════════════════
       * 左侧：聊天面板
       * ════════════════════════════════════════════════════════════════════ */}
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
              {session.skill_id}
            </h2>
            <span className={`badge ${
              session.status === 'completed' ? 'badge-success' :
              session.status === 'failed' ? 'badge-error' :
              'bg-secondary text-secondary-foreground'
            }`}>
              {session.status === 'completed' ? '已完成' :
               session.status === 'failed' ? '失败' :
               session.status === 'stopped' ? '已中止' : session.status}
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
                  🚀 Live
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
          <p className="text-sm text-muted-foreground mb-2">继续对话：</p>
          <ChatInput
            onSubmit={handleContinue}
            onStop={agent.stop}
            isRunning={agent.isRunning}
            placeholder="输入新的问题继续对话..."
          />
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
       * 分隔条（聊天面板和预览面板之间）
       * ════════════════════════════════════════════════════════════════════ */}
      {showResizeHandle && (
        <ResizeHandle
          onResize={handleChatResize}
          onResizeEnd={handleChatResizeEnd}
          direction="horizontal"
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════
       * 中间：预览面板
       * ════════════════════════════════════════════════════════════════════ */}
      {isPreviewVisible && (
        <div className="flex-1 min-w-[300px] border-l border-border">
          {showLivePreview ? (
            /* Live Preview */
            <div className="flex h-full flex-col">
              <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Live Preview</span>
                  {liveStatus === 'running' && (
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
                  status={liveStatus}
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

      {/* ════════════════════════════════════════════════════════════════════
       * 右侧：侧边栏
       * ════════════════════════════════════════════════════════════════════ */}
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
