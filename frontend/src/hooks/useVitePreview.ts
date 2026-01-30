/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       useVitePreview Hook                                 ║
 * ║                                                                          ║
 * ║  管理 Vite 预览服务器的生命周期，提供启动/停止控制和状态监控                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useCallback, useEffect, useRef, useState } from 'react'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export type PreviewStatus = 'idle' | 'starting' | 'running' | 'error' | 'stopped'

export interface UseVitePreviewReturn {
  status: PreviewStatus
  previewUrl: string | null
  error: string | null
  startPreview: (workDir: string) => Promise<void>
  stopPreview: () => Promise<void>
  refreshStatus: () => Promise<void>
}

interface ApiResponse {
  id: string
  taskId: string
  status: 'starting' | 'running' | 'stopped' | 'error'
  url?: string
  port?: number
  error?: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           配置常量                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const API_BASE = '/api/preview'
const POLL_INTERVAL = 2000
const MAX_POLL_COUNT = 90  // 最大轮询次数 (90 * 2s = 3 分钟)

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Hook 实现                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function useVitePreview(taskId: string | null): UseVitePreviewReturn {
  const [status, setStatus] = useState<PreviewStatus>('idle')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)
  const taskIdRef = useRef(taskId)

  // 同步 taskId
  useEffect(() => {
    taskIdRef.current = taskId
  }, [taskId])

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [])

  /* ────────────────────────────────────────────────────────────────────────
   * 更新状态
   * ──────────────────────────────────────────────────────────────────────── */
  const updateFromResponse = useCallback((data: ApiResponse) => {
    setStatus(data.status === 'stopped' ? 'idle' : data.status)
    setPreviewUrl(data.url || null)
    setError(data.error || null)

    // 非 starting 状态停止轮询
    if (data.status !== 'starting' && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  /* ────────────────────────────────────────────────────────────────────────
   * 刷新状态
   * ──────────────────────────────────────────────────────────────────────── */
  const refreshStatus = useCallback(async () => {
    if (!taskIdRef.current) return

    try {
      const res = await fetch(`${API_BASE}/status/${taskIdRef.current}`)
      if (res.ok) {
        const data: ApiResponse = await res.json()
        updateFromResponse(data)
      }
    } catch (err) {
      console.error('[useVitePreview] 获取状态失败:', err)
    }
  }, [updateFromResponse])

  // taskId 变化时重置状态
  useEffect(() => {
    if (taskId) {
      refreshStatus()
    } else {
      setStatus('idle')
      setPreviewUrl(null)
      setError(null)
    }
  }, [taskId, refreshStatus])

  /* ────────────────────────────────────────────────────────────────────────
   * 启动预览
   * ──────────────────────────────────────────────────────────────────────── */
  const startPreview = useCallback(async (workDir: string) => {
    if (!taskIdRef.current) {
      setError('缺少 taskId')
      setStatus('error')
      return
    }

    // 清理现有轮询
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }

    setStatus('starting')
    setError(null)

    try {
      console.log('[useVitePreview] 启动预览:', taskIdRef.current)

      const res = await fetch(`${API_BASE}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: taskIdRef.current, workDir }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const data: ApiResponse = await res.json()
      updateFromResponse(data)

      // starting 状态开始轮询
      if (data.status === 'starting') {
        pollCountRef.current = 0
        pollRef.current = setInterval(async () => {
          if (!taskIdRef.current) return

          // 检查最大轮询次数
          pollCountRef.current++
          if (pollCountRef.current > MAX_POLL_COUNT) {
            clearInterval(pollRef.current!)
            pollRef.current = null
            setStatus('error')
            setError('启动超时，请重试')
            return
          }

          try {
            const statusRes = await fetch(`${API_BASE}/status/${taskIdRef.current}`)
            if (statusRes.ok) {
              const statusData: ApiResponse = await statusRes.json()
              updateFromResponse(statusData)
            }
          } catch (err) {
            console.error('[useVitePreview] 轮询错误:', err)
          }
        }, POLL_INTERVAL)
      }
    } catch (err) {
      console.error('[useVitePreview] 启动失败:', err)
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [updateFromResponse])

  /* ────────────────────────────────────────────────────────────────────────
   * 停止预览
   * ──────────────────────────────────────────────────────────────────────── */
  const stopPreview = useCallback(async () => {
    if (!taskIdRef.current) return

    // 清理轮询
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }

    try {
      console.log('[useVitePreview] 停止预览:', taskIdRef.current)

      const res = await fetch(`${API_BASE}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: taskIdRef.current }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      setStatus('idle')
      setPreviewUrl(null)
      setError(null)
    } catch (err) {
      console.error('[useVitePreview] 停止失败:', err)
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  return {
    status,
    previewUrl,
    error,
    startPreview,
    stopPreview,
    refreshStatus,
  }
}
