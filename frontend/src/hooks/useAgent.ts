/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Agent 通信 Hook                                   ║
 * ║                                                                          ║
 * ║  职责：SSE 流式通信、消息管理、执行控制、任务文件管理                          ║
 * ║  改进：支持断线重连和后台任务恢复                                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useCallback, useRef } from 'react'
import type { AgentMessage, TaskFile } from '../types'
import { API_BASE, AGENT_API_BASE } from '../config/api'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           重新导出类型                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export type { AgentMessage, TaskFile }

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      AskUserQuestion 相关类型                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface QuestionOption {
  label: string
  description: string
}

export interface AgentQuestion {
  question: string
  header: string
  options: QuestionOption[]
  multiSelect: boolean
}

export interface PendingQuestion {
  id: string
  toolUseId: string
  questions: AgentQuestion[]
}

interface AgentState {
  messages: AgentMessage[]
  isRunning: boolean
  sessionId: string | null
  error: string | null
  taskFiles: TaskFile[]
  workDir: string | null
  pendingQuestion: PendingQuestion | null
  filesVersion: number
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Hook 实现                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/* ════════════════════════════════════════════════════════════════════════════
 *  带重试的 fetch 封装
 *  503 错误时自动重试，使用指数退避策略
 * ════════════════════════════════════════════════════════════════════════════ */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, options)

      /* ────────────────────────────────────────────────────────────────────────
       *  503 表示服务暂时不可用，等待后重试
       *  其他状态码直接返回（包括其他错误码，由调用方处理）
       * ──────────────────────────────────────────────────────────────────────── */
      if (res.status !== 503) {
        return res
      }

      const data = await res.clone().json().catch(() => ({}))
      const retryAfter = (data.retryAfter || Math.pow(2, attempt)) * 1000

      console.log(`[useAgent] 服务暂时不可用，${retryAfter / 1000}s 后重试 (${attempt + 1}/${maxRetries})`)
      await new Promise(r => setTimeout(r, retryAfter))
    } catch (err) {
      lastError = err as Error
      if ((err as Error).name === 'AbortError') throw err

      const delay = Math.pow(2, attempt) * 1000
      console.log(`[useAgent] 请求失败，${delay / 1000}s 后重试 (${attempt + 1}/${maxRetries})`)
      await new Promise(r => setTimeout(r, delay))
    }
  }

  throw lastError || new Error('请求失败，已达最大重试次数')
}

export function useAgent(skillId: string) {
  const [state, setState] = useState<AgentState>({
    messages: [],
    isRunning: false,
    sessionId: null,
    error: null,
    taskFiles: [],
    workDir: null,
    pendingQuestion: null,
    filesVersion: 0,
  })

  const abortRef = useRef<AbortController | null>(null)
  const currentTextRef = useRef('')
  const sessionIdRef = useRef<string | null>(null)

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                     处理 SSE 事件（提取为独立函数）                         │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const handleEvent = useCallback(
    (event: Record<string, unknown>, assistantId: string) => {
      switch (event.type) {
        case 'session':
          const sid = event.sessionId as string
          sessionIdRef.current = sid
          setState((s) => ({ ...s, sessionId: sid }))
          // 保存 sessionId 到 localStorage（支持页面刷新后恢复）
          localStorage.setItem(`lastSession_${skillId}`, sid)
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
          const toolName = event.toolName as string
          const toolInput = event.toolInput as Record<string, unknown>

          // 检测 AskUserQuestion 工具调用
          if (toolName === 'AskUserQuestion' && toolInput.questions) {
            setState((s) => ({
              ...s,
              isRunning: false,
              pendingQuestion: {
                id: `question_${Date.now()}`,
                toolUseId: (event.toolUseId as string) || `tool_${Date.now()}`,
                questions: toolInput.questions as AgentQuestion[],
              },
            }))
            abortRef.current?.abort()
            // 通知后端停止
            if (sessionIdRef.current) {
              const token = localStorage.getItem('token')
              fetch(`${API_BASE}/skill/stop/${sessionIdRef.current}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
              })
            }
            return
          }

          setState((s) => ({
            ...s,
            messages: [
              ...s.messages,
              {
                id: crypto.randomUUID(),
                type: 'tool',
                content: '',
                toolName,
                toolInput,
                timestamp: new Date(),
              },
            ],
          }))
          break

        case 'error':
          setState((s) => ({ ...s, error: (event.message || event.content) as string }))
          // 任务失败，清理 localStorage
          localStorage.removeItem(`lastSession_${skillId}`)
          break

        case 'done':
          // 任务完成，清理 localStorage
          localStorage.removeItem(`lastSession_${skillId}`)
          break
      }
    },
    [skillId],
  )

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

        // 如果有文件，先上传文件获取 file_id 列表
        let fileIds: string[] = []
        if (files && files.length > 0) {
          console.log('[useAgent] 上传文件:', files.map(f => f.name))
          fileIds = await uploadFiles(files, token)
        }

        // 构建查询（如果有文件，在查询中附加文件信息）
        let finalQuery = query
        if (fileIds.length > 0) {
          finalQuery = `${query}\n\n[已上传文件 ID: ${fileIds.join(', ')}]`
        }

        headers['Content-Type'] = 'application/json'
        body = JSON.stringify({
          skill_id: skillId,
          query: finalQuery,
          sessionId: currentSessionId
        })

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
    [skillId, handleEvent],
  )

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
      pendingQuestion: null,
      filesVersion: 0,
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
          filesVersion: s.filesVersion + 1,
        }))
      }
    } catch (err) {
      console.error('[useAgent] 获取任务文件失败:', err)
    }
  }, [state.sessionId])

  // 获取文件下载/预览 URL（使用 filesVersion 破坏缓存）
  const getFileUrl = useCallback(
    (filePath: string) => {
      if (!state.sessionId) return ''
      return `${API_BASE}/task/${state.sessionId}/files/${filePath}?v=${state.filesVersion}`
    },
    [state.sessionId, state.filesVersion],
  )

  // 响应用户问题
  const respondToQuestion = useCallback(
    async (_questionId: string, answers: Record<string, string>) => {
      if (!state.pendingQuestion) return

      const answerText = Object.entries(answers)
        .map(([q, a]) => `${q}: ${a}`)
        .join('\n')

      // 清除待回答问题
      setState((s) => ({ ...s, pendingQuestion: null }))

      // 添加用户回答到消息
      const userMessage: AgentMessage = {
        id: crypto.randomUUID(),
        type: 'user',
        content: answerText,
        timestamp: new Date(),
      }
      setState((s) => ({ ...s, messages: [...s.messages, userMessage] }))

      // 继续对话
      await execute(answerText)
    },
    [state.pendingQuestion, execute],
  )

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                     检查是否有正在执行的任务                               │
   * │                                                                          │
   * │  用于页面加载时检测后台任务，支持断线重连                                   │
   * │  增强：503 时自动重试                                                      │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const checkRunningTask = useCallback(async (): Promise<string | null> => {
    const lastSessionId = localStorage.getItem(`lastSession_${skillId}`)
    if (!lastSessionId) return null

    try {
      const res = await fetchWithRetry(
        `${AGENT_API_BASE}/execute/status/${lastSessionId}`,
        {},
        2
      )
      if (!res.ok) {
        localStorage.removeItem(`lastSession_${skillId}`)
        return null
      }

      const status = await res.json()
      if (status.status === 'running') {
        return lastSessionId
      }

      localStorage.removeItem(`lastSession_${skillId}`)
      return null
    } catch {
      return null
    }
  }, [skillId])

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                     重新连接到正在执行的任务                               │
   * │                                                                          │
   * │  通过 SSE 重新订阅任务事件，会先重放历史事件                                │
   * │  增强：503 时自动重试                                                      │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const attachToSession = useCallback(
    async (targetSessionId: string) => {
      const token = localStorage.getItem('token')
      if (!token) {
        setState((s) => ({ ...s, error: '未登录，请重新登录' }))
        return
      }

      setState((s) => ({
        ...s,
        isRunning: true,
        sessionId: targetSessionId,
        error: null,
      }))

      sessionIdRef.current = targetSessionId
      abortRef.current = new AbortController()

      const assistantId = crypto.randomUUID()
      currentTextRef.current = ''

      try {
        const res = await fetchWithRetry(
          `${AGENT_API_BASE}/execute/attach/${targetSessionId}`,
          { signal: abortRef.current.signal },
          3
        )

        if (!res.ok) {
          throw new Error('无法连接到任务')
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
              handleEvent(event, assistantId)
            } catch {
              // 忽略解析错误
            }
          }
        }
      } catch (err) {
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
    [handleEvent],
  )

  return {
    ...state,
    execute,
    stop,
    clear,
    fetchTaskFiles,
    getFileUrl,
    respondToQuestion,
    checkRunningTask,
    attachToSession,
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           文件上传辅助函数                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function uploadFiles(files: File[], token: string): Promise<string[]> {
  const fileIds: string[] = []

  for (const file of files) {
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch(`${API_BASE}/files/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })

    if (res.ok) {
      const data = await res.json()
      fileIds.push(data.id)
    } else {
      console.error('[useAgent] 文件上传失败:', file.name)
    }
  }

  return fileIds
}
