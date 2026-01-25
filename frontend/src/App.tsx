/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     LaborAny Frontend - 根组件                            ║
 * ║                                                                          ║
 * ║  职责：路由配置、认证状态管理、布局                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Routes, Route, Navigate, Link } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import ExecutePage from './pages/ExecutePage'
import HistoryPage, { SessionDetailPage } from './pages/HistoryPage'
import SkillsPage from './pages/SkillsPage'

/* ┌───────────────────────────────────────────────────────────────────��──────┐
 * │                           受保护路由                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           应用布局                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xl font-bold text-primary-600">
              LaborAny
            </Link>
            {user && (
              <nav className="flex items-center gap-4">
                <Link
                  to="/"
                  className="text-sm text-gray-600 hover:text-primary-600"
                >
                  首页
                </Link>
                <Link
                  to="/skills"
                  className="text-sm text-gray-600 hover:text-primary-600"
                >
                  Skills
                </Link>
                <Link
                  to="/history"
                  className="text-sm text-gray-600 hover:text-primary-600"
                >
                  历史
                </Link>
              </nav>
            )}
          </div>
          {user && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{user.name}</span>
              <button
                onClick={logout}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                退出
              </button>
            </div>
          )}
        </div>
      </header>
      <main>{children}</main>
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
        </Routes>
      </AppLayout>
    </AuthProvider>
  )
}
