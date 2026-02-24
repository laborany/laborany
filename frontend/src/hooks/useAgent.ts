
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
  connectionStatus: string | null
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
const SSE_READER_POLL_INTERVAL_MS = 1200
const SSE_STALL_AFTER_RESUME_MS = 90000
const LAST_SESSION_KEY_PREFIX = 'lastSession_'
const LAST_SESSION_LIST_KEY_PREFIX = 'lastSessions_'
const MAX_TRACKED_SESSIONS_PER_SKILL = 12

const TRANSIENT_NETWORK_ERROR_PATTERNS = [
  'network error',
  'failed to fetch',
  'networkerror',
  'err_network_io_suspended',
  'network_io_suspended',
  'the network connection was lost',
  'load failed',
  'network stream stalled after resume',
]

interface ReadSseStreamOptions {
  enableResumeStallDetection?: boolean
}

function getLegacyLastSessionKey(skillId: string): string {
  return `${LAST_SESSION_KEY_PREFIX}${skillId}`
}

function getTrackedSessionListKey(skillId: string): string {
  return `${LAST_SESSION_LIST_KEY_PREFIX}${skillId}`
}

function normalizeTrackedSessionIds(sessionIds: string[]): string[] {
  const deduped: string[] = []
  const seen = new Set<string>()

  for (const raw of sessionIds) {
    const sessionId = raw.trim()
    if (!sessionId || seen.has(sessionId)) continue
    seen.add(sessionId)
    deduped.push(sessionId)
    if (deduped.length >= MAX_TRACKED_SESSIONS_PER_SKILL) {
      break
    }
  }

  return deduped
}

function safeReadStorage(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeWriteStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore storage quota / privacy mode errors
  }
}

function safeRemoveStorage(key: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore storage quota / privacy mode errors
  }
}

function readTrackedSessionIds(skillId: string): string[] {
  const listRaw = safeReadStorage(getTrackedSessionListKey(skillId))
  let sessionIds: string[] = []

  if (listRaw) {
    try {
      const parsed = JSON.parse(listRaw)
      if (Array.isArray(parsed)) {
        sessionIds = parsed.filter((item): item is string => typeof item === 'string')
      }
    } catch {
      sessionIds = []
    }
  }

  const legacySessionId = (safeReadStorage(getLegacyLastSessionKey(skillId)) || '').trim()
  if (legacySessionId && !sessionIds.includes(legacySessionId)) {
    sessionIds.push(legacySessionId)
  }

  return normalizeTrackedSessionIds(sessionIds)
}

function writeTrackedSessionIds(skillId: string, sessionIds: string[]): void {
  const normalized = normalizeTrackedSessionIds(sessionIds)
  const legacyKey = getLegacyLastSessionKey(skillId)
  const listKey = getTrackedSessionListKey(skillId)

  if (!normalized.length) {
    safeRemoveStorage(legacyKey)
    safeRemoveStorage(listKey)
    return
  }

  safeWriteStorage(legacyKey, normalized[0])
  safeWriteStorage(listKey, JSON.stringify(normalized))
}

function rememberTrackedSessionId(skillId: string, sessionId: string): void {
  const sid = sessionId.trim()
  if (!sid) return
  const previous = readTrackedSessionIds(skillId).filter((id) => id !== sid)
  writeTrackedSessionIds(skillId, [sid, ...previous])
}

function forgetTrackedSessionId(skillId: string, sessionId: string): void {
  const sid = sessionId.trim()
  if (!sid) return
  const next = readTrackedSessionIds(skillId).filter((id) => id !== sid)
  writeTrackedSessionIds(skillId, next)
}

function clearTrackedSessionIds(skillId: string): void {
  writeTrackedSessionIds(skillId, [])
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  onRetry?: (msg: string) => void,
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

      const msg = `服务暂不可用，${retryAfter / 1000}s 后重试 (${attempt + 1}/${maxRetries})`
      console.log(`[useAgent] ${msg}`)
      onRetry?.(msg)
      await new Promise(r => setTimeout(r, retryAfter))
    } catch (err) {
      lastError = err as Error
      if ((err as Error).name === 'AbortError') throw err

      const delay = Math.pow(2, attempt) * 1000
      const msg = `请求失败，${delay / 1000}s 后重试 (${attempt + 1}/${maxRetries})`
      console.log(`[useAgent] ${msg}`)
      onRetry?.(msg)
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

function isTransientNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const text = `${err.message || ''}`.toLowerCase()
  return TRANSIENT_NETWORK_ERROR_PATTERNS.some((pattern) => text.includes(pattern))
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
    connectionStatus: null,
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
  const resumeHintAtRef = useRef(0)
  const prevSkillIdRef = useRef(skillId)
  const textFlushRafRef = useRef<number | null>(null)
  const pendingTextFlushRef = useRef(false)
  const isReplayingRef = useRef(false)

  const flushAssistantText = useCallback((force = false) => {
    if (!force && !pendingTextFlushRef.current) {
      return
    }

    pendingTextFlushRef.current = false

    const assistantId = assistantIdRef.current
    const nextContent = currentTextRef.current
    if (!nextContent) {
      setState((s) => (s.connectionStatus ? { ...s, connectionStatus: null } : s))
      return
    }

    setState((s) => {
      const existing = s.messages.find((m) => m.id === assistantId)
      const base = s.connectionStatus ? { ...s, connectionStatus: null } : s
      if (existing) {
        return {
          ...base,
          messages: s.messages.map((m) => (m.id === assistantId ? { ...m, content: nextContent } : m)),
        }
      }

      return {
        ...base,
        messages: [
          ...s.messages,
          {
            id: assistantId,
            type: 'assistant',
            content: nextContent,
            timestamp: new Date(),
          },
        ],
      }
    })
  }, [])

  const scheduleAssistantTextFlush = useCallback(() => {
    if (textFlushRafRef.current !== null) return

    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      flushAssistantText()
      return
    }

    textFlushRafRef.current = window.requestAnimationFrame(() => {
      textFlushRafRef.current = null
      flushAssistantText()
    })
  }, [flushAssistantText])

  const rememberActiveSessionId = useCallback((sessionId: string) => {
    rememberTrackedSessionId(skillId, sessionId)
  }, [skillId])

  const forgetActiveSessionId = useCallback((sessionId?: string | null) => {
    const sid = (sessionId || sessionIdRef.current || '').trim()
    if (sid) {
      forgetTrackedSessionId(skillId, sid)
      return
    }
    clearTrackedSessionIds(skillId)
  }, [skillId])

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
    isReplayingRef.current = false
    pendingTextFlushRef.current = false
    if (textFlushRafRef.current !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(textFlushRafRef.current)
      textFlushRafRef.current = null
    }
    terminalEventRef.current = false

    setState({
      messages: [],
      isRunning: false,
      runCompletedAt: null,
      sessionId: null,
      error: null,
      connectionStatus: null,
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

  useEffect(() => {
    return () => {
      if (textFlushRafRef.current !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(textFlushRafRef.current)
      }
      textFlushRafRef.current = null
      pendingTextFlushRef.current = false
      isReplayingRef.current = false
    }
  }, [])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resumeHintAtRef.current = Date.now()
        if (sessionIdRef.current && !terminalEventRef.current) {
          setState((s) => (s.isRunning
            ? { ...s, connectionStatus: s.connectionStatus || 'Screen resumed, checking connection...' }
            : s))
        }
      }
    }
    const onOnline = () => {
      resumeHintAtRef.current = Date.now()
      if (sessionIdRef.current && !terminalEventRef.current) {
        setState((s) => (s.isRunning
          ? { ...s, connectionStatus: s.connectionStatus || 'Network restored, checking connection...' }
          : s))
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  const handleEvent = useCallback(
    (event: Record<string, unknown>) => {
      const eventType = typeof event.type === 'string' ? event.type : ''
      if (eventType && eventType !== 'text') {
        flushAssistantText(true)
      }
      switch (eventType) {
        case 'session':
          const sid = event.sessionId as string
          sessionIdRef.current = sid
          setState((s) => ({ ...s, sessionId: sid }))
          rememberActiveSessionId(sid)
          break

        case 'text': {
          // 收到文本说明 CLI 已成功连接 API，清除连接状态
          currentTextRef.current += event.content as string
          pendingTextFlushRef.current = true
          scheduleAssistantTextFlush()
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

          // tool_use 后重置文本累计状态（重放期间跳过，避免丢弃已积累的 assistant 文本）
          if (!isReplayingRef.current) {
            currentTextRef.current = ''
            pendingTextFlushRef.current = false
            assistantIdRef.current = crypto.randomUUID()
          }
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

        case 'status': {
          const statusText = (event.content || event.message) as string | undefined
          if (statusText) {
            setState((s) => ({ ...s, connectionStatus: statusText }))
          }
          break
        }

        case 'error':
          setState((s) => ({ ...s, error: (event.message || event.content) as string, connectionStatus: null }))
          forgetActiveSessionId((event.sessionId as string | undefined) || sessionIdRef.current)
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
          isReplayingRef.current = false
          terminalEventRef.current = true
          forgetActiveSessionId((event.sessionId as string | undefined) || sessionIdRef.current)
          setState((s) => ({
            ...s,
            runCompletedAt: new Date().toISOString(),
            connectionStatus: null,
          }))
          break
      }
    },
    [flushAssistantText, forgetActiveSessionId, rememberActiveSessionId, scheduleAssistantTextFlush],
  )

  const readSseStream = useCallback(
    async (res: Response, options?: ReadSseStreamOptions) => {
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      const enableResumeStallDetection = Boolean(options?.enableResumeStallDetection)

      if (!reader) throw new Error('无法读取响应流')

      let buffer = ''
      let eventType = ''
      let shouldTerminate = false
      let lastProgressAt: number | null = null
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
          if (type && type !== 'session') {
            lastProgressAt = Date.now()
          }
          if (type === 'done' || type === 'stopped' || type === 'aborted') {
            shouldTerminate = true
          }
        } catch {
          // 忽略单条 SSE 事件解析失败
        } finally {
          eventType = ''
        }
      }

      let pendingReadPromise: Promise<ReadableStreamReadResult<Uint8Array>> | null = null
      while (true) {
        if (!pendingReadPromise) {
          pendingReadPromise = reader.read()
        }

        let raceResult: { kind: 'read'; result: ReadableStreamReadResult<Uint8Array> } | { kind: 'tick' }
        try {
          raceResult = await Promise.race([
            pendingReadPromise.then((result) => ({ kind: 'read' as const, result })),
            sleep(SSE_READER_POLL_INTERVAL_MS).then(() => ({ kind: 'tick' as const })),
          ])
        } catch (err) {
          if (shouldTerminate || isAbortLikeError(err)) {
            break
          }
          throw err
        }

        if (raceResult.kind === 'tick') {
          const now = Date.now()
          const resumeHintAt = resumeHintAtRef.current
          const hasResumeSignal = resumeHintAt > 0
          const lastProgressTs = lastProgressAt ?? 0
          const hasProgressSinceResume = lastProgressAt !== null
            && lastProgressTs >= resumeHintAt
          const streamStalled = hasProgressSinceResume
            && now - lastProgressTs > SSE_STALL_AFTER_RESUME_MS
          if (!shouldTerminate && enableResumeStallDetection && hasResumeSignal && streamStalled) {
            void reader.cancel()
            throw new Error('Network stream stalled after resume')
          }
          continue
        }

        pendingReadPromise = null
        const { done, value } = raceResult.result
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split(/\r?\n\r?\n/)
        buffer = blocks.pop() || ''

        for (const block of blocks) {
          parseEventBlock(block)
          if (shouldTerminate) {
            flushAssistantText(true)
            isReplayingRef.current = false
            void reader.cancel()
            return
          }
        }
      }

      const tail = buffer.trim()
      if (tail) {
        parseEventBlock(tail)
      }

      flushAssistantText(true)
      isReplayingRef.current = false

      if (shouldTerminate) {
        void reader.cancel()
      }
    },
    [flushAssistantText, handleEvent],
  )

  const reconnectSessionStream = useCallback(
    async (sessionId: string): Promise<boolean> => {
      const token = localStorage.getItem('token')
      const reconnectUrl = `${API_BASE}/skill/runtime/attach/${sessionId}?replay=0&includeSession=0`
      let reconnectError: unknown = null
      const maxReconnectAttempts = 3

      for (let attempt = 1; attempt <= maxReconnectAttempts; attempt++) {
        if (abortRef.current?.signal.aborted) {
          return false
        }

        setState((s) => ({
          ...s,
          isRunning: true,
          error: null,
          connectionStatus: `Connection lost, reconnecting (${attempt}/${maxReconnectAttempts})...`,
        }))

        try {
          const reconnectRes = await fetchWithRetry(
            reconnectUrl,
            {
              signal: abortRef.current?.signal,
              headers: createAuthHeaders(token),
            },
            1,
          )

          if (!reconnectRes.ok) {
            throw new Error(`Unable to reconnect task (${reconnectRes.status})`)
          }

          await readSseStream(reconnectRes, { enableResumeStallDetection: true })
          return true
        } catch (err) {
          reconnectError = err
          if (isAbortLikeError(err)) {
            return false
          }
          if (!isTransientNetworkError(err)) {
            break
          }
          if (attempt < maxReconnectAttempts) {
            await sleep(800 * attempt)
          }
        }
      }

      if (reconnectError instanceof Error) {
        throw reconnectError
      }
      throw new Error('Unable to reconnect task stream')
    },
    [readSseStream],
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
        connectionStatus: null,
        createdCapability: null,
        pendingQuestion: null,
      }))

      terminalEventRef.current = false
      isReplayingRef.current = false

      // 中止上一轮未完成请求（防止快速连点导致竞态）
      abortRef.current?.abort()

      // 准备助手消息
      assistantIdRef.current = crypto.randomUUID()
      currentTextRef.current = ''
      pendingTextFlushRef.current = false
      if (textFlushRafRef.current !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(textFlushRafRef.current)
        textFlushRafRef.current = null
      }

      abortRef.current = new AbortController()

      try {
        console.log('[useAgent] 发送请求到 /api/skill/execute')
        const executionSkillId = skillId === '__converse__' ? '__generic__' : skillId

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
          skill_id: executionSkillId,
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
          3,
          (msg) => setState((s) => ({ ...s, connectionStatus: msg })),
        )

        console.log('[useAgent] 响应状态:', res.status)

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: '请求失败' }))
          throw new Error(errorData.error || `请求失败: ${res.status}`)
        }
        await readSseStream(res)
      } catch (err) {
        let recoveredByReconnect = false

        const activeSessionId = sessionIdRef.current
        if (
          !isAbortLikeError(err)
          && !terminalEventRef.current
          && activeSessionId
          && isTransientNetworkError(err)
        ) {
          try {
            recoveredByReconnect = await reconnectSessionStream(activeSessionId)
          } catch (reErr) {
            err = reErr
          }
        }

        if (isAbortLikeError(err) && abortByQuestionRef.current) {
          abortByQuestionRef.current = false
        } else if (!isAbortLikeError(err)) {
          console.error('[useAgent] execution error:', err)
        }
        if (!isAbortLikeError(err) && !recoveredByReconnect) {
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
    [skillId, reconnectSessionStream, readSseStream],
  )

  const stop = useCallback(async () => {
    abortRef.current?.abort()
    flushAssistantText(true)
    isReplayingRef.current = false

    const sid = sessionIdRef.current
    if (sid) {
      const token = localStorage.getItem('token')
      await fetch(`${API_BASE}/skill/stop/${sid}`, {
        method: 'POST',
        headers: createAuthHeaders(token),
      })
      // 清理 localStorage
      forgetActiveSessionId(sid)
    }

    setState((s) => ({ ...s, isRunning: false }))
  }, [flushAssistantText, forgetActiveSessionId])

  // 仅断开当前前端流连接，任务继续在后端运行
  const detach = useCallback(() => {
    abortByQuestionRef.current = false
    executeInFlightRef.current = false
    flushAssistantText(true)
    isReplayingRef.current = false
    abortRef.current?.abort()
    abortRef.current = null
    setState((s) => ({
      ...s,
      isRunning: false,
      connectionStatus: null,
      error: null,
    }))
  }, [flushAssistantText])

  // 清空消息
  const clear = useCallback(() => {
    forgetActiveSessionId(sessionIdRef.current)
    sessionIdRef.current = null
    isReplayingRef.current = false
    assistantIdRef.current = crypto.randomUUID()
    currentTextRef.current = ''
    pendingTextFlushRef.current = false
    if (textFlushRafRef.current !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(textFlushRafRef.current)
      textFlushRafRef.current = null
    }
    setState({
      messages: [],
      isRunning: false,
      runCompletedAt: null,
      sessionId: null,
      error: null,
      connectionStatus: null,
      taskFiles: [],
      workDir: null,
      pendingQuestion: null,
      createdCapability: null,
      filesVersion: 0,
      compositeSteps: [],
      currentCompositeStep: -1,
    })
  }, [forgetActiveSessionId])

  const resumeSession = useCallback((targetSessionId: string) => {
    sessionIdRef.current = targetSessionId
    setState(s => ({ ...s, sessionId: targetSessionId }))
    rememberActiveSessionId(targetSessionId)
  }, [rememberActiveSessionId])

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
    const trackedSessionIds = readTrackedSessionIds(skillId)
    if (!trackedSessionIds.length) return null

    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/skill/runtime/running`, {
        headers: createAuthHeaders(token),
      })
      if (!res.ok) {
        clearTrackedSessionIds(skillId)
        return null
      }

      const runningData = await res.json().catch(() => null)
      const tasks = Array.isArray(runningData?.tasks) ? runningData.tasks : []
      const runningSessionSet = new Set<string>()
      for (const task of tasks) {
        if (!task || typeof task !== 'object') continue
        const item = task as Record<string, unknown>
        const taskSessionId = typeof item.sessionId === 'string' ? item.sessionId : ''
        const taskSkillId = typeof item.skillId === 'string' ? item.skillId : ''
        if (!taskSessionId || taskSkillId !== skillId) continue
        runningSessionSet.add(taskSessionId)
      }

      const matchedTrackedSessions = trackedSessionIds.filter((sessionId) => runningSessionSet.has(sessionId))
      if (matchedTrackedSessions.length > 0) {
        writeTrackedSessionIds(skillId, matchedTrackedSessions)
        return matchedTrackedSessions[0]
      }

      if (!runningData) {
        clearTrackedSessionIds(skillId)
        return null
      }

      clearTrackedSessionIds(skillId)
      return null
    } catch {
      return null
    }
  }, [skillId])

  const attachToSession = useCallback(
    async (targetSessionId: string) => {
      const token = localStorage.getItem('token')
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
      const controller = new AbortController()

      setState((s) => ({
        ...s,
        isRunning: true,
        runCompletedAt: null,
        sessionId: targetSessionId,
        error: null,
        connectionStatus: null,
      }))

      sessionIdRef.current = targetSessionId
      terminalEventRef.current = false
      abortRef.current = controller

      assistantIdRef.current = crypto.randomUUID()
      currentTextRef.current = ''
      pendingTextFlushRef.current = false
      isReplayingRef.current = true
      if (textFlushRafRef.current !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(textFlushRafRef.current)
        textFlushRafRef.current = null
      }

      try {
        const res = await fetchWithRetry(
          `${API_BASE}/skill/runtime/attach/${targetSessionId}`,
          {
            signal: controller.signal,
            headers: createAuthHeaders(token),
          },
          3,
          (msg) => setState((s) => ({ ...s, connectionStatus: msg })),
        )

        if (!res.ok) {
          throw new Error('无法连接到任务')
        }

        await readSseStream(res, { enableResumeStallDetection: true })
      } catch (err) {
        let recoveredByReconnect = false

        if (!isAbortLikeError(err) && !terminalEventRef.current && isTransientNetworkError(err)) {
          try {
            recoveredByReconnect = await reconnectSessionStream(targetSessionId)
          } catch (reErr) {
            err = reErr
          }
        }

        if (!isAbortLikeError(err) && !recoveredByReconnect) {
          setState((s) => ({
            ...s,
            error: (err as Error).message,
          }))
        }
      } finally {
        isReplayingRef.current = false
        setState((s) => ({
          ...s,
          isRunning: false,
          runCompletedAt: s.runCompletedAt || (terminalEventRef.current ? new Date().toISOString() : s.runCompletedAt),
        }))
        if (abortRef.current === controller) {
          abortRef.current = null
        }
      }
    },
    [readSseStream, reconnectSessionStream],
  )

  return {
    ...state,
    execute,
    stop,
    detach,
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
  const maxRetries = 3

  for (const file of files) {
    let uploaded = false

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
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
          uploaded = true
          break
        }

        if (res.status === 400 && attempt < maxRetries) {
          await sleep(300 * attempt)
          continue
        }

        console.error('[useAgent] file upload failed:', file.name, res.status)
        break
      } catch (err) {
        if (attempt >= maxRetries) {
          console.error('[useAgent] 文件上传异常:', file.name, err)
          break
        }
        await sleep(300 * attempt)
      }
    }

    if (!uploaded) {
      console.warn('[useAgent] 文件未上传成功，继续执行（未附带该文件）:', file.name)
    }
  }

  return fileIds
}
