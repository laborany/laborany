import { useCallback, useEffect, useRef, useState } from 'react'

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

const API_BASE = '/api/preview'
const POLL_INTERVAL = 2000
const MAX_POLL_COUNT = 90

export function useVitePreview(taskId: string | null): UseVitePreviewReturn {
  const [status, setStatus] = useState<PreviewStatus>('idle')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)
  const taskIdRef = useRef(taskId)
  const isStartingRef = useRef(false)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const updateFromResponse = useCallback((data: ApiResponse) => {
    const nextStatus: PreviewStatus = data.status === 'stopped' ? 'idle' : data.status
    setStatus(nextStatus)
    setPreviewUrl(data.url || null)
    setError(data.error || null)

    if (data.status !== 'starting') {
      isStartingRef.current = false
      stopPolling()
    }
  }, [stopPolling])

  const refreshStatus = useCallback(async () => {
    if (!taskIdRef.current) return

    try {
      const res = await fetch(`${API_BASE}/status/${taskIdRef.current}`)
      if (!res.ok) return
      const data: ApiResponse = await res.json()
      updateFromResponse(data)
    } catch {
      // 静默失败，避免刷屏
    }
  }, [updateFromResponse])

  useEffect(() => {
    taskIdRef.current = taskId
  }, [taskId])

  useEffect(() => {
    return () => {
      stopPolling()
    }
  }, [stopPolling])

  useEffect(() => {
    stopPolling()
    isStartingRef.current = false

    if (!taskId) {
      setStatus('idle')
      setPreviewUrl(null)
      setError(null)
      return
    }

    refreshStatus()
  }, [taskId, refreshStatus, stopPolling])

  const startPreview = useCallback(async (workDir: string) => {
    if (!taskIdRef.current) {
      setStatus('error')
      setError('缺少 taskId')
      return
    }

    if (isStartingRef.current || status === 'starting' || status === 'running') {
      return
    }

    isStartingRef.current = true
    stopPolling()
    setStatus('starting')
    setError(null)

    try {
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

      if (data.status === 'starting') {
        pollCountRef.current = 0
        pollRef.current = setInterval(async () => {
          if (!taskIdRef.current) {
            stopPolling()
            return
          }

          pollCountRef.current++
          if (pollCountRef.current > MAX_POLL_COUNT) {
            stopPolling()
            isStartingRef.current = false
            setStatus('error')
            setError('启动超时，请重试')
            return
          }

          try {
            const statusRes = await fetch(`${API_BASE}/status/${taskIdRef.current}`)
            if (!statusRes.ok) return
            const statusData: ApiResponse = await statusRes.json()
            updateFromResponse(statusData)
          } catch {
            // 静默失败，继续轮询
          }
        }, POLL_INTERVAL)
      }
    } catch (err) {
      stopPolling()
      isStartingRef.current = false
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [status, stopPolling, updateFromResponse])

  const stopPreview = useCallback(async () => {
    if (!taskIdRef.current) return

    stopPolling()
    isStartingRef.current = false

    try {
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
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [stopPolling])

  return {
    status,
    previewUrl,
    error,
    startPreview,
    stopPreview,
    refreshStatus,
  }
}

