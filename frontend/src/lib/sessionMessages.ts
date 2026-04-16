import type { AgentMessage, SessionDetail } from '../types'
import { appendMessageWithVariants } from './messageVariants'

export function parseUTCDate(dateStr: string): Date {
  const s = dateStr.trim()
  if (s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s)) return new Date(s)
  return new Date(s + 'Z')
}

export function sessionDetailToAgentMessages(session: SessionDetail | null): AgentMessage[] {
  if (!session) return []

  const messages: AgentMessage[] = []

  for (const msg of session.messages) {
    if (msg.type === 'user' && msg.content) {
      messages.push({
        id: String(msg.id),
        type: 'user',
        content: msg.content,
        timestamp: parseUTCDate(msg.createdAt),
        serverMessageId: msg.id,
        meta: msg.meta || null,
      })
      continue
    }

    if (msg.type === 'assistant' && msg.content) {
      const widgetMeta = msg.meta?.widget
      const assistantMessage: AgentMessage = {
        id: String(msg.id),
        type: 'assistant',
        content: widgetMeta ? '' : msg.content,
        timestamp: parseUTCDate(msg.createdAt),
        serverMessageId: msg.id,
        meta: msg.meta || null,
        ...(widgetMeta ? { widgetId: widgetMeta.widgetId, widgetTitle: widgetMeta.title } : {}),
      }

      if (widgetMeta) {
        messages.push(assistantMessage)
      } else {
        const merged = appendMessageWithVariants(messages, assistantMessage)
        messages.length = 0
        messages.push(...merged)
      }
      continue
    }

    if (msg.type === 'tool_use' && msg.toolName) {
      const parsedToolInput =
        msg.toolInput && typeof msg.toolInput === 'object'
          ? msg.toolInput as Record<string, unknown>
          : undefined

      messages.push({
        id: String(msg.id),
        type: 'tool',
        content: '',
        toolName: msg.toolName,
        toolInput: parsedToolInput,
        timestamp: parseUTCDate(msg.createdAt),
        serverMessageId: msg.id,
        meta: msg.meta || null,
      })
      continue
    }

    if (msg.type === 'tool_result' && typeof msg.toolResult === 'string') {
      messages.push({
        id: `${msg.id}-result`,
        type: 'tool',
        content: msg.toolResult,
        toolName: '执行结果',
        timestamp: parseUTCDate(msg.createdAt),
        serverMessageId: msg.id,
        meta: msg.meta || null,
      })
    }
  }

  if (messages.length === 0) {
    messages.push({
      id: 'query',
      type: 'user',
      content: session.query,
      timestamp: parseUTCDate(session.created_at),
    })
  }

  return messages
}
