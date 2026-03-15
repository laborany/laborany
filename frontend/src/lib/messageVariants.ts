import type { AgentMessage, MessageVariant } from '../types/message'

const VARIANT_SELECTION_STORAGE_PREFIX = 'laborany.converse.variant-selection'

type VariantSelectionMap = Record<string, number>

function toVariant(message: AgentMessage): MessageVariant {
  return {
    id: message.id,
    serverMessageId: message.serverMessageId ?? null,
    content: message.content,
    timestamp: message.timestamp,
    meta: message.meta || null,
  }
}

function isAssistantVariantMessage(message: AgentMessage): boolean {
  return (
    message.type === 'assistant'
    && message.meta?.sessionMode === 'converse'
    && message.meta?.messageKind === 'assistant_reply'
    && Boolean(message.meta?.variantGroupId)
  )
}

function getVariantGroupId(message: AgentMessage): string | null {
  const value = message.meta?.variantGroupId
  if (typeof value !== 'string') return null
  const groupId = value.trim()
  return groupId || null
}

function sanitizeVariantSelections(raw: unknown): VariantSelectionMap {
  if (!raw || typeof raw !== 'object') return {}

  const entries = Object.entries(raw as Record<string, unknown>)
    .filter(([key, value]) =>
      key.trim().length > 0
      && typeof value === 'number'
      && Number.isInteger(value)
      && value >= 0,
    )
    .map(([key, value]) => [key, value as number] as const)

  return Object.fromEntries(entries)
}

function getVariantSelectionStorageKey(sessionId: string): string {
  return `${VARIANT_SELECTION_STORAGE_PREFIX}.${sessionId}`
}

function dedupeVariants(variants: MessageVariant[]): MessageVariant[] {
  const deduped: MessageVariant[] = []
  const seenServerIds = new Set<number>()

  for (const variant of variants) {
    const serverId = variant.serverMessageId
    if (typeof serverId === 'number' && Number.isFinite(serverId)) {
      if (seenServerIds.has(serverId)) continue
      seenServerIds.add(serverId)
    }
    deduped.push(variant)
  }

  return deduped
}

function applyActiveVariant(message: AgentMessage, variants: MessageVariant[], activeVariantIndex: number): AgentMessage {
  const safeIndex = Math.min(Math.max(activeVariantIndex, 0), variants.length - 1)
  const activeVariant = variants[safeIndex]
  return {
    ...message,
    content: activeVariant.content,
    timestamp: activeVariant.timestamp,
    serverMessageId: activeVariant.serverMessageId ?? null,
    meta: activeVariant.meta || null,
    variants,
    activeVariantIndex: safeIndex,
  }
}

export function appendMessageWithVariants(messages: AgentMessage[], incoming: AgentMessage): AgentMessage[] {
  if (!isAssistantVariantMessage(incoming)) {
    return [...messages, incoming]
  }

  const groupId = incoming.meta?.variantGroupId
  const targetIndex = messages.findIndex((message) =>
    message.type === 'assistant' && message.meta?.variantGroupId === groupId,
  )

  if (targetIndex === -1) {
    const variants = [toVariant(incoming)]
    return [...messages, { ...incoming, variants, activeVariantIndex: 0 }]
  }

  const target = messages[targetIndex]
  const existingVariants = target.variants && target.variants.length > 0
    ? target.variants
    : [toVariant(target)]
  const variants = dedupeVariants([...existingVariants, toVariant(incoming)])
  const next = applyActiveVariant(target, variants, variants.length - 1)
  const updated = [...messages]
  updated[targetIndex] = next
  return updated
}

export function selectMessageVariant(messages: AgentMessage[], messageId: string, variantIndex: number): AgentMessage[] {
  return messages.map((message) => {
    if (message.id !== messageId || !message.variants || message.variants.length === 0) {
      return message
    }

    return applyActiveVariant(message, message.variants, variantIndex)
  })
}

export function applyVariantSelections(
  messages: AgentMessage[],
  selections: Record<string, number>,
): AgentMessage[] {
  return messages.map((message) => {
    const groupId = getVariantGroupId(message)
    if (!groupId || !message.variants || message.variants.length === 0) {
      return message
    }

    const variantIndex = selections[groupId]
    if (!Number.isInteger(variantIndex) || variantIndex < 0) {
      return message
    }

    return applyActiveVariant(message, message.variants, variantIndex)
  })
}

export function loadStoredVariantSelections(sessionId: string): VariantSelectionMap {
  const sid = sessionId.trim()
  if (!sid || typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(getVariantSelectionStorageKey(sid))
    if (!raw) return {}
    return sanitizeVariantSelections(JSON.parse(raw))
  } catch {
    return {}
  }
}

export function persistStoredVariantSelection(
  sessionId: string,
  variantGroupId: string,
  variantIndex: number,
): void {
  const sid = sessionId.trim()
  const groupId = variantGroupId.trim()
  if (!sid || !groupId || !Number.isInteger(variantIndex) || variantIndex < 0 || typeof window === 'undefined') {
    return
  }

  const nextSelections = {
    ...loadStoredVariantSelections(sid),
    [groupId]: variantIndex,
  }

  try {
    window.localStorage.setItem(
      getVariantSelectionStorageKey(sid),
      JSON.stringify(nextSelections),
    )
  } catch {
    // ignore storage failures
  }
}

export function toConversationPayloadMessages(messages: AgentMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((item) => (item.type === 'user' || item.type === 'assistant') && item.content.trim())
    .map((item) => ({
      role: item.type === 'assistant' ? 'assistant' : 'user',
      content: item.content,
    }))
}

export function buildRegenerateContextMessages(
  messages: AgentMessage[],
  targetMessageId: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const targetIndex = messages.findIndex((message) => message.id === targetMessageId)
  if (targetIndex <= 0) return []

  return messages
    .slice(0, targetIndex)
    .filter((item) => (item.type === 'user' || item.type === 'assistant') && item.content.trim())
    .map((item) => ({
      role: item.type === 'assistant' ? 'assistant' : 'user',
      content: item.content,
    }))
}

export function getLatestRegeneratableMessageId(messages: AgentMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (
      message.type === 'assistant'
      && message.meta?.sessionMode === 'converse'
      && message.meta?.messageKind === 'assistant_reply'
      && message.meta?.capabilities?.canRegenerate
    ) {
      return message.id
    }
  }
  return null
}
