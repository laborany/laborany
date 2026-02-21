
import { useState, useCallback, useRef, useEffect } from 'react'
import type { AgentMessage, TaskFile } from '../types'
import { API_BASE } from '../config/api'

export type { AgentMessage, TaskFile }

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
  runCompletedAt: string | null
  sessionId: string | null
  error: string | null
  taskFiles: TaskFile[]
  workDir: string | null
  pendingQuestion: PendingQuestion | null
  createdCapability: {
    type: 'skill'
    id: string
    primary: { type: 'skill'; id: string }
    artifacts: Array<{ type: 'skill'; id: string }>
    originQuery?: string
  } | null
  filesVersion: number
  compositeSteps: Array<{
    name: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    output?: string
    startedAt?: string
    completedAt?: string
  }>
  currentCompositeStep: number
}

const EXECUTE_DEDUPE_WINDOW_MS = 1200


async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, options)

      if (res.status !== 503) {
        return res
      }

      const data = await res.clone().json().catch(() => ({}))
      const retryAfter = (data.retryAfter || Math.pow(2, attempt)) * 1000

      console.log(`[useAgent] 服务暂不可用，${retryAfter / 1000}s 后重试 (${attempt + 1}/${maxRetries})`)
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

function isAbortLikeError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err.name === 'AbortError') return true
  const text = `${err.message || ''}`.toLowerCase()
  return text.includes('aborted') || text.includes('bodystreambuffer')
}

function normalizeAgentQuestions(payload: Record<string, unknown>): AgentQuestion[] {
  const rawQuestions = Array.isArray(payload.questions)
    ? payload.questions
    : (() => {
      const singleQuestion = typeof payload.question === 'string' ? payload.question.trim() : ''
      if (!singleQuestion) return []
      return [{
        question: singleQuestion,
        header: typeof payload.header === 'string' && payload.header.trim()
          ? payload.header.trim()
          : '问题',
        options: Array.isArray(payload.options) ? payload.options : [],
        multiSelect: Boolean(payload.multiSelect),
      }]
    })()

  const normalizedQuestions = rawQuestions
    .map((q) => {
      if (!q || typeof q !== 'object') return null
      const item = q as Record<string, unknown>
      const question = typeof item.question === 'string' ? item.question.trim() : ''
      if (!question) return null
      const header = typeof item.header === 'string' && item.header.trim()
        ? item.header.trim()
        : '问题'
      const options = Array.isArray(item.options)
        ? item.options
          .map((opt) => {
            if (typeof opt === 'string') {
              const label = opt.trim()
              if (!label) return null
              return { label, description: '' }
            }
            if (!opt || typeof opt !== 'object') return null
            const option = opt as Record<string, unknown>
            const label = typeof option.label === 'string' ? option.label.trim() : ''
            if (!label) return null
            return {
              label,
              description: typeof option.description === 'string' ? option.description : '',
            }
          })
          .filter(Boolean) as QuestionOption[]
        : []
      return {
        question,
        header,
        options,
        multiSelect: Boolean(item.multiSelect),
      }
    })
    .filter(Boolean) as AgentQuestion[]

  if (!normalizedQuestions.length) {
    normalizedQuestions.push({
      question: '请补充当前任务缺失信息，以便继续执行。',
      header: '信息补充',
      options: [],
      multiSelect: false,
    })
  }

  return normalizedQuestions
}

export function useAgent(skillId: string) {
  const [state, setState] = useState<AgentState>({
    messages: [],
    isRunning: false,
    runCompletedAt: null,
    sessionId: null,
    error: null,
    taskFiles: [],
    workDir: null,
    pendingQuestion: null,
    createdCapability: null,
    filesVersion: 0,
    compositeSteps: [],
    currentCompositeStep: -1,
  })

  const abortRef = useRef<AbortController | null>(null)
  const abortByQuestionRef = useRef(false)
  const requestSeqRef = useRef(0)
  const executeInFlightRef = useRef(false)
  const lastExecuteFingerprintRef = useRef<{ fingerprint: string; at: number }>({
    fingerprint: '',
    at: 0,
  })
  const currentTextRef = useRef('')
  const sessionIdRef = useRef<string | null>(null)
  const assistantIdRef = useRef<string>(crypto.randomUUID())
  const terminalEventRef = useRef(false)
  const prevSkillIdRef = useRef(skillId)

  useEffect(() => {
    if (prevSkillIdRef.current === skillId) {
      return
    }

    abortRef.current?.abort()
    abortRef.current = null
    abortByQuestionRef.current = false
    requestSeqRef.current = 0
    executeInFlightRef.current = false
    lastExecuteFingerprintRef.current = { fingerprint: '', at: 0 }
    sessionIdRef.current = null
    assistantIdRef.current = crypto.randomUUID()
    currentTextRef.current = ''
    terminalEventRef.current = false

    setState({
      messages: [],
      isRunning: false,
      runCompletedAt: null,
      sessionId: null,
      error: null,
      taskFiles: [],
      workDir: null,
      pendingQuestion: null,
      createdCapability: null,
      filesVersion: 0,
      compositeSteps: [],
      currentCompositeStep: -1,
    })

    prevSkillIdRef.current = skillId
  }, [skillId])

  const handleEvent = useCallback(
    (event: Record<string, unknown>) => {
      switch (event.type) {
        case 'session':
          const sid = event.sessionId as string
          sessionIdRef.current = sid
          setState((s) => ({ ...s, sessionId: sid }))
          localStorage.setItem(`lastSession_${skillId}`, sid)
          break

        case 'text': {
          // 使用 assistantIdRef 跟踪当前文本块归属的 assistant 消息
          const aid = assistantIdRef.current
          currentTextRef.current += event.content as string
          setState((s) => {
            const existing = s.messages.find((m) => m.id === aid)
            if (existing) {
              return {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === aid
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
                  id: aid,
                  type: 'assistant',
                  content: currentTextRef.current,
                  timestamp: new Date(),
                },
              ],
            }
          })
          break
        }

        case 'tool_use': {
          const toolName = event.toolName as string
          const toolInput = event.toolInput as Record<string, unknown>

          const isAskUserQuestion = /^AskU(?:ser|er)Question$/i.test(toolName || '')
          if (isAskUserQuestion) {
            const normalizedQuestions = normalizeAgentQuestions(toolInput)

            setState((s) => ({
              ...s,
              isRunning: false,
              pendingQuestion: {
                id: `question_${Date.now()}`,
                toolUseId: (event.toolUseId as string) || `tool_${Date.now()}`,
                questions: normalizedQuestions,
              },
            }))
            abortByQuestionRef.current = true
            executeInFlightRef.current = false
            abortRef.current?.abort()
            // 通知后端停止
            if (sessionIdRef.current) {
              const token = localStorage.getItem('token')
              fetch(`${API_BASE}/skill/stop/${sessionIdRef.current}`, {
                method: 'POST',
                headers: createAuthHeaders(token),
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

          // tool_use 后重置文本累计状态
          currentTextRef.current = ''
          assistantIdRef.current = crypto.randomUUID()
          break
        }

        case 'question': {
          const payload = event as Record<string, unknown>
          const normalizedQuestions = normalizeAgentQuestions(payload)
          setState((s) => ({
            ...s,
            isRunning: false,
            pendingQuestion: {
              id: (payload.id as string) || `question_${Date.now()}`,
              toolUseId: (payload.toolUseId as string) || `tool_${Date.now()}`,
              questions: normalizedQuestions,
            },
          }))
          abortByQuestionRef.current = true
          executeInFlightRef.current = false
          abortRef.current?.abort()
          if (sessionIdRef.current) {
            const token = localStorage.getItem('token')
            fetch(`${API_BASE}/skill/stop/${sessionIdRef.current}`, {
              method: 'POST',
              headers: createAuthHeaders(token),
            })
          }
          break
        }

        case 'warning': {
          const warningText = (event.content || event.message) as string | undefined
          if (!warningText) break
          setState((s) => ({
            ...s,
            messages: [
              ...s.messages,
              {
                id: crypto.randomUUID(),
                type: 'assistant',
                content: `⚠️ 提醒：${warningText}`,
                timestamp: new Date(),
              },
            ],
          }))
          break
        }

        case 'error':
          setState((s) => ({ ...s, error: (event.message || event.content) as string }))
          localStorage.removeItem(`lastSession_${skillId}`)
          break

        case 'pipeline_start': {
          const steps = Array.isArray(event.steps)
            ? event.steps.map((item) => {
              const step = item as Record<string, unknown>
              return {
                name: (step.name as string) || '步骤',
                status: 'pending' as const,
              }
            })
            : []
          setState((s) => ({
            ...s,
            compositeSteps: steps,
            currentCompositeStep: steps.length > 0 ? 0 : -1,
          }))
          break
        }

        case 'step_start': {
          const stepIndex = Number(event.stepIndex)
          if (Number.isNaN(stepIndex) || stepIndex < 0) break
          setState((s) => ({
            ...s,
            currentCompositeStep: stepIndex,
            compositeSteps: s.compositeSteps.map((step, idx) => {
              if (idx === stepIndex) return { ...step, status: 'running', startedAt: new Date().toISOString() }
              if (idx < stepIndex && step.status === 'pending') return { ...step, status: 'completed' }
              return step
            }),
          }))
          break
        }

        case 'step_done': {
          const stepIndex = Number(event.stepIndex)
          const result = event.result as Record<string, unknown> | undefined
          if (Number.isNaN(stepIndex) || stepIndex < 0 || !result) break
          setState((s) => ({
            ...s,
            compositeSteps: s.compositeSteps.map((step, idx) => {
              if (idx !== stepIndex) return step
              return {
                ...step,
                status: 'completed',
                output: (result.output as string) || step.output,
                startedAt: (result.startedAt as string) || step.startedAt,
                completedAt: (result.completedAt as string) || new Date().toISOString(),
              }
            }),
          }))
          break
        }

        case 'step_error': {
          const stepIndex = Number(event.stepIndex)
          const error = (event.error as string) || '步骤失败'
          if (Number.isNaN(stepIndex) || stepIndex < 0) break
          setState((s) => ({
            ...s,
            compositeSteps: s.compositeSteps.map((step, idx) => {
              if (idx !== stepIndex) return step
              return {
                ...step,
                status: 'failed',
                output: error,
                completedAt: new Date().toISOString(),
              }
            }),
          }))
          break
        }

        case 'pipeline_done':
          setState((s) => ({ ...s, currentCompositeStep: -1 }))
          break

        case 'created_capability': {
          const capabilityType: 'skill' = 'skill'
          const capabilityId = event.capabilityId as string
          if (capabilityId) {
            const primaryRaw = event.primary as { type?: 'skill'; id?: string } | undefined
            const primary: { type: 'skill'; id: string } = {
              type: capabilityType,
              id: primaryRaw?.id || capabilityId,
            }

            const artifactsRaw = Array.isArray(event.artifacts)
              ? event.artifacts as Array<{ type?: 'skill'; id?: string }>
              : []

            const artifacts: Array<{ type: 'skill'; id: string }> = artifactsRaw
              .map((item) => {
                return {
                  type: 'skill' as const,
                  id: item.id || '',
                }
              })
              .filter((item) => item.id)

            const normalizedArtifacts: Array<{ type: 'skill'; id: string }> =
              artifacts.length > 0 ? artifacts : [primary]
            const originQuery = typeof event.originQuery === 'string' ? event.originQuery : undefined

            setState((s) => ({
              ...s,
              createdCapability: {
                type: primary.type,
                id: primary.id,
                primary,
                artifacts: normalizedArtifacts,
                originQuery,
              },
            }))

            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('capability:changed', {
                detail: {
                  primary,
                  artifacts: normalizedArtifacts,
                  originQuery,
                },
              }))
            }
          }
          break
        }

        case 'stopped':
        case 'done':
        case 'aborted':
          terminalEventRef.current = true
          localStorage.removeItem(`lastSession_${skillId}`)
          setState((s) => ({
            ...s,
            runCompletedAt: new Date().toISOString(),
          }))
          break
      }
    },
    [skillId],
  )

  const readSseStream = useCallback(
    async (res: Response) => {
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error('无法读取响应流')

      let buffer = ''
      let eventType = ''
      let shouldTerminate = false
      const parseEventBlock = (rawBlock: string): void => {
        const lines = rawBlock.split(/\r?\n/)
        let dataLine = ''
        for (const rawLine of lines) {
          const line = rawLine.trimEnd()
          if (!line) continue
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim()
            continue
          }
          if (line.startsWith('data:')) {
            dataLine += line.slice(5).trimStart()
          }
        }

        if (!dataLine) return
        try {
          const event = JSON.parse(dataLine) as Record<string, unknown>
          if (eventType && typeof event === 'object' && event && !('type' in event)) {
            ;(event as Record<string, unknown>).type = eventType
          }
          handleEvent(event)
          const type = typeof event.type === 'string' ? event.type : eventType
          if (type === 'done' || type === 'stopped' || type === 'aborted') {
            shouldTerminate = true
          }
        } catch {
          // 忽略单条 SSE 事件解析失败
        } finally {
          eventType = ''
        }
      }

      while (true) {
        let readResult: ReadableStreamReadResult<Uint8Array>
        try {
          readResult = await reader.read()
        } catch (err) {
          if (shouldTerminate || isAbortLikeError(err)) {
            break
          }
          throw err
        }

        const { done, value } = readResult
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split(/\r?\n\r?\n/)
        buffer = blocks.pop() || ''

        for (const block of blocks) {
          parseEventBlock(block)
          if (shouldTerminate) {
            void reader.cancel()
            return
          }
        }
      }

      const tail = buffer.trim()
      if (tail) {
        parseEventBlock(tail)
      }

      if (shouldTerminate) {
        void reader.cancel()
      }
    },
    [handleEvent],
  )

  const execute = useCallback(
    async (query: string, files?: File[], options?: { originQuery?: string }) => {
      if (executeInFlightRef.current) {
        console.warn('[useAgent] 忽略重复执行：已有请求在进行中')
        return
      }

      const fingerprint = JSON.stringify({
        query: query.trim(),
        sessionId: sessionIdRef.current || '',
        files: (files || []).map((file) => `${file.name}:${file.size}:${file.lastModified}`).join('|'),
        originQuery: options?.originQuery || '',
      })
      const now = Date.now()
      const lastExecute = lastExecuteFingerprintRef.current
      if (
        lastExecute.fingerprint === fingerprint
        && now - lastExecute.at < EXECUTE_DEDUPE_WINDOW_MS
      ) {
        console.warn('[useAgent] 忽略短时间内重复执行请求')
        return
      }

      lastExecuteFingerprintRef.current = { fingerprint, at: now }
      executeInFlightRef.current = true

      const requestSeq = ++requestSeqRef.current
      const token = localStorage.getItem('token')

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
        runCompletedAt: null,
        error: null,
        createdCapability: null,
        pendingQuestion: null,
      }))

      terminalEventRef.current = false

      // 中止上一轮未完成请求（防止快速连点导致竞态）
      abortRef.current?.abort()

      // 准备助手消息
      assistantIdRef.current = crypto.randomUUID()
      currentTextRef.current = ''

      abortRef.current = new AbortController()

      try {
        console.log('[useAgent] 发送请求到 /api/skill/execute')

        let body: BodyInit
        const headers: Record<string, string> = {}
        const authHeaders = createAuthHeaders(token)
        if (authHeaders?.Authorization) {
          headers.Authorization = authHeaders.Authorization
        }

        const currentSessionId = sessionIdRef.current

        let fileIds: string[] = []
        if (files && files.length > 0) {
          console.log('[useAgent] 上传文件:', files.map(f => f.name))
          fileIds = await uploadFiles(files, token || undefined)
        }

        let finalQuery = query
        if (fileIds.length > 0) {
          finalQuery = `${query}\n\n[LABORANY_FILE_IDS: ${fileIds.join(', ')}]`
        }

        headers['Content-Type'] = 'application/json'
        body = JSON.stringify({
          skill_id: skillId,
          query: finalQuery,
          originQuery: options?.originQuery,
          sessionId: currentSessionId
        })

        const res = await fetchWithRetry(
          `${API_BASE}/skill/execute`,
          {
            method: 'POST',
            headers,
            body,
            signal: abortRef.current.signal,
          },
          3
        )

        console.log('[useAgent] 响应状态:', res.status)

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: '请求失败' }))
          throw new Error(errorData.error || `请求失败: ${res.status}`)
        }

        await readSseStream(res)
      } catch (err) {
        if (isAbortLikeError(err) && abortByQuestionRef.current) {
          abortByQuestionRef.current = false
        } else if (!isAbortLikeError(err)) {
          console.error('[useAgent] 执行错误:', err)
        }
        if (!isAbortLikeError(err)) {
          setState((s) => (requestSeq === requestSeqRef.current
            ? {
              ...s,
              error: (err as Error).message,
            }
            : s))
        }
      } finally {
        if (requestSeq === requestSeqRef.current) {
          abortByQuestionRef.current = false
          executeInFlightRef.current = false
          setState((s) => ({
            ...s,
            isRunning: false,
            runCompletedAt: s.runCompletedAt || (terminalEventRef.current ? new Date().toISOString() : s.runCompletedAt),
          }))
          abortRef.current = null
        }
      }
    },
    [skillId, handleEvent, readSseStream],
  )

  const stop = useCallback(async () => {
    abortRef.current?.abort()

    const sid = sessionIdRef.current
    if (sid) {
      const token = localStorage.getItem('token')
      await fetch(`${API_BASE}/skill/stop/${sid}`, {
        method: 'POST',
        headers: createAuthHeaders(token),
      })
      // 清理 localStorage
      localStorage.removeItem(`lastSession_${skillId}`)
    }

    setState((s) => ({ ...s, isRunning: false }))
  }, [skillId])

  // 清空消息
  const clear = useCallback(() => {
    sessionIdRef.current = null
    assistantIdRef.current = crypto.randomUUID()
    currentTextRef.current = ''
    setState({
      messages: [],
      isRunning: false,
      runCompletedAt: null,
      sessionId: null,
      error: null,
      taskFiles: [],
      workDir: null,
      pendingQuestion: null,
      createdCapability: null,
      filesVersion: 0,
      compositeSteps: [],
      currentCompositeStep: -1,
    })
  }, [])

  const resumeSession = useCallback((targetSessionId: string) => {
    sessionIdRef.current = targetSessionId
    setState(s => ({ ...s, sessionId: targetSessionId }))
    localStorage.setItem(`lastSession_${skillId}`, targetSessionId)
  }, [skillId])

  const fetchTaskFiles = useCallback(async () => {
    if (!state.sessionId) return

    const token = localStorage.getItem('token')
    try {
      const res = await fetch(`${API_BASE}/task/${state.sessionId}/files`, {
        headers: createAuthHeaders(token),
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

      const answerText = Object.values(answers)
        .map((answer) => answer.trim())
        .filter(Boolean)
        .join('\n')

      if (!answerText) return

      // 清除待回答问题
      setState((s) => ({ ...s, pendingQuestion: null }))

      // 由 execute 统一追加用户消息，避免重复显示
      await execute(answerText)
    },
    [state.pendingQuestion, execute],
  )

  const checkRunningTask = useCallback(async (): Promise<string | null> => {
    const lastSessionId = localStorage.getItem(`lastSession_${skillId}`)
    if (!lastSessionId) return null

    try {
      const res = await fetch(`${API_BASE}/skill/runtime/running`)
      if (!res.ok) {
        localStorage.removeItem(`lastSession_${skillId}`)
        return null
      }

      const runningData = await res.json().catch(() => null)
      const tasks = Array.isArray(runningData?.tasks) ? runningData.tasks : []
      const matched = tasks.find((task: unknown) => {
        if (!task || typeof task !== 'object') return false
        const item = task as Record<string, unknown>
        return item.sessionId === lastSessionId && item.skillId === skillId
      })

      if (matched) {
        return lastSessionId
      }

      if (!runningData) {
        localStorage.removeItem(`lastSession_${skillId}`)
        return null
      }

      localStorage.removeItem(`lastSession_${skillId}`)
      return null
    } catch {
      return null
    }
  }, [skillId])

  const attachToSession = useCallback(
    async (targetSessionId: string) => {
      const token = localStorage.getItem('token')

      setState((s) => ({
        ...s,
        isRunning: true,
        runCompletedAt: null,
        sessionId: targetSessionId,
        error: null,
      }))

      sessionIdRef.current = targetSessionId
      terminalEventRef.current = false
      abortRef.current = new AbortController()

      assistantIdRef.current = crypto.randomUUID()
      currentTextRef.current = ''

      try {
        const res = await fetchWithRetry(
          `${API_BASE}/skill/runtime/attach/${targetSessionId}`,
          {
            signal: abortRef.current.signal,
            headers: createAuthHeaders(token),
          },
          3
        )

        if (!res.ok) {
          throw new Error('无法连接到任务')
        }

        await readSseStream(res)
      } catch (err) {
        if (!isAbortLikeError(err)) {
          setState((s) => ({
            ...s,
            error: (err as Error).message,
          }))
        }
      } finally {
        setState((s) => ({
          ...s,
          isRunning: false,
          runCompletedAt: s.runCompletedAt || (terminalEventRef.current ? new Date().toISOString() : s.runCompletedAt),
        }))
        abortRef.current = null
      }
    },
    [readSseStream],
  )

  return {
    ...state,
    execute,
    stop,
    clear,
    resumeSession,
    fetchTaskFiles,
    getFileUrl,
    respondToQuestion,
    checkRunningTask,
    attachToSession,
    runCompletedAt: state.runCompletedAt,
  }
}

function createAuthHeaders(token: string | null | undefined): Record<string, string> | undefined {
  if (!token) return undefined
  return { Authorization: `Bearer ${token}` }
}

async function uploadFiles(files: File[], token?: string): Promise<string[]> {
  const fileIds: string[] = []

  for (const file of files) {
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch(`${API_BASE}/files/upload`, {
      method: 'POST',
      headers: createAuthHeaders(token),
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
