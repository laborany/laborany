/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         历史会话页面                                       ║
 * ║                                                                          ║
 * ║  展示用户的历史会话记录，支持查看详情和继续对话                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useAgent, TaskFile } from '../hooks/useAgent'
import ChatInput from '../components/shared/ChatInput'
import MessageList from '../components/shared/MessageList'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface Session {
  id: string
  skill_id: string
  query: string
  status: string
  cost: number
  created_at: string
}

interface MessageItem {
  id: number
  type: string  // 'user', 'assistant', 'tool_use', 'tool_result'
  content: string | null
  toolName: string | null
  toolInput: unknown | null
  toolResult: string | null
  createdAt: string
}

interface SessionDetail extends Session {
  messages: MessageItem[]
}

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
      const res = await fetch('/api/sessions', {
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
 * │                           会话详情页面                                     │
 * │  显示历史消息，支持继续对话                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [continuing, setContinuing] = useState(false)
  const [taskFiles, setTaskFiles] = useState<TaskFile[]>([])
  const [showFiles, setShowFiles] = useState(false)

  // 用于继续对话的 agent hook
  const agent = useAgent(session?.skill_id || '')

  useEffect(() => {
    if (sessionId) {
      fetchSessionDetail()
      fetchTaskFiles()
    }
  }, [sessionId])

  async function fetchSessionDetail() {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/sessions/${sessionId}`, {
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
      const res = await fetch(`/api/task/${sessionId}/files`, {
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
    (path: string) => `/api/task/${sessionId}/files/${path}`,
    [sessionId],
  )

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

    // 遍历数据库中的消息
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
        // 工具结果可以选择性显示
        messages.push({
          id: `${msg.id}-result`,
          type: 'tool',
          content: msg.toolResult.substring(0, 500) + (msg.toolResult.length > 500 ? '...' : ''),
          toolName: '执行结果',
          timestamp: new Date(msg.createdAt),
        })
      }
    }

    // 如果没有消息记录，至少显示原始查询
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
    // 跳转到执行页面，带上历史上下文
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 h-[calc(100vh-64px)] flex flex-col">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between mb-4">
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
        <div className="flex items-center gap-4">
          {taskFiles.length > 0 && (
            <button
              onClick={() => setShowFiles(!showFiles)}
              className="text-sm text-primary hover:text-primary/80 flex items-center gap-1.5 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              产出文件 ({countTaskFiles(taskFiles)})
            </button>
          )}
          <div className="text-sm text-muted-foreground">
            {new Date(session.created_at).toLocaleString('zh-CN')}
          </div>
        </div>
      </div>

      {/* 文件列表面板 */}
      {showFiles && taskFiles.length > 0 && (
        <HistoryFilesPanel
          files={taskFiles}
          getFileUrl={getFileUrl}
          onClose={() => setShowFiles(false)}
        />
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto mb-4">
        <MessageList messages={allMessages} />
      </div>

      {/* 继续对话输入框 */}
      <div className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground mb-2">继续对话：</p>
        <ChatInput
          onSubmit={handleContinue}
          onStop={agent.stop}
          isRunning={agent.isRunning}
          placeholder="输入新的问题继续对话..."
        />
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       历史文件面板                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function HistoryFilesPanel({
  files,
  getFileUrl,
  onClose,
}: {
  files: TaskFile[]
  getFileUrl: (path: string) => string
  onClose: () => void
}) {
  return (
    <div className="mb-4 card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <h3 className="font-medium text-foreground">产出文件</h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-4 max-h-64 overflow-y-auto">
        <HistoryFileTree files={files} getFileUrl={getFileUrl} depth={0} />
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       文件树组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function HistoryFileTree({
  files,
  getFileUrl,
  depth,
}: {
  files: TaskFile[]
  getFileUrl: (path: string) => string
  depth: number
}) {
  return (
    <div className="space-y-1">
      {files.map((file) => (
        <div key={file.path} style={{ marginLeft: depth * 16 }}>
          {file.type === 'folder' ? (
            <div>
              <div className="flex items-center gap-2 py-1.5 text-sm text-muted-foreground">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span>{file.name}</span>
              </div>
              {file.children && (
                <HistoryFileTree
                  files={file.children}
                  getFileUrl={getFileUrl}
                  depth={depth + 1}
                />
              )}
            </div>
          ) : (
            <HistoryFileItem file={file} getFileUrl={getFileUrl} />
          )}
        </div>
      ))}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       单个文件项                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function HistoryFileItem({
  file,
  getFileUrl,
}: {
  file: TaskFile
  getFileUrl: (path: string) => string
}) {
  const url = getFileUrl(file.path)
  const isPreviewable = ['html', 'htm', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'pdf', 'txt', 'md'].includes(
    file.ext || '',
  )

  const icon = getHistoryFileIcon(file.ext || '')
  const size = file.size ? formatHistoryFileSize(file.size) : ''

  return (
    <div className="flex items-center justify-between py-1.5 text-sm hover:bg-accent rounded-md px-2 -mx-2 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span>{icon}</span>
        <span className="truncate text-foreground">{file.name}</span>
        {size && <span className="text-xs text-muted-foreground">({size})</span>}
      </div>
      <div className="flex items-center gap-2 ml-2">
        {isPreviewable && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:text-primary/80 transition-colors"
          >
            预览
          </a>
        )}
        <a
          href={url}
          download={file.name}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          下载
        </a>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           辅助函数                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function countTaskFiles(files: TaskFile[]): number {
  let count = 0
  for (const file of files) {
    if (file.type === 'file') {
      count++
    } else if (file.children) {
      count += countTaskFiles(file.children)
    }
  }
  return count
}

function getHistoryFileIcon(ext: string): string {
  const icons: Record<string, string> = {
    html: '🌐',
    htm: '🌐',
    pdf: '📕',
    doc: '📘',
    docx: '📘',
    xls: '📗',
    xlsx: '📗',
    ppt: '📙',
    pptx: '📙',
    png: '🖼️',
    jpg: '🖼️',
    jpeg: '🖼️',
    gif: '🖼️',
    svg: '🖼️',
    txt: '📄',
    md: '📝',
    json: '📋',
    csv: '📊',
    py: '🐍',
    js: '📜',
    ts: '📜',
  }
  return icons[ext] || '📄'
}

function formatHistoryFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
