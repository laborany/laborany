/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         历史会话页面                                       ║
 * ║                                                                          ║
 * ║  展示用户的历史会话记录，支持查看详情和继续对话                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect, useRef, useCallback } from 'react'
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
  type: string
  content: {
    type: string
    content?: string
    toolName?: string
    toolInput?: unknown
  } | null
  created_at: string
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
      running: 'bg-blue-100 text-blue-700',
      completed: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
      stopped: 'bg-gray-100 text-gray-700',
    }
    const labels: Record<string, string> = {
      running: '运行中',
      completed: '已完成',
      failed: '失败',
      stopped: '已中止',
    }
    return (
      <span className={`px-2 py-1 text-xs rounded ${styles[status] || styles.stopped}`}>
        {labels[status] || status}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-200 rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/" className="text-gray-500 hover:text-gray-700">
          ← 返回
        </Link>
        <h2 className="text-2xl font-bold">历史会话</h2>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          暂无历史会话
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <Link
              key={session.id}
              to={`/history/${session.id}`}
              className="block p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="font-medium text-gray-900 line-clamp-2">
                    {session.query}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
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

    // 添加原始查询作为用户消息
    messages.push({
      id: 'query',
      type: 'user',
      content: session.query,
      timestamp: new Date(session.created_at),
    })

    // 添加历史消息
    for (const msg of session.messages) {
      if (!msg.content) continue

      if (msg.content.type === 'text') {
        messages.push({
          id: String(msg.id),
          type: 'assistant',
          content: msg.content.content || '',
          timestamp: new Date(msg.created_at),
        })
      } else if (msg.content.type === 'tool_use') {
        messages.push({
          id: String(msg.id),
          type: 'tool',
          content: JSON.stringify(msg.content.toolInput, null, 2),
          toolName: msg.content.toolName,
          timestamp: new Date(msg.created_at),
        })
      }
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
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center py-12 text-gray-500">
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
          <Link to="/history" className="text-gray-500 hover:text-gray-700">
            ← 返回历史
          </Link>
          <h2 className="text-lg font-semibold">
            {session.skill_id}
          </h2>
          <span className={`px-2 py-1 text-xs rounded ${
            session.status === 'completed' ? 'bg-green-100 text-green-700' :
            session.status === 'failed' ? 'bg-red-100 text-red-700' :
            'bg-gray-100 text-gray-700'
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
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              <span>📁</span>
              产出文件 ({countTaskFiles(taskFiles)})
            </button>
          )}
          <div className="text-sm text-gray-500">
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
      <div className="border-t pt-4">
        <p className="text-sm text-gray-500 mb-2">继续对话：</p>
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
    <div className="mb-4 bg-white border rounded-lg shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-medium">产出文件</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
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
              <div className="flex items-center gap-2 py-1 text-sm text-gray-600">
                <span>📁</span>
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
    <div className="flex items-center justify-between py-1 text-sm hover:bg-gray-50 rounded px-2 -mx-2">
      <div className="flex items-center gap-2 min-w-0">
        <span>{icon}</span>
        <span className="truncate">{file.name}</span>
        {size && <span className="text-xs text-gray-400">({size})</span>}
      </div>
      <div className="flex items-center gap-2 ml-2">
        {isPreviewable && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-600 hover:text-primary-700"
          >
            预览
          </a>
        )}
        <a
          href={url}
          download={file.name}
          className="text-xs text-gray-500 hover:text-gray-700"
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
