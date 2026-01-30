/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         认证 Hook                                         ║
 * ║                                                                          ║
 * ║  职责：管理用户认证状态、登录、注册、登出                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { API_BASE, parseErrorMessage } from '../config'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface User {
  id: string
  email: string
  name: string
  balance: number
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           认证 Provider                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // 初始化：检查本地存储的 token
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      fetchUser(token)
    } else {
      setLoading(false)
    }
  }, [])

  // 获取用户信息
  async function fetchUser(token: string) {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setUser(data)
      } else {
        localStorage.removeItem('token')
      }
    } catch {
      localStorage.removeItem('token')
    } finally {
      setLoading(false)
    }
  }

  // 登录
  async function login(email: string, password: string) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      const error = await res.json()
      throw new Error(parseErrorMessage(error, '登录失败'))
    }

    const { access_token } = await res.json()
    localStorage.setItem('token', access_token)
    await fetchUser(access_token)
  }

  // 注册
  async function register(email: string, password: string, name: string) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    })

    if (!res.ok) {
      const error = await res.json()
      throw new Error(parseErrorMessage(error, '注册失败'))
    }

    const { access_token } = await res.json()
    localStorage.setItem('token', access_token)
    await fetchUser(access_token)
  }

  // 登出
  function logout() {
    localStorage.removeItem('token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Hook 导出                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
