/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     LaborAny Frontend - 根组件                            ║
 * ║                                                                          ║
 * ║  职责：路由配置、认证状态管理、布局                                         ║
 * ║  设计：借鉴 workany 的现代化布局系统                                        ║
 * ║  优化：使用 React.lazy 实现路由级别代码分割                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { NotificationBell } from './components/notification/NotificationBell'
import { RunningTasksIndicator } from './components/notification/RunningTasksIndicator'
import { API_BASE } from './config'
import { LaborAnyLogo } from './components/ui/LaborAnyLogo'
import { ModelProfileProvider } from './contexts/ModelProfileContext'

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

  return (
    <div className="min-h-screen bg-background flex">
      {/* 左侧边栏 */}
      <aside
        className={`fixed left-0 top-0 h-full bg-card border-r border-border flex flex-col transition-all duration-300 z-40 ${
          sidebarCollapsed ? 'w-16' : 'w-56'
        }`}
      >
          {/* Logo */}
          <div className="h-14 flex items-center justify-between px-4 border-b border-border">
            {!sidebarCollapsed && (
              <Link to="/" className="flex items-center gap-2">
                <LaborAnyLogo size={28} />
                <span className="font-bold text-foreground">LaborAny</span>
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
          <nav className="flex-1 p-3 space-y-1">
            <NavItem
              to="/"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>}
              label="首页"
              isCollapsed={sidebarCollapsed}
            />
            <NavItem
              to="/skills"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>}
              label="能力库"
              isCollapsed={sidebarCollapsed}
            />
            <NavItem
              to="/cron"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>}
              label="定时任务"
              isCollapsed={sidebarCollapsed}
            />
            <NavItem
              to="/history"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>}
              label="历史记录"
              isCollapsed={sidebarCollapsed}
            />
            <NavItem
              to="/memory"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>}
              label="记忆管理"
              isCollapsed={sidebarCollapsed}
            />
            <NavItem
              to="/settings"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>}
              label="设置"
              isCollapsed={sidebarCollapsed}
            />
          </nav>

          {/* 用户信息 */}
          <div className="p-3 border-t border-border">
            <div className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center' : ''}`}>
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
                {(profileName || 'U').charAt(0).toUpperCase()}
              </div>
              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{profileName || '本地用户'}</p>
                  <p className="text-xs text-muted-foreground">本地模式</p>
                </div>
              )}
            </div>
          </div>
      </aside>

      {/* 主内容区 */}
      <main
        className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-56'}`}
      >
        {/* 顶部通知栏 */}
        <div className="fixed top-0 right-0 h-14 flex items-center gap-4 px-6 z-30">
          <RunningTasksIndicator />
          <NotificationBell />
        </div>
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
