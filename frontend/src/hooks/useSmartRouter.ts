/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     智能路由 Hook - useSmartRouter                      ║
 * ║                                                                          ║
 * ║  职责：封装前端与路由 API 的交互                                          ║
 * ║  接口：route(query) 全匹配 / suggest(query) 快速建议                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useCallback } from 'react'
import { AGENT_API_BASE } from '../config/api'
import type { MatchResult } from '../components/home/chat/ChatState'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           空匹配常量                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const NO_MATCH: MatchResult = { type: 'none', id: '', name: '', confidence: 0, reason: '' }

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           智能路由 Hook                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function useSmartRouter() {
  const [isRouting, setIsRouting] = useState(false)

  const route = useCallback(async (query: string): Promise<MatchResult> => {
    if (!query.trim()) return NO_MATCH
    setIsRouting(true)
    try {
      const res = await fetch(`${AGENT_API_BASE}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      if (!res.ok) return NO_MATCH
      return await res.json()
    } catch {
      return NO_MATCH
    } finally {
      setIsRouting(false)
    }
  }, [])

  const suggest = useCallback(async (query: string): Promise<MatchResult[]> => {
    if (!query.trim()) return []
    try {
      const res = await fetch(`${AGENT_API_BASE}/route/suggest?q=${encodeURIComponent(query)}`)
      if (!res.ok) return []
      return await res.json()
    } catch {
      return []
    }
  }, [])

  return { route, suggest, isRouting }
}
