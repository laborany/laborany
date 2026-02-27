import { useCallback, useRef, useState } from 'react'
import { AGENT_API_BASE, API_BASE } from '../config/api'
import type { PendingQuestion } from './useAgent'
import type { AgentMessage } from '../types/message'
import { useModelProfile } from '../contexts/ModelProfileContext'

export interface ConverseAction {
  action:
    | 'recommend_capability'
    | 'execute_generic'
    | 'create_capability'
    | 'setup_schedule'
  targetId?: string
  seedQuery?: string
  confidence?: number
  matchType?: 'exact' | 'candidate'
  reason?: string
  name?: string
  tz?: string
  cronExpr?: string
  targetQuery?: string
  planSteps?: string[]
  query?: string
}

export interface UseConverseReturn {
  messages: AgentMessage[]
  sendMessage: (text: string, files?: File[]) => Promise<void>
  stop: () => void
  resumeSession: (sessionId: string) => Promise<boolean>
  respondToQuestion: (questionId: string, answers: Record<string, string>) => Promise<void>
  action: ConverseAction | null
  pendingQuestion: PendingQuestion | null
  state: {
    phase: 'clarify' | 'match' | 'choose_strategy' | 'plan_review' | 'schedule_wizard' | 'ready'
    approvalRequired: boolean
    validationErrors: string[]
  } | null
  isThinking: boolean
  sessionId: string | null
  sessionFileIds: string[]
  error: string | null
  reset: () => void
}

type ConversePhase = NonNullable<UseConverseReturn['state']>['phase']

const ACTION_MARKER_RE = /\n?LABORANY_ACTION:\s*\{[\s\S]*?\}\s*$/
const FILE_IDS_MARKER_RE = /\[(?:LABORANY_FILE_IDS|已上传文件 ID|Uploaded file IDs?)\s*:\s*([^\]]+)\]/gi

interface SessionDetailMessage {
  id?: number
  type?: string
  content?: string | null
  toolName?: string | null
  toolInput?: Record<string, unknown> | null
  toolResult?: string | null
  createdAt?: string
}

function isAbortLikeError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err.name === 'AbortError') return true
  const text = `${err.message || ''}`.toLowerCase()
  return text.includes('aborted') || text.includes('bodystreambuffer')
}

function stripActionMarker(text: string): string {
  return text.replace(ACTION_MARKER_RE, '').trim()
}

function parseUTCDate(dateStr: string): Date {
  const s = dateStr.trim()
  if (s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s)) return new Date(s)
  return new Date(s + 'Z')
}

function mergeUniqueIds(...lists: string[][]): string[] {
  const merged = new Set<string>()
  for (const list of lists) {
    for (const rawId of list) {
      const id = rawId.trim()
      if (id) {
        merged.add(id)
      }
    }
  }
  return Array.from(merged)
}

function appendFileIdMarker(text: string, fileIds: string[]): string {
  const cleaned = text.replace(FILE_IDS_MARKER_RE, '').trim()
  if (!fileIds.length) {
    return cleaned
  }
  return `${cleaned}\n\n[LABORANY_FILE_IDS: ${fileIds.join(', ')}]`
}

async function uploadFiles(files: File[]): Promise<string[]> {
  const token = localStorage.getItem('token')
  const headers: HeadersInit = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const uploadedIds: string[] = []
  for (const file of files) {
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${API_BASE}/files/upload`, {
        method: 'POST',
        headers,
        body: formData,
      })
      if (!res.ok) continue

      const payload = await res.json().catch(() => null) as { id?: string } | null
      if (payload?.id) {
        uploadedIds.push(payload.id)
      }
    } catch {
      // keep uploading the rest
    }
  }

  return uploadedIds
}

export function useConverse(): UseConverseReturn {
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [action, setAction] = useState<ConverseAction | null>(null)
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null)
  const [state, setState] = useState<UseConverseReturn['state']>(null)
  const [isThinking, setIsThinking] = useState(false)
  const { activeProfileId } = useModelProfile()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionFileIds, setSessionFileIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const sessionIdRef = useRef<string | null>(null)
  const sessionFileIdsRef = useRef<string[]>([])
  const messagesRef = useRef<AgentMessage[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const requestSeqRef = useRef(0)
  const isThinkingRef = useRef(false)

  messagesRef.current = messages
  isThinkingRef.current = isThinking

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsThinking(false)
  }, [])

  const processSSEStream = useCallback(async (res: globalThis.Response) => {
    const reader = res.body?.getReader()
    if (!reader) return

    const decoder = new TextDecoder()
    let buffer = ''
    let assistantText = ''
    let shouldTerminate = false
    const assistantId = `assistant_${Date.now()}`
    let pendingAssistantFlush = false
    let assistantFlushRaf: number | null = null
    const upsertAssistant = (prev: AgentMessage[], text: string): AgentMessage[] => {
      const withoutCurrent = prev.filter((item) => item.id !== assistantId)
      if (!text) return withoutCurrent
      return [...withoutCurrent, { id: assistantId, type: 'assistant', content: text, timestamp: new Date() }]
    }

    const flushAssistantText = (force = false) => {
      if (!force && !pendingAssistantFlush) return
      pendingAssistantFlush = false
      const cleaned = stripActionMarker(assistantText)
      setMessages((prev) => upsertAssistant(prev, cleaned))
    }

    const scheduleAssistantFlush = () => {
      if (assistantFlushRaf !== null) return
      if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        flushAssistantText()
        return
      }

      assistantFlushRaf = window.requestAnimationFrame(() => {
        assistantFlushRaf = null
        flushAssistantText()
        // Fix P0-2 (useConverse): RAF 执行期间可能又来了新 chunk，立即再 flush 一次
        if (pendingAssistantFlush) {
          flushAssistantText()
        }
      })
    }

    const cancelAssistantFlush = () => {
      if (assistantFlushRaf !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(assistantFlushRaf)
      }
      assistantFlushRaf = null
    }

    const handleEvent = (eventType: string, data: Record<string, unknown>) => {
      if (eventType !== 'text') {
        cancelAssistantFlush()
        flushAssistantText(true)
      }

      if (eventType === 'session') {
        const sid = data.sessionId as string
        sessionIdRef.current = sid
        setSessionId(sid)
        return
      }

      if (eventType === 'text') {
        assistantText += (data.content as string) || ''
        pendingAssistantFlush = true
        scheduleAssistantFlush()
        return
      }

      if (eventType === 'action') {
        setAction(data as unknown as ConverseAction)
        return
      }

      if (eventType === 'state') {
        const phase = ((): ConversePhase => {
          const raw = data.phase
          if (
            raw === 'clarify'
            || raw === 'match'
            || raw === 'choose_strategy'
            || raw === 'plan_review'
            || raw === 'schedule_wizard'
            || raw === 'ready'
          ) {
            return raw
          }
          return 'clarify'
        })()
        const approvalRequired = Boolean(data.approvalRequired)
        const validationErrors = Array.isArray(data.validationErrors)
          ? data.validationErrors.filter(item => typeof item === 'string') as string[]
          : []
        setState({ phase, approvalRequired, validationErrors })
        return
      }

      if (eventType === 'question') {
        setPendingQuestion(data as unknown as PendingQuestion)
        setIsThinking(false)
        shouldTerminate = true
        return
      }

      if (eventType === 'tool_use') {
        setMessages((prev) => [
          ...prev,
          {
            id: `tool_use_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type: 'tool',
            content: '',
            toolName: (data.toolName as string) || 'UnknownTool',
            toolInput: (data.toolInput as Record<string, unknown>) || {},
            timestamp: new Date(),
          },
        ])
        return
      }

      if (eventType === 'tool_result') {
        setMessages((prev) => [
          ...prev,
          {
            id: `tool_result_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type: 'tool',
            content: (data.toolResult as string) || '',
            timestamp: new Date(),
          },
        ])
        return
      }

      if (eventType === 'error') {
        setError((data.message as string) || '对话服务异常')
        return
      }

      if (eventType === 'done') {
        shouldTerminate = true
        setIsThinking(false)
      }
    }

    const parseSSEBlock = (block: string) => {
      const lines = block.split(/\r?\n/)
      let eventType = ''
      let dataText = ''

      for (const rawLine of lines) {
        const line = rawLine.trimEnd()
        if (!line) continue
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim()
          continue
        }
        if (line.startsWith('data:')) {
          dataText += line.slice(5).trimStart()
        }
      }

      if (!eventType || !dataText) return

      try {
        const data = JSON.parse(dataText) as Record<string, unknown>
        handleEvent(eventType, data)
      } catch {
        // ignore malformed SSE block
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() || ''
      for (const block of blocks) {
        parseSSEBlock(block)
        if (shouldTerminate) {
          void reader.cancel()
          break
        }
      }
      if (shouldTerminate) {
        break
      }
    }

    const tail = buffer.trim()
    if (tail) {
      parseSSEBlock(tail)
    }

    cancelAssistantFlush()
    flushAssistantText(true)

    if (shouldTerminate) {
      void reader.cancel()
    }
  }, [])

  const sendMessage = useCallback(async (text: string, files: File[] = []) => {
    const requestSeq = ++requestSeqRef.current
    const q = text.trim()
    if (!q && files.length === 0) return

    const userInput = q || 'I uploaded files. Please read them first and continue.'

    abortRef.current?.abort()
    abortRef.current = null

    const userMessage: AgentMessage = {
      id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'user',
      content: userInput,
      timestamp: new Date(),
    }

    const updated = [...messagesRef.current, userMessage]
    setMessages(updated)
    setAction(null)
    setPendingQuestion(null)
    setError(null)
    setIsThinking(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      let mergedFileIds = sessionFileIdsRef.current
      if (files.length > 0) {
        const newFileIds = await uploadFiles(files)
        if (newFileIds.length > 0) {
          mergedFileIds = mergeUniqueIds(sessionFileIdsRef.current, newFileIds)
          sessionFileIdsRef.current = mergedFileIds
          setSessionFileIds(mergedFileIds)
        }
      }

      const payloadMessages = updated
        .filter((item) => item.type !== 'tool')
        .map((item) => ({
          role: item.type === 'assistant' ? 'assistant' : 'user',
          content: item.content,
        }))

      if (payloadMessages.length > 0) {
        const lastIdx = payloadMessages.length - 1
        payloadMessages[lastIdx] = {
          ...payloadMessages[lastIdx],
          content: appendFileIdMarker(userInput, mergedFileIds),
        }
      }

      const res = await fetch(`${AGENT_API_BASE}/converse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          messages: payloadMessages,
          modelProfileId: activeProfileId || undefined,
          context: {
            channel: 'desktop',
            locale: 'zh-CN',
            capabilities: {
              canSendFile: false,
              canSendImage: false,
            },
          },
        }),
      })

      if (!res.ok) {
        if (res.status === 503 || res.status === 404) {
          setMessages((prev) => ([
            ...prev,
            {
              id: `assistant_fallback_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              type: 'assistant',
              content: '首页调度服务暂不可用，已切换到通用执行模式。请确认后我继续执行。',
              timestamp: new Date(),
            },
          ]))
          setAction({ action: 'execute_generic', query: userInput, planSteps: [] })
          return
        }
        throw new Error(`请求失败: ${res.status}`)
      }

      await processSSEStream(res)
    } catch (err) {
      if (isAbortLikeError(err)) {
        return
      }
      const message = err instanceof Error ? err.message : '对话服务异常'
      if (requestSeq === requestSeqRef.current) {
        setError(message)
      }
    } finally {
      if (requestSeq === requestSeqRef.current && abortRef.current === controller) {
        abortRef.current = null
      }
      if (requestSeq === requestSeqRef.current) {
        setIsThinking(false)
      }
    }
  }, [activeProfileId, processSSEStream])

  const respondToQuestion = useCallback(async (
    _questionId: string,
    answers: Record<string, string>,
  ) => {
    if (!pendingQuestion) return

    const answerText = Object.values(answers)
      .map((answer) => answer.trim())
      .filter(Boolean)
      .join('\n')
      .trim()

    if (!answerText) return

    setPendingQuestion(null)
    await sendMessage(answerText)
  }, [pendingQuestion, sendMessage])

  const resumeSession = useCallback(async (targetSessionId: string): Promise<boolean> => {
    if (isThinkingRef.current) return false
    const sid = targetSessionId.trim()
    if (!sid) return false

    abortRef.current?.abort()
    abortRef.current = null

    try {
      const token = localStorage.getItem('token')
      const headers: HeadersInit = {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sid)}`, { headers })
      if (!res.ok) return false

      const payload = await res.json() as {
        skill_id?: string
        messages?: SessionDetailMessage[]
      }
      if (payload.skill_id !== '__converse__') return false

      const restored = (Array.isArray(payload.messages) ? payload.messages : [])
        .reduce<AgentMessage[]>((acc, item, idx) => {
          const type = (item.type || '').trim()
          const createdAt = item.createdAt ? parseUTCDate(item.createdAt) : new Date()
          const id = `resume_${sid}_${item.id ?? idx}`

          if (type === 'user') {
            acc.push({
              id,
              type: 'user' as const,
              content: item.content || '',
              timestamp: createdAt,
            })
            return acc
          }

          if (type === 'assistant') {
            acc.push({
              id,
              type: 'assistant' as const,
              content: stripActionMarker(item.content || ''),
              timestamp: createdAt,
            })
            return acc
          }

          if (type === 'tool_use') {
            acc.push({
              id,
              type: 'tool' as const,
              content: '',
              toolName: item.toolName || 'Tool',
              toolInput: item.toolInput || {},
              timestamp: createdAt,
            })
            return acc
          }

          if (type === 'tool_result') {
            acc.push({
              id,
              type: 'tool' as const,
              content: item.toolResult || item.content || '',
              timestamp: createdAt,
            })
            return acc
          }

          if (type === 'error' || type === 'system') {
            acc.push({
              id,
              type: 'assistant' as const,
              content: item.content || '',
              timestamp: createdAt,
            })
            return acc
          }

          return acc
        }, [])

      setMessages(restored)
      messagesRef.current = restored
      setAction(null)
      setPendingQuestion(null)
      setState(null)
      setError(null)
      setIsThinking(false)
      setSessionFileIds([])
      sessionFileIdsRef.current = []
      sessionIdRef.current = sid
      setSessionId(sid)
      return true
    } catch {
      return false
    }
  }, [])

  const reset = useCallback(() => {
    stop()
    setMessages([])
    setAction(null)
    setPendingQuestion(null)
    setState(null)
    setSessionId(null)
    setSessionFileIds([])
    setError(null)
    sessionIdRef.current = null
    sessionFileIdsRef.current = []
  }, [stop])

  return {
    messages,
    sendMessage,
    stop,
    resumeSession,
    respondToQuestion,
    action,
    pendingQuestion,
    state,
    isThinking,
    sessionId,
    sessionFileIds,
    error,
    reset,
  }
}
