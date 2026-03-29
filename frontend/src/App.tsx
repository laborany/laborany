/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     LaborAny Frontend - 根组件                            ║
 * ║                                                                          ║
 * ║  职责：路由配置、认证状态管理、布局                                         ║
 * ║  设计：借鉴 workany 的现代化布局系统                                        ║
 * ║  优化：使用 React.lazy 实现路由级别代码分割                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect, Suspense, lazy, useMemo, useCallback } from 'react'
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { NotificationBell } from './components/notification/NotificationBell'
import { RunningTasksIndicator } from './components/notification/RunningTasksIndicator'
import { API_BASE } from './config'
import { LaborAnyLogo } from './components/ui/LaborAnyLogo'
import { ModelProfileProvider } from './contexts/ModelProfileContext'
import { COMPANY_APP_COPY, getCompanyNavLabel } from './lib/companySemantics'
import { useSkillNameMap } from './hooks/useSkillNameMap'
import type { WorkDetailResponse, WorkSummary } from './types'
import { buildWorkRecordFromWorkSummary, type WorkRecordItem } from './lib/workRecords'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           懒加载页面组件                                   │
 * │  好品味：按需加载，减少首屏加载时间                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const SetupPage = lazy(() => import('./pages/SetupPage'))
const HomePage = lazy(() => import('./pages/HomePage'))
const ExecutePage = lazy(() => import('./pages/ExecutePage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage').then(m => ({ default: m.default })))
const SessionDetailPage = lazy(() => import('./pages/HistoryPage').then(m => ({ default: m.SessionDetailPage })))
const SkillsPage = lazy(() => import('./pages/SkillsPage'))
const CreatePage = lazy(() => import('./pages/CreatePage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const CronPage = lazy(() => import('./pages/CronPage'))
const MemoryPage = lazy(() => import('./pages/MemoryPage'))

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           加载占位组件                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        <span className="text-sm text-muted-foreground">加载中...</span>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                  统一执行入口：/execute/:id                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           侧边栏导航项                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function NavItem({
  to,
  icon,
  label,
  isCollapsed,
}: {
  to: string
  icon: React.ReactNode
  label: string
  isCollapsed: boolean
}) {
  const location = useLocation()
  const isActive = location.pathname === to || location.pathname.startsWith(to + '/')

  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
      title={isCollapsed ? label : undefined}
    >
      <span className="flex-shrink-0">{icon}</span>
      {!isCollapsed && <span className="text-sm font-medium">{label}</span>}
    </Link>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           应用布局（借鉴 workany 三栏布局）                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function AppLayout({
  children,
  profileName,
}: {
  children: React.ReactNode
  profileName: string
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [workRecords, setWorkRecords] = useState<WorkRecordItem[]>([])
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null)
  const [workSearch, setWorkSearch] = useState('')
  const [workSectionCollapsed, setWorkSectionCollapsed] = useState(false)
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const { getSkillName } = useSkillNameMap()

  const refreshWorkRecords = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/works`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) return
      const data = await res.json() as { works?: WorkSummary[] }
      const works = Array.isArray(data.works) ? data.works : []
      setWorkRecords(
        works
          .slice(0, 100)
          .map((work) => buildWorkRecordFromWorkSummary(work, [], getSkillName)),
      )
    } catch {
      // ignore
    }
  }, [getSkillName])

  useEffect(() => {
    void refreshWorkRecords()
    const timer = window.setInterval(() => { void refreshWorkRecords() }, 15000)
    return () => window.clearInterval(timer)
  }, [refreshWorkRecords])

  useEffect(() => {
    void refreshWorkRecords()
  }, [location.pathname, refreshWorkRecords])

  useEffect(() => {
    const match = location.pathname.match(/^\/history\/([^/]+)/)
    if (!match) {
      setSelectedRecordId(null)
      return
    }

    const targetSessionId = decodeURIComponent(match[1])
    const token = localStorage.getItem('token')
    let cancelled = false

    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/works/by-session/${encodeURIComponent(targetSessionId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!res.ok) {
          if (!cancelled) setSelectedRecordId(null)
          return
        }
        const data = await res.json() as WorkDetailResponse
        if (!cancelled) setSelectedRecordId(data.work?.id || null)
      } catch {
        if (!cancelled) setSelectedRecordId(null)
      }
    })()

    return () => { cancelled = true }
  }, [location.pathname])

  const getOwnerTagLabel = useCallback((record: WorkRecordItem) => {
    if (record.collaborationLabel) {
      return record.collaborationLabel.replace(' -> ', ' | ')
    }
    return getSkillName(record.currentOwnerSkillId)
  }, [getSkillName])

  const getStatusTagLabel = useCallback((status: string) => {
    if (status === 'running') return '运行中'
    if (status === 'waiting_input') return '待补充'
    if (status === 'completed') return '已完成'
    if (status === 'failed') return '失败'
    return '已中止'
  }, [])

  const getStatusIcon = useCallback((status: string) => {
    if (status === 'running') {
      return (
        <svg className="h-4 w-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
    if (status === 'waiting_input') {
      return (
        <svg className="h-4 w-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-4 4v-4z" />
        </svg>
      )
    }
    if (status === 'completed') {
      return (
        <svg className="h-4 w-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )
    }
    if (status === 'failed') {
      return (
        <svg className="h-4 w-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )
    }
    return (
      <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    )
  }, [])

  const filteredWorkRecords = useMemo(() => {
    const keyword = workSearch.trim().toLowerCase()
    if (!keyword) return workRecords
    return workRecords.filter((record) => {
      const owner = getOwnerTagLabel(record).toLowerCase()
      return record.title.toLowerCase().includes(keyword) || owner.includes(keyword)
    })
  }, [workRecords, workSearch, getOwnerTagLabel])

  const handleDeleteRecord = useCallback(async (record: WorkRecordItem, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    const confirmText = record.sessionCount > 1
      ? '确定要删除这条协作工作记录吗？这会删除该工作下的个人助理和员工执行会话，此操作无法撤销。'
      : '确定要删除这条工作记录吗？此操作无法撤销。'
    if (!confirm(confirmText)) return

    setDeletingRecordId(record.id)
    try {
      const token = localStorage.getItem('token')
      if (record.workId) {
        const res = await fetch(`${API_BASE}/works/${record.workId}`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error((data as { error?: string }).error || '删除失败')
        }
      } else {
        const sessionIds = record.sessions.map((session) => session.id)
        for (const sessionId of sessionIds) {
          const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
            method: 'DELETE',
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error((data as { error?: string }).error || '删除失败')
          }
        }
      }
      setWorkRecords((prev) => prev.filter((item) => item.id !== record.id))
      if (selectedRecordId === record.id) {
        navigate('/history')
      }
    } catch {
      alert('删除失败，请稍后重试')
    } finally {
      setDeletingRecordId(null)
    }
  }, [navigate, selectedRecordId])

  return (
    <div className="min-h-screen bg-background flex">
      {/* 左侧边栏 */}
      <aside
        className={`fixed left-0 top-0 h-full bg-card border-r border-border flex flex-col transition-all duration-300 z-40 ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
          {/* Logo */}
          <div className="h-14 flex items-center justify-between px-4 border-b border-border">
            {!sidebarCollapsed && (
              <Link to="/" className="flex items-center gap-2">
                <LaborAnyLogo size={28} />
                <div className="min-w-0">
                  <span className="block font-bold text-foreground">{COMPANY_APP_COPY.brandTitle}</span>
                  <span className="block text-[10px] leading-3 text-muted-foreground">
                    {COMPANY_APP_COPY.brandSubtitle}
                  </span>
                </div>
              </Link>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
              title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            >
              {sidebarCollapsed ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              )}
            </button>
          </div>

          {/* 导航菜单 */}
          <div className="border-b border-border/60 p-3">
          <nav className="space-y-1">
            <NavItem
              to="/"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>}
              label={getCompanyNavLabel('home', sidebarCollapsed)}
              isCollapsed={sidebarCollapsed}
            />
            <NavItem
              to="/skills"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>}
              label={getCompanyNavLabel('skills', sidebarCollapsed)}
              isCollapsed={sidebarCollapsed}
            />
            <NavItem
              to="/cron"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>}
              label={getCompanyNavLabel('cron', sidebarCollapsed)}
              isCollapsed={sidebarCollapsed}
            />
            <NavItem
              to="/memory"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>}
              label={getCompanyNavLabel('memory', sidebarCollapsed)}
              isCollapsed={sidebarCollapsed}
            />
            <NavItem
              to="/settings"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>}
              label={getCompanyNavLabel('settings', sidebarCollapsed)}
              isCollapsed={sidebarCollapsed}
            />
          </nav>
          </div>

          {!sidebarCollapsed && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-border/60 px-3 py-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  工作记录
                </p>
                <button
                  type="button"
                  onClick={() => setWorkSectionCollapsed((value) => !value)}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title={workSectionCollapsed ? '展开工作记录' : '折叠工作记录'}
                >
                  <svg className={`h-4 w-4 transition-transform ${workSectionCollapsed ? '-rotate-90' : 'rotate-0'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              {!workSectionCollapsed && (
                <>
                  <div className="shrink-0 pb-3">
                    <input
                      value={workSearch}
                      onChange={(event) => setWorkSearch(event.target.value)}
                      placeholder="搜索工作记录"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[13px] outline-none transition-colors placeholder:text-[13px] placeholder:text-muted-foreground/70 focus:border-primary/40"
                    />
                  </div>
              <div className="mt-2 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 pb-40 pt-1">
                {filteredWorkRecords.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                    {workSearch.trim() ? '没有匹配的工作记录' : '暂无工作记录'}
                  </div>
                ) : (
                  filteredWorkRecords.slice(0, 10).map((record) => {
                    const isActive = selectedRecordId === record.id
                    return (
                      <button
                        key={record.id}
                        type="button"
                        onClick={() => navigate(`/history/${record.primarySessionId}`)}
                        className={`group relative w-full rounded-2xl border px-3 pb-4 pt-3 text-left transition-all ${
                          isActive
                            ? 'border-primary/40 bg-primary/8 shadow-sm ring-1 ring-primary/15'
                            : 'border-border bg-background hover:border-primary/20 hover:bg-accent/20'
                        }`}
                      >
                        {isActive && (
                          <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-primary" />
                        )}
                        <div className="relative pl-1">
                          <p className="line-clamp-2 pr-8 text-[15px] font-semibold leading-6 text-foreground">
                            {record.title}
                          </p>
                          <div className="absolute right-1 top-0 flex h-6 w-6 items-center justify-center">
                            <span title={getStatusTagLabel(record.status)}>
                              {getStatusIcon(record.status)}
                            </span>
                          </div>
                          <div className="mt-2 pr-8">
                            <span className="inline-flex max-w-[calc(100%-2rem)] items-center overflow-hidden whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-[11px] leading-none text-slate-700 text-ellipsis">
                              {getOwnerTagLabel(record)}
                            </span>
                          </div>
                          <div className="absolute bottom-0 right-1 flex h-6 w-6 items-center justify-center">
                            <button
                              type="button"
                              onClick={(event) => { void handleDeleteRecord(record, event) }}
                              disabled={deletingRecordId === record.id}
                              className="rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                              title={record.sessionCount > 1 ? '删除整条协作工作记录' : '删除这条工作记录'}
                            >
                              {deletingRecordId === record.id ? (
                                <svg className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              ) : (
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
                </>
              )}
            </div>
          )}

          <div className="border-t border-border p-3">
            <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-1'} mb-3`}>
              <RunningTasksIndicator panelPlacement="right" />
              <NotificationBell panelPlacement="right" />
            </div>

            <div className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center' : ''}`}>
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
                {(profileName || 'U').charAt(0).toUpperCase()}
              </div>
              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{profileName || '老板'}</p>
                  <p className="text-xs text-muted-foreground">{COMPANY_APP_COPY.bossWorkspaceLabel}</p>
                </div>
              )}
            </div>
          </div>
      </aside>

      {/* 主内容区 */}
      <main
        className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}
      >
        {children}
      </main>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           根组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export default function App() {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null)
  const [profileName, setProfileName] = useState<string>('')

  // 检查是否需要初始化设置
  useEffect(() => {
    void checkSetupStatus()
  }, [])

  async function checkSetupStatus() {
    try {
      const res = await fetch(`${API_BASE}/setup/status`)
      const data = await res.json()
      setSetupComplete(data.ready)
      if (data.profile?.name) {
        setProfileName(data.profile.name)
        localStorage.setItem('laborany.profile.name', data.profile.name)
      } else {
        const cachedName = localStorage.getItem('laborany.profile.name') || ''
        setProfileName(cachedName)
      }
      if (data.ready) {
        localStorage.setItem('token', 'local-session')
      }
    } catch {
      // API 未就绪，显示设置页面
      setSetupComplete(false)
    }
  }

  // 加载中
  if (setupComplete === null) {
    return <PageLoader />
  }

  // 需要设置
  if (!setupComplete) {
    return (
      <Suspense fallback={<PageLoader />}>
        <SetupPage onReady={() => { void checkSetupStatus() }} />
      </Suspense>
    )
  }

  // 正常应用
  return (
    <ErrorBoundary>
      <ModelProfileProvider>
        <AppLayout profileName={profileName}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="/" element={<HomePage />} />
              <Route path="/execute/:skillId" element={<ExecutePage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/history/launch/:skillId" element={<ExecutePage />} />
              <Route path="/history/:sessionId" element={<SessionDetailPage />} />
              <Route path="/skills" element={<SkillsPage />} />
              <Route path="/create" element={<CreatePage />} />
              <Route path="/cron" element={<CronPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/memory" element={<MemoryPage />} />
            </Routes>
          </Suspense>
        </AppLayout>
      </ModelProfileProvider>
    </ErrorBoundary>
  )
}
