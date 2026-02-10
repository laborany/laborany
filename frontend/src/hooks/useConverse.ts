import { useCallback, useRef, useState } from 'react'
import { AGENT_API_BASE } from '../config/api'
import type { PendingQuestion } from './useAgent'
import type { AgentMessage } from '../types/message'

export interface ConverseAction {
  action:
    | 'recommend_capability'
    | 'execute_generic'
    | 'create_capability'
    | 'setup_schedule'
    | 'navigate_skill'
    | 'navigate_workflow'
    | 'create_skill'
    | 'setup_cron'
  targetType?: 'skill' | 'workflow'
  targetId?: string
  mode?: 'skill' | 'workflow'
  seedQuery?: string
  reason?: string
  name?: string
  tz?: string
  cronExpr?: string
  targetQuery?: string
  planSteps?: string[]
  skillId?: string
  workflowId?: string
  query?: string
  cronSchedule?: string
  cronTargetQuery?: string
}

export interface UseConverseReturn {
  messages: AgentMessage[]
  sendMessage: (text: string) => Promise<void>
  stop: () => void
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
  error: string | null
  reset: () => void
}

type ConversePhase = NonNullable<UseConverseReturn['state']>['phase']

const ACTION_MARKER_RE = /\n?LABORANY_ACTION:\s*\{[\s\S]*?\}\s*$/

function stripActionMarker(text: string): string {
  return text.replace(ACTION_MARKER_RE, '').trim()
}

export function useConverse(): UseConverseReturn {
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [action, setAction] = useState<ConverseAction | null>(null)
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null)
  const [state, setState] = useState<UseConverseReturn['state']>(null)
  const [isThinking, setIsThinking] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sessionIdRef = useRef<string | null>(null)
  const messagesRef = useRef<AgentMessage[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const requestSeqRef = useRef(0)

  messagesRef.current = messages

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsThinking(false)
  }, [])

  const processSSEStream = useCallback(async (
    res: globalThis.Response,
    _userMessageList: AgentMessage[],
  ) => {
    const reader = res.body?.getReader()
    if (!reader) return

    const decoder = new TextDecoder()
    let buffer = ''
    let assistantText = ''
    let shouldTerminate = false
    const assistantId = `assistant_${Date.now()}`
    const upsertAssistant = (prev: AgentMessage[], text: string): AgentMessage[] => {
      const withoutCurrent = prev.filter((item) => item.id !== assistantId)
      if (!text) return withoutCurrent
      return [...withoutCurrent, { id: assistantId, type: 'assistant', content: text, timestamp: new Date() }]
    }

    const handleEvent = (eventType: string, data: Record<string, unknown>) => {
      if (eventType === 'session') {
        const sid = data.sessionId as string
        sessionIdRef.current = sid
        setSessionId(sid)
        return
      }

      if (eventType === 'text') {
        assistantText += (data.content as string) || ''
        const cleaned = stripActionMarker(assistantText)
        setMessages((prev) => upsertAssistant(prev, cleaned))
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
        // 忽略单条 SSE 解析错误
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

    const cleaned = stripActionMarker(assistantText)
    setMessages((prev) => upsertAssistant(prev, cleaned))

    if (shouldTerminate) {
      void reader.cancel()
    }
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    const requestSeq = ++requestSeqRef.current
    const q = text.trim()
    if (!q) return

    const userMessage: AgentMessage = {
      id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'user',
      content: q,
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
      const res = await fetch(`${AGENT_API_BASE}/converse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          messages: updated
            .filter((item) => item.type !== 'tool')
            .map((item) => ({
              role: item.type === 'assistant' ? 'assistant' : 'user',
              content: item.content,
            })),
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
          setAction({ action: 'execute_generic', query: q, planSteps: [] })
          return
        }
        throw new Error(`请求失败: ${res.status}`)
      }

      await processSSEStream(res, updated)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
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
  }, [processSSEStream])

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

  const reset = useCallback(() => {
    stop()
    setMessages([])
    setAction(null)
    setPendingQuestion(null)
    setState(null)
    setSessionId(null)
    setError(null)
    sessionIdRef.current = null
  }, [stop])

  return {
    messages,
    sendMessage,
    stop,
    respondToQuestion,
    action,
    pendingQuestion,
    state,
    isThinking,
    sessionId,
    error,
    reset,
  }
}
