/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     LaborAny Frontend - 根组件                            ║
 * ║                                                                          ║
 * ║  职责：路由配置、认证状态管理、布局                                         ║
 * ║  设计：借鉴 workany 的现代化布局系统                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState } from 'react'
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import ExecutePage from './pages/ExecutePage'
import HistoryPage, { SessionDetailPage } from './pages/HistoryPage'
import SkillsPage from './pages/SkillsPage'
import WorkflowsPage from './pages/WorkflowsPage'
import WorkflowEditPage from './pages/WorkflowEditPage'
import WorkflowRunPage from './pages/WorkflowRunPage'
import WorkflowHistoryPage, { WorkflowRunDetailPage } from './pages/WorkflowHistoryPage'
import SettingsPage from './pages/SettingsPage'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           受保护路由                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">加载中...</span>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

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
function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const location = useLocation()

  // 登录页不显示侧边栏
  if (location.pathname === '/login') {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* 左侧边栏 */}
      {user && (
        <aside
          className={`fixed left-0 top-0 h-full bg-card border-r border-border flex flex-col transition-all duration-300 z-40 ${
            sidebarCollapsed ? 'w-16' : 'w-56'
          }`}
        >
          {/* Logo */}
          <div className="h-14 flex items-center justify-between px-4 border-b border-border">
            {!sidebarCollapsed && (
              <Link to="/" className="flex items-center gap-2">
                <span className="text-xl">🤖</span>
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
              label="Skills"
              isCollapsed={sidebarCollapsed}
            />
            <NavItem
              to="/workflows"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>}
              label="工作流"
              isCollapsed={sidebarCollapsed}
            />
            <NavItem
              to="/history"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>}
              label="历史"
              isCollapsed={sidebarCollapsed}
            />
            <NavItem
              to="/workflow-history"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>}
              label="工作流历史"
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
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
                  <button
                    onClick={logout}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>
      )}

      {/* 主内容区 */}
      <main
        className={`flex-1 transition-all duration-300 ${
          user ? (sidebarCollapsed ? 'ml-16' : 'ml-56') : ''
        }`}
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
  return (
    <AuthProvider>
      <AppLayout>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/execute/:skillId"
            element={
              <ProtectedRoute>
                <ExecutePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <HistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history/:sessionId"
            element={
              <ProtectedRoute>
                <SessionDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/skills"
            element={
              <ProtectedRoute>
                <SkillsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workflows"
            element={
              <ProtectedRoute>
                <WorkflowsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workflows/new"
            element={
              <ProtectedRoute>
                <WorkflowEditPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workflows/:workflowId/edit"
            element={
              <ProtectedRoute>
                <WorkflowEditPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workflows/:workflowId/run"
            element={
              <ProtectedRoute>
                <WorkflowRunPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workflow-history"
            element={
              <ProtectedRoute>
                <WorkflowHistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workflow-history/:runId"
            element={
              <ProtectedRoute>
                <WorkflowRunDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AppLayout>
    </AuthProvider>
  )
}
