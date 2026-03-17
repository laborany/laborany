import { useCallback, useRef, useState } from 'react'
import { AGENT_API_BASE, API_BASE } from '../config/api'
import type { PendingQuestion } from './useAgent'
import type { AgentMessage, MessageMeta, WidgetState } from '../types/message'
import { useModelProfile } from '../contexts/ModelProfileContext'
import { supportsGenerativeWidgets } from '../lib/widgetSupport'
import {
  mergeAttachmentIds,
  normalizeAttachmentIds,
  uploadAttachments,
} from '../lib/attachments'
import {
  applyVariantSelections,
  appendMessageWithVariants,
  buildRegenerateContextMessages,
  loadStoredVariantSelections,
  persistStoredVariantSelection,
  selectMessageVariant,
  toConversationPayloadMessages,
} from '../lib/messageVariants'

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
  attachmentIds?: string[]
}

export interface UseConverseReturn {
  messages: AgentMessage[]
  sendMessage: (text: string, files?: File[]) => Promise<void>
  regenerateMessage: (messageId: string) => Promise<void>
  selectVariant: (messageId: string, variantIndex: number) => void
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
  regeneratingMessageId: string | null
  activeWidget: WidgetState | null
  setActiveWidget: React.Dispatch<React.SetStateAction<WidgetState | null>>
  showWidget: (widgetId: string) => void
  reset: () => void
}

type ConversePhase = NonNullable<UseConverseReturn['state']>['phase']

const ACTION_MARKER_RE = /\n?LABORANY_ACTION:\s*\{[\s\S]*?\}\s*$/
const ATTACHMENT_ONLY_CONVERSE_QUERY = '我上传了一些文件，请先读取文件再继续处理。'
interface SessionDetailMessage {
  id?: number
  type?: string
  content?: string | null
  toolName?: string | null
  toolInput?: Record<string, unknown> | null
  toolResult?: string | null
  meta?: MessageMeta | null
  createdAt?: string
}

interface ConverseSessionPayload {
  skill_id?: string
  messages?: SessionDetailMessage[]
  sourceMeta?: {
    attachmentIds?: string[] | string
  } | null
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

function normalizeComparableContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim()
}

function collectCommittedWidgets(messages: AgentMessage[]): Map<string, WidgetState> {
  const widgets = new Map<string, WidgetState>()
  for (const message of messages) {
    const widget = message.meta?.widget
    if (!widget) continue
    widgets.set(widget.widgetId, {
      widgetId: widget.widgetId,
      title: widget.title,
      html: widget.html,
      status: widget.status as WidgetState['status'],
    })
  }
  return widgets
}

function restoreMessagesFromPayload(sessionId: string, payload: ConverseSessionPayload): AgentMessage[] {
  const restored = (Array.isArray(payload.messages) ? payload.messages : [])
    .reduce<AgentMessage[]>((acc, item, idx) => {
      const type = (item.type || '').trim()
      const createdAt = item.createdAt ? parseUTCDate(item.createdAt) : new Date()
      const id = `resume_${sessionId}_${item.id ?? idx}`

      if (type === 'user') {
        acc.push({
          id,
          type: 'user' as const,
          content: item.content || '',
          timestamp: createdAt,
          serverMessageId: item.id ?? null,
          meta: item.meta || null,
        })
        return acc
      }

      if (type === 'assistant') {
        const widgetMeta = item.meta?.widget
        const assistantMessage: AgentMessage = {
          id,
          type: 'assistant' as const,
          content: widgetMeta ? '' : stripActionMarker(item.content || ''),
          timestamp: createdAt,
          serverMessageId: item.id ?? null,
          meta: item.meta || null,
          ...(widgetMeta ? { widgetId: widgetMeta.widgetId, widgetTitle: widgetMeta.title } : {}),
        }
        if (widgetMeta) {
          acc.push(assistantMessage)
          return acc
        }
        return appendMessageWithVariants(acc, assistantMessage)
      }

      if (type === 'tool_use') {
        acc.push({
          id,
          type: 'tool' as const,
          content: '',
          toolName: item.toolName || 'Tool',
          toolInput: item.toolInput || {},
          timestamp: createdAt,
          serverMessageId: item.id ?? null,
          meta: item.meta || null,
        })
        return acc
      }

      if (type === 'tool_result') {
        acc.push({
          id,
          type: 'tool' as const,
          content: item.toolResult || item.content || '',
          timestamp: createdAt,
          serverMessageId: item.id ?? null,
          meta: item.meta || null,
        })
        return acc
      }

      if (type === 'error' || type === 'system') {
        acc.push({
          id,
          type: 'assistant' as const,
          content: item.content || '',
          timestamp: createdAt,
          serverMessageId: item.id ?? null,
          meta: item.meta || null,
        })
        return acc
      }

      return acc
    }, [])

  return applyVariantSelections(restored, loadStoredVariantSelections(sessionId))
}

function mergePersistedMessages(
  liveMessages: AgentMessage[],
  persistedMessages: AgentMessage[],
): AgentMessage[] {
  if (liveMessages.length === 0) return persistedMessages
  if (persistedMessages.length === 0) return liveMessages

  const persistedConversationMessages = persistedMessages.filter((message) => message.type !== 'tool')
  if (persistedConversationMessages.length === 0) return liveMessages

  const merged: AgentMessage[] = []
  let persistedIndex = 0

  for (const liveMessage of liveMessages) {
    if (liveMessage.type === 'tool') {
      merged.push(liveMessage)
      continue
    }

    const persistedMessage = persistedConversationMessages[persistedIndex]
    if (!persistedMessage) {
      merged.push(liveMessage)
      continue
    }

    const isSameConversationMessage =
      liveMessage.type === persistedMessage.type
      && normalizeComparableContent(liveMessage.content) === normalizeComparableContent(persistedMessage.content)

    if (isSameConversationMessage) {
      merged.push({
        ...liveMessage,
        content: persistedMessage.content,
        timestamp: persistedMessage.timestamp,
        serverMessageId: persistedMessage.serverMessageId ?? null,
        meta: persistedMessage.meta || null,
        variants: persistedMessage.variants,
        activeVariantIndex: persistedMessage.activeVariantIndex,
      })
      persistedIndex += 1
      continue
    }

    merged.push(liveMessage)
  }

  if (persistedIndex < persistedConversationMessages.length) {
    merged.push(...persistedConversationMessages.slice(persistedIndex))
  }

  return merged
}

export function useConverse(): UseConverseReturn {
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [action, setAction] = useState<ConverseAction | null>(null)
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null)
  const [state, setState] = useState<UseConverseReturn['state']>(null)
  const [isThinking, setIsThinking] = useState(false)
  const { activeProfileId, profiles } = useModelProfile()
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) || profiles[0] || null
  const canRenderWidgets = supportsGenerativeWidgets(activeProfile)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionFileIds, setSessionFileIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null)
  const [activeWidget, setActiveWidget] = useState<WidgetState | null>(null)

  const sessionIdRef = useRef<string | null>(null)
  const sessionFileIdsRef = useRef<string[]>([])
  const messagesRef = useRef<AgentMessage[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const requestSeqRef = useRef(0)
  const isThinkingRef = useRef(false)
  const pendingDeltaRef = useRef<string | null>(null)
  const deltaRafRef = useRef<number | null>(null)
  const committedWidgetsRef = useRef<Map<string, WidgetState>>(new Map())

  messagesRef.current = messages
  isThinkingRef.current = isThinking

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsThinking(false)
  }, [])

  const fetchSessionPayload = useCallback(async (sid: string): Promise<ConverseSessionPayload | null> => {
    const token = localStorage.getItem('token')
    const headers: HeadersInit = {}
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sid)}`, { headers })
    if (!res.ok) return null

    const payload = await res.json() as ConverseSessionPayload
    if (payload.skill_id !== '__converse__') return null
    return payload
  }, [])

  const applySessionPayload = useCallback((
    sid: string,
    payload: ConverseSessionPayload,
    options?: {
      merge?: boolean
      clearInteractiveState?: boolean
    },
  ) => {
    const restored = restoreMessagesFromPayload(sid, payload)
    const nextMessages = options?.merge
      ? mergePersistedMessages(messagesRef.current, restored)
      : restored

    setMessages(nextMessages)
    messagesRef.current = nextMessages

    if (options?.clearInteractiveState !== false) {
      setAction(null)
      setPendingQuestion(null)
      setState(null)
      setError(null)
    }

    setRegeneratingMessageId(null)
    setIsThinking(false)

    committedWidgetsRef.current = collectCommittedWidgets(nextMessages)

    // Restore widget state from persisted messages
    const lastWidgetMsg = [...nextMessages].reverse().find((m) => m.meta?.widget)
    if (lastWidgetMsg?.meta?.widget) {
      const w = lastWidgetMsg.meta.widget
      setActiveWidget({ widgetId: w.widgetId, title: w.title, html: w.html, status: w.status as WidgetState['status'] })
    } else {
      setActiveWidget(null)
    }

    const restoredAttachmentIds = normalizeAttachmentIds(payload.sourceMeta?.attachmentIds)
    setSessionFileIds(restoredAttachmentIds)
    sessionFileIdsRef.current = restoredAttachmentIds
    sessionIdRef.current = sid
    setSessionId(sid)
  }, [])

  const syncPersistedMessages = useCallback(async (sid: string, expectedRequestSeq?: number): Promise<boolean> => {
    try {
      if (expectedRequestSeq !== undefined && expectedRequestSeq !== requestSeqRef.current) {
        return false
      }

      const payload = await fetchSessionPayload(sid)
      if (!payload) return false

      if (expectedRequestSeq !== undefined && expectedRequestSeq !== requestSeqRef.current) {
        return false
      }

      applySessionPayload(sid, payload, {
        merge: true,
        clearInteractiveState: false,
      })
      return true
    } catch {
      return false
    }
  }, [applySessionPayload, fetchSessionPayload])

  const processSSEStream = useCallback(async (res: globalThis.Response) => {
    const reader = res.body?.getReader()
    if (!reader) return

    const decoder = new TextDecoder()
    let buffer = ''
    let assistantText = ''
    const assistantId = `assistant_${Date.now()}`
    let pendingAssistantFlush = false
    let assistantFlushRaf: number | null = null
    const upsertAssistant = (prev: AgentMessage[], text: string): AgentMessage[] => {
      const withoutCurrent = prev.filter((item) => item.id !== assistantId)
      if (!text) return withoutCurrent
      return [
        ...withoutCurrent,
        {
          id: assistantId,
          type: 'assistant',
          content: text,
          timestamp: new Date(),
          meta: {
            sessionMode: 'converse',
            source: 'llm',
            capabilities: {
              canCopy: true,
              canRegenerate: false,
            },
          },
        },
      ]
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

      if (eventType === 'widget_start') {
        setActiveWidget({
          widgetId: data.widgetId as string,
          title: (data.title as string) || 'Loading...',
          html: '',
          status: 'loading',
        })
        return
      }

      if (eventType === 'widget_delta') {
        const html = (data.html as string) || ''
        // Skip oversized deltas — final HTML arrives on commit
        if (html.length > 512_000) return
        pendingDeltaRef.current = html
        if (deltaRafRef.current === null) {
          deltaRafRef.current = window.requestAnimationFrame(() => {
            deltaRafRef.current = null
            const pending = pendingDeltaRef.current
            if (pending !== null) {
              pendingDeltaRef.current = null
              setActiveWidget((prev) => prev ? { ...prev, html: pending } : null)
            }
          })
        }
        return
      }

      if (eventType === 'widget_commit') {
        const widgetId = data.widgetId as string
        const title = (data.title as string) || 'Widget'
        const html = (data.html as string) || ''
        const widgetState: WidgetState = { widgetId, title, html, status: 'ready' }
        committedWidgetsRef.current.set(widgetId, widgetState)
        setActiveWidget(widgetState)
        // Insert anchor card into messages
        setMessages((prev) => [
          ...prev,
          {
            id: `widget_anchor_${widgetId}`,
            type: 'assistant' as const,
            content: '',
            timestamp: new Date(),
            widgetId,
            widgetTitle: title,
            meta: {
              sessionMode: 'converse',
              source: 'llm',
            },
          },
        ])
        return
      }

      if (eventType === 'widget_error') {
        setActiveWidget((prev) => prev ? {
          ...prev,
          status: 'error',
          errorMessage: (data.message as string) || 'Widget rendering failed',
        } : null)
        return
      }

      if (eventType === 'error') {
        setError((data.message as string) || '对话服务异常')
        return
      }

      if (eventType === 'done') {
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
      }
    }

    const tail = buffer.trim()
    if (tail) {
      parseSSEBlock(tail)
    }

    cancelAssistantFlush()
    flushAssistantText(true)
  }, [])

  const sendMessage = useCallback(async (text: string, files: File[] = []) => {
    const requestSeq = ++requestSeqRef.current
    const q = text.trim()
    if (!q && files.length === 0) return

    const userInput = q || ATTACHMENT_ONLY_CONVERSE_QUERY

    abortRef.current?.abort()
    abortRef.current = null

    const userMessage: AgentMessage = {
      id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'user',
      content: userInput,
      timestamp: new Date(),
      meta: {
        sessionMode: 'converse',
        messageKind: 'user',
        source: 'user',
        capabilities: {
          canCopy: true,
          canRegenerate: false,
        },
      },
    }

    const updated = [...messagesRef.current, userMessage]
    messagesRef.current = updated
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
        const newFileIds = await uploadAttachments(files, localStorage.getItem('token'))
        if (newFileIds.length > 0) {
          mergedFileIds = mergeAttachmentIds(sessionFileIdsRef.current, newFileIds)
          sessionFileIdsRef.current = mergedFileIds
          setSessionFileIds(mergedFileIds)
        }
      }

      const payloadMessages = toConversationPayloadMessages(updated)

      const res = await fetch(`${AGENT_API_BASE}/converse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          latestUserQuery: userInput,
          messages: payloadMessages,
          modelProfileId: activeProfileId || undefined,
          attachmentIds: mergedFileIds,
          context: {
            channel: 'desktop',
            locale: 'zh-CN',
            capabilities: {
              canSendFile: false,
              canSendImage: false,
              canRenderWidgets,
            },
          },
        }),
      })

      if (!res.ok) {
        if (res.status === 503 || res.status === 404) {
          setMessages((prev) => {
            const next = [
              ...prev,
              {
                id: `assistant_fallback_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                type: 'assistant' as const,
                content: '首页调度服务暂不可用，已切换到通用执行模式。请确认后我继续执行。',
                timestamp: new Date(),
              },
            ]
            messagesRef.current = next
            return next
          })
          setAction({ action: 'execute_generic', query: userInput, planSteps: [] })
          return
        }
        throw new Error(`请求失败: ${res.status}`)
      }

      await processSSEStream(res)

      const persistedSessionId = sessionIdRef.current?.trim()
      if (persistedSessionId && requestSeq === requestSeqRef.current) {
        await syncPersistedMessages(persistedSessionId, requestSeq)
      }
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
  }, [activeProfileId, canRenderWidgets, processSSEStream, syncPersistedMessages])

  const selectVariant = useCallback((messageId: string, variantIndex: number) => {
    const sessionKey = sessionIdRef.current?.trim()
    const currentMessage = messagesRef.current.find((message) => message.id === messageId)
    const variantGroupId = currentMessage?.meta?.variantGroupId?.trim()

    setMessages((prev) => {
      const next = selectMessageVariant(prev, messageId, variantIndex)
      messagesRef.current = next
      return next
    })

    if (sessionKey && variantGroupId) {
      persistStoredVariantSelection(sessionKey, variantGroupId, variantIndex)
    }
  }, [])

  const regenerateMessage = useCallback(async (messageId: string) => {
    const sid = sessionIdRef.current?.trim()
    if (!sid || isThinkingRef.current || regeneratingMessageId) return

    const targetMessage = messagesRef.current.find((message) => message.id === messageId)
    if (
      !targetMessage
      || targetMessage.type !== 'assistant'
      || !targetMessage.serverMessageId
      || targetMessage.meta?.sessionMode !== 'converse'
      || targetMessage.meta?.messageKind !== 'assistant_reply'
    ) {
      return
    }

    const contextMessages = buildRegenerateContextMessages(messagesRef.current, messageId)
    if (contextMessages.length === 0) {
      setError('缺少重做所需的会话上下文')
      return
    }

    setRegeneratingMessageId(messageId)
    setError(null)

    try {
      const response = await fetch(`${AGENT_API_BASE}/converse/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sid,
          messageId: targetMessage.serverMessageId,
          modelProfileId: activeProfileId || undefined,
          messages: contextMessages,
        }),
      })

      const payload = await response.json().catch(() => ({})) as {
        error?: string
        message?: {
          id?: number
          content?: string
          meta?: MessageMeta | null
          createdAt?: string
        }
      }

      if (!response.ok) {
        throw new Error(payload.error || `请求失败: ${response.status}`)
      }

      if (!payload.message?.content || !payload.message.id) {
        throw new Error('重做结果为空')
      }

      const variantMessage: AgentMessage = {
        id: `${messageId}_variant_${payload.message.id}`,
        type: 'assistant',
        content: payload.message.content,
        timestamp: payload.message.createdAt ? parseUTCDate(payload.message.createdAt) : new Date(),
        serverMessageId: payload.message.id,
        meta: payload.message.meta || null,
      }

      setMessages((prev) => {
        const next = appendMessageWithVariants(prev, variantMessage)
        messagesRef.current = next
        return next
      })

      const variantGroupId = payload.message.meta?.variantGroupId?.trim()
      const variantIndex = payload.message.meta?.variantIndex
      if (
        sid
        && variantGroupId
        && typeof variantIndex === 'number'
        && Number.isInteger(variantIndex)
        && variantIndex >= 0
      ) {
        persistStoredVariantSelection(sid, variantGroupId, variantIndex)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '重做失败')
    } finally {
      setRegeneratingMessageId(null)
    }
  }, [activeProfileId, regeneratingMessageId])

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
      const payload = await fetchSessionPayload(sid)
      if (!payload) return false

      applySessionPayload(sid, payload, {
        merge: false,
        clearInteractiveState: true,
      })
      return true
    } catch {
      return false
    }
  }, [applySessionPayload, fetchSessionPayload])

  const showWidget = useCallback((widgetId: string) => {
    const widget = committedWidgetsRef.current.get(widgetId)
    if (widget) setActiveWidget(widget)
  }, [])

  const reset = useCallback(() => {
    stop()
    if (deltaRafRef.current !== null) {
      window.cancelAnimationFrame(deltaRafRef.current)
      deltaRafRef.current = null
    }
    pendingDeltaRef.current = null
    committedWidgetsRef.current.clear()
    setMessages([])
    setAction(null)
    setPendingQuestion(null)
    setState(null)
    setSessionId(null)
    setSessionFileIds([])
    setError(null)
    setRegeneratingMessageId(null)
    setActiveWidget(null)
    messagesRef.current = []
    sessionIdRef.current = null
    sessionFileIdsRef.current = []
  }, [stop])

  return {
    messages,
    sendMessage,
    regenerateMessage,
    selectVariant,
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
    regeneratingMessageId,
    activeWidget,
    setActiveWidget,
    showWidget,
    reset,
  }
}
