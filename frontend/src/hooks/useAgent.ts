/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Agent 通信 Hook                                   ║
 * ║                                                                          ║
 * ║  职责：SSE 流式通信、消息管理、执行控制、任务文件管理                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useCallback, useRef } from 'react'

const API_BASE = '/api'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface AgentMessage {
  id: string
  type: 'user' | 'assistant' | 'tool' | 'error'
  content: string
  toolName?: string
  timestamp: Date
}

export interface TaskFile {
  name: string
  path: string
  type: 'file' | 'folder'
  ext?: string
  size?: number
  children?: TaskFile[]
  stepIndex?: number    // 工作流步骤索引
  stepName?: string     // 工作流步骤名称
}

interface AgentState {
  messages: AgentMessage[]
  isRunning: boolean
  sessionId: string | null
  error: string | null
  taskFiles: TaskFile[]
  workDir: string | null
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Hook 实现                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function useAgent(skillId: string) {
  const [state, setState] = useState<AgentState>({
    messages: [],
    isRunning: false,
    sessionId: null,
    error: null,
    taskFiles: [],
    workDir: null,
  })

  const abortRef = useRef<AbortController | null>(null)
  const currentTextRef = useRef('')
  const sessionIdRef = useRef<string | null>(null)

  // 执行查询
  const execute = useCallback(
    async (query: string, files?: File[]) => {
      const token = localStorage.getItem('token')
      if (!token) {
        console.error('[useAgent] 未找到认证 token，请重新登录')
        setState((s) => ({ ...s, error: '未登录，请重新登录' }))
        return
      }

      // 添加用户消息
      const userMessage: AgentMessage = {
        id: crypto.randomUUID(),
        type: 'user',
        content: query,
        timestamp: new Date(),
      }

      setState((s) => ({
        ...s,
        messages: [...s.messages, userMessage],
        isRunning: true,
        error: null,
      }))

      // 准备助手消息
      const assistantId = crypto.randomUUID()
      currentTextRef.current = ''

      abortRef.current = new AbortController()

      try {
        console.log('[useAgent] 发送请求到 /api/skill/execute')
        
        let body: BodyInit
        const headers: HeadersInit = {
          Authorization: `Bearer ${token}`,
        }
        
        const currentSessionId = sessionIdRef.current

        if (files && files.length > 0) {
          const formData = new FormData()
          formData.append('skillId', skillId)
          formData.append('query', query)
          if (currentSessionId) formData.append('sessionId', currentSessionId)
          files.forEach(file => formData.append('files', file))
          body = formData
          // Content-Type header is handled by browser for FormData
        } else {
          headers['Content-Type'] = 'application/json'
          body = JSON.stringify({ 
            skill_id: skillId, 
            query, 
            sessionId: currentSessionId 
          })
        }

        const res = await fetch(`${API_BASE}/skill/execute`, {
          method: 'POST',
          headers,
          body,
          signal: abortRef.current.signal,
        })

        console.log('[useAgent] 响应状态:', res.status)

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: '请求失败' }))
          throw new Error(errorData.error || `请求失败: ${res.status}`)
        }

        const reader = res.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) throw new Error('无法读取响应流')

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue

            try {
              const event = JSON.parse(line.slice(6))
              console.log('[useAgent] 收到事件:', event.type)
              handleEvent(event, assistantId)
            } catch (parseErr) {
              console.warn('[useAgent] JSON 解析失败:', line.slice(6, 100))
            }
          }
        }
      } catch (err) {
        console.error('[useAgent] 执行错误:', err)
        if ((err as Error).name !== 'AbortError') {
          setState((s) => ({
            ...s,
            error: (err as Error).message,
          }))
        }
      } finally {
        setState((s) => ({ ...s, isRunning: false }))
        abortRef.current = null
      }
    },
    [skillId],
  )

  // 处理 SSE 事件
  function handleEvent(event: Record<string, unknown>, assistantId: string) {
    switch (event.type) {
      case 'session':
        const sid = event.sessionId as string
        sessionIdRef.current = sid
        setState((s) => ({ ...s, sessionId: sid }))
        break

      case 'text':
        currentTextRef.current += event.content as string
        setState((s) => {
          const existing = s.messages.find((m) => m.id === assistantId)
          if (existing) {
            return {
              ...s,
              messages: s.messages.map((m) =>
                m.id === assistantId
                  ? { ...m, content: currentTextRef.current }
                  : m,
              ),
            }
          }
          return {
            ...s,
            messages: [
              ...s.messages,
              {
                id: assistantId,
                type: 'assistant',
                content: currentTextRef.current,
                timestamp: new Date(),
              },
            ],
          }
        })
        break

      case 'tool_use':
        setState((s) => ({
          ...s,
          messages: [
            ...s.messages,
            {
              id: crypto.randomUUID(),
              type: 'tool',
              content: JSON.stringify(event.toolInput, null, 2),
              toolName: event.toolName as string,
              timestamp: new Date(),
            },
          ],
        }))
        break

      case 'error':
        setState((s) => ({ ...s, error: event.message as string }))
        break
    }
  }

  // 中止执行
  const stop = useCallback(async () => {
    abortRef.current?.abort()

    if (state.sessionId) {
      const token = localStorage.getItem('token')
      await fetch(`${API_BASE}/skill/stop/${state.sessionId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    }

    setState((s) => ({ ...s, isRunning: false }))
  }, [state.sessionId])

  // 清空消息
  const clear = useCallback(() => {
    sessionIdRef.current = null
    setState({
      messages: [],
      isRunning: false,
      sessionId: null,
      error: null,
      taskFiles: [],
      workDir: null,
    })
  }, [])

  // 获取任务产出文件
  const fetchTaskFiles = useCallback(async () => {
    if (!state.sessionId) return

    const token = localStorage.getItem('token')
    try {
      const res = await fetch(`${API_BASE}/task/${state.sessionId}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setState((s) => ({
          ...s,
          taskFiles: data.files || [],
          workDir: data.workDir || null,
        }))
      }
    } catch {
      // 忽略错误
    }
  }, [state.sessionId])

  // 获取文件下载/预览 URL
  const getFileUrl = useCallback(
    (filePath: string) => {
      if (!state.sessionId) return ''
      return `${API_BASE}/task/${state.sessionId}/files/${filePath}`
    },
    [state.sessionId],
  )

  return {
    ...state,
    execute,
    stop,
    clear,
    fetchTaskFiles,
    getFileUrl,
  }
}
