import type { NavigateFunction } from 'react-router-dom'
import { API_BASE } from '../config/api'
import type { SessionDetail } from '../types'

export async function resolveHistoryPathBySessionId(sessionId: string): Promise<string> {
  const normalizedSessionId = sessionId.trim()
  if (!normalizedSessionId) return '/history'

  try {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(normalizedSessionId)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
    if (res.ok) {
      const data = await res.json() as SessionDetail
      const workId = (data.work_id || '').trim()
      if (workId) {
        return `/history/work/${encodeURIComponent(workId)}`
      }
    }
  } catch {
    // ignore and fallback to legacy session path
  }

  return `/history/${encodeURIComponent(normalizedSessionId)}`
}

export async function navigateToHistoryBySessionId(
  navigate: NavigateFunction,
  sessionId: string,
): Promise<void> {
  navigate(await resolveHistoryPathBySessionId(sessionId))
}
