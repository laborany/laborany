/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     运行中任务指示器                                      ║
 * ║                                                                          ║
 * ║  职责：显示后台运行中的任务数量，点击展开任务列表                            ║
 * ║  设计：与 NotificationBell 风格一致，放置在顶部导航栏                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE } from '../../config/api'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

interface RunningTask {
  sessionId: string
  skillId: string
  skillName: string
  startedAt: string
  source?: 'desktop' | 'converse' | 'cron' | 'feishu'
  query?: string
}

function getTaskSourceLabel(source?: RunningTask['source']): string {
  if (source === 'cron') return '定时'
  if (source === 'feishu') return '飞书'
  if (source === 'converse') return '首页'
  return '桌面'
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           运行中任务指示器                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function RunningTasksIndicator() {
  const [tasks, setTasks] = useState<RunningTask[]>([])
  const [showPanel, setShowPanel] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 轮询运行中任务
  useEffect(() => {
    const fetchRunningTasks = async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`${API_BASE}/sessions/running-tasks`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (res.ok) {
          const data = await res.json()
          const taskList = Array.isArray(data.tasks) ? data.tasks as RunningTask[] : []
          taskList.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
          setTasks(taskList)
        }
      } catch {
        // 静默失败
      }
    }

    fetchRunningTasks()
    const interval = setInterval(fetchRunningTasks, 5000) // 每 5 秒轮询
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

  // 格式化运行时间
  const formatDuration = (startedAt: string): string => {
    const start = new Date(startedAt.endsWith('Z') ? startedAt : startedAt + 'Z').getTime()
    const now = Date.now()
    const diffSec = Math.floor((now - start) / 1000)

    if (diffSec < 60) return `${diffSec} 秒`
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin} 分钟`
    const diffHour = Math.floor(diffMin / 60)
    return `${diffHour} 小时 ${diffMin % 60} 分钟`
  }

  // 没有运行中的任务时不显示
  if (tasks.length === 0) return null

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="relative p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        title="运行中的任务"
      >
        {/* 旋转的加载图标 */}
        <svg
          className="w-5 h-5 animate-spin"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>

        {/* 任务数量徽章 */}
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-xs font-medium text-white bg-blue-500 rounded-full">
          {tasks.length > 9 ? '9+' : tasks.length}
        </span>
      </button>

      {/* 任务列表面板 */}
      {showPanel && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-lg shadow-lg z-50">
          {/* 头部 */}
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-medium text-foreground">运行中的任务</h3>
          </div>

          {/* 任务列表 */}
          <div className="max-h-64 overflow-y-auto">
            {tasks.map((task) => (
              <Link
                key={task.sessionId}
                to={`/history/${encodeURIComponent(task.sessionId)}`}
                onClick={() => setShowPanel(false)}
                className="block px-4 py-3 border-b border-border last:border-b-0 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {/* 运行中指示器 */}
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {task.skillName || task.query || task.skillId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {getTaskSourceLabel(task.source)} · 已运行 {formatDuration(task.startedAt)}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
