/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     通知铃铛组件                                          ║
 * ║                                                                          ║
 * ║  职责：显示未读通知数量，点击展开通知面板                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect, useRef } from 'react'
import { AGENT_API_BASE } from '../../config/api'
import { NotificationPanel } from './NotificationPanel'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           通知铃铛                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [showPanel, setShowPanel] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 轮询未读数量
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const res = await fetch(`${AGENT_API_BASE}/notifications/unread-count`)
        if (res.ok) {
          const data = await res.json()
          setUnreadCount(data.count)
        }
      } catch {
        // 静默失败
      }
    }

    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [])

  // 点击外部关闭面板
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowPanel(false)
      }
    }

    if (showPanel) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPanel])

  const handleMarkAllRead = () => {
    setUnreadCount(0)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="通知"
      >
        {/* 铃铛图标 */}
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* 未读数量徽章 */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-xs font-medium text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 通知面板 */}
      {showPanel && (
        <NotificationPanel
          onClose={() => setShowPanel(false)}
          onMarkAllRead={handleMarkAllRead}
        />
      )}
    </div>
  )
}
