/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     通知面板组件                                          ║
 * ║                                                                          ║
 * ║  职责：展示通知列表，支持标记已读和跳转详情                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AGENT_API_BASE } from '../../config/api'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

interface Notification {
  id: number
  type: 'cron_success' | 'cron_error' | 'task_success' | 'task_error'
  title: string
  content?: string
  read: boolean
  jobId?: string
  sessionId?: string
  createdAt: string
}

interface NotificationPanelProps {
  onClose: () => void
  onMarkAllRead: () => void
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           通知类型配置                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */

const typeConfig: Record<Notification['type'], { label: string; color: string }> = {
  cron_success: { label: '定时任务', color: 'bg-green-500' },
  cron_error: { label: '定时任务', color: 'bg-red-500' },
  task_success: { label: '后台任务', color: 'bg-blue-500' },
  task_error: { label: '后台任务', color: 'bg-red-500' },
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           通知面板                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function NotificationPanel({ onClose, onMarkAllRead }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchNotifications()
  }, [])

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${AGENT_API_BASE}/notifications?limit=20`)
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications)
      }
    } catch {
      // 静默失败
    } finally {
      setLoading(false)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await fetch(`${AGENT_API_BASE}/notifications/read-all`, { method: 'POST' })
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      onMarkAllRead()
    } catch {
      // 静默失败
    }
  }

  const handleMarkRead = async (id: number) => {
    try {
      await fetch(`${AGENT_API_BASE}/notifications/${id}/read`, { method: 'POST' })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    } catch {
      // 静默失败
    }
  }

  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHour = Math.floor(diffMs / 3600000)
    const diffDay = Math.floor(diffMs / 86400000)

    if (diffMin < 1) return '刚刚'
    if (diffMin < 60) return `${diffMin} 分钟前`
    if (diffHour < 24) return `${diffHour} 小时前`
    if (diffDay < 7) return `${diffDay} 天前`
    return date.toLocaleDateString('zh-CN')
  }

  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-1rem))] overflow-hidden rounded-lg border border-border bg-card shadow-lg">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-medium text-foreground">通知</h3>
        <button
          onClick={handleMarkAllRead}
          className="text-xs text-primary hover:underline"
        >
          全部标为已读
        </button>
      </div>

      {/* 通知列表 */}
      <div className="max-h-[min(60vh,24rem)] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            暂无通知
          </div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              className={`px-4 py-3 border-b border-border last:border-b-0 hover:bg-accent/50 transition-colors ${
                !notification.read ? 'bg-primary/5' : ''
              }`}
              onClick={() => !notification.read && handleMarkRead(notification.id)}
            >
              <div className="flex items-start gap-2">
                {/* 状态指示器 */}
                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                  typeConfig[notification.type].color
                }`} />

                <div className="flex-1 min-w-0">
                  {/* 类型标签 + 标题 */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">
                      {typeConfig[notification.type].label}
                    </span>
                  </div>
                  <p className={`text-sm ${!notification.read ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                    {notification.title}
                  </p>

                  {/* 内容摘要 */}
                  {notification.content && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {notification.content}
                    </p>
                  )}

                  {/* 底部：时间 + 查看详情 */}
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs text-muted-foreground">
                      {formatTime(notification.createdAt)}
                    </span>
                    {notification.sessionId && (
                      <Link
                        to={notification.type.startsWith('task_')
                          ? `/history/${notification.sessionId}`
                          : `/history/${notification.sessionId}`
                        }
                        onClick={(e) => {
                          e.stopPropagation()
                          onClose()
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        查看详情
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 底部：查看全部 */}
      {notifications.length > 0 && (
        <div className="px-4 py-2 border-t border-border">
          <Link
            to="/cron"
            onClick={onClose}
            className="text-xs text-primary hover:underline"
          >
            查看所有定时任务 →
          </Link>
        </div>
      )}
    </div>
  )
}
