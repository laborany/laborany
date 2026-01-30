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

/* ── 调试用：生成唯一调用 ID ── */
let callCounter = 0
const genCallId = () => `call-${++callCounter}-${Date.now()}`

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
  const isStartingRef = useRef(false)  // 同步标记，防止重复启动

  console.log('[useVitePreview] Hook 初始化/更新, taskId:', taskId, 'status:', status)

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
    console.log('[useVitePreview] API 响应:', JSON.stringify(data))
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
    const callId = genCallId()
    console.log(`[useVitePreview][${callId}] ========== startPreview 被调用 ==========`)
    console.log(`[useVitePreview][${callId}] workDir: ${workDir}`)
    console.log(`[useVitePreview][${callId}] taskIdRef.current: ${taskIdRef.current}`)
    console.log(`[useVitePreview][${callId}] isStartingRef.current: ${isStartingRef.current}`)
    console.log(`[useVitePreview][${callId}] status (from useState): ${status}`)

    /* ── 防止重复启动（使用 ref 同步检查） ── */
    if (isStartingRef.current) {
      console.log(`[useVitePreview][${callId}] ❌ 跳过: isStartingRef.current = true`)
      return
    }
    if (status === 'starting') {
      console.log(`[useVitePreview][${callId}] ❌ 跳过: status = 'starting'`)
      return
    }
    if (status === 'running') {
      console.log(`[useVitePreview][${callId}] ❌ 跳过: status = 'running'`)
      return
    }

    if (!taskIdRef.current) {
      console.log(`[useVitePreview][${callId}] ❌ 错误: 缺少 taskId`)
      setError('缺少 taskId')
      setStatus('error')
      return
    }

    // 立即设置标记，防止并发调用
    isStartingRef.current = true
    console.log(`[useVitePreview][${callId}] ✓ 设置 isStartingRef = true，准备发起请求`)

    // 清理现有轮询
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }

    setStatus('starting')
    setError(null)
    console.log(`[useVitePreview][${callId}] 状态设置为 starting`)

    try {
      const url = `${API_BASE}/start`
      const body = { taskId: taskIdRef.current, workDir }
      console.log(`[useVitePreview][${callId}] 发送 POST ${url}`)
      console.log(`[useVitePreview][${callId}] 请求体:`, JSON.stringify(body))

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      console.log(`[useVitePreview][${callId}] 响应状态: ${res.status} ${res.statusText}`)

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.log(`[useVitePreview][${callId}] ❌ 响应错误:`, err)
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const data: ApiResponse = await res.json()
      console.log(`[useVitePreview][${callId}] ✓ 响应数据:`, JSON.stringify(data))
      updateFromResponse(data)

      // 非 starting 状态，重置标记
      if (data.status !== 'starting') {
        isStartingRef.current = false
      }

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
            isStartingRef.current = false
            return
          }

          try {
            const statusRes = await fetch(`${API_BASE}/status/${taskIdRef.current}`)
            if (statusRes.ok) {
              const statusData: ApiResponse = await statusRes.json()
              updateFromResponse(statusData)
              // 非 starting 状态，重置标记
              if (statusData.status !== 'starting') {
                isStartingRef.current = false
              }
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
      isStartingRef.current = false
    }
  }, [updateFromResponse, status])

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
