export type RemoteConversationOwnerMode = 'idle' | 'converse' | 'skill'

export interface RemoteUserState {
  converseSessionId?: string
  executeSessionId?: string
  converseMessages: Array<{ role: string; content: string }>
  defaultModelProfileId?: string
  activeMode?: RemoteConversationOwnerMode
  activeSkillId?: string
  activeSessionId?: string
  executeAwaitingInput?: boolean
  executeLastPrompt?: string
}

function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeActiveMode(
  rawMode: unknown,
  activeSkillId: string | undefined,
  executeSessionId: string | undefined,
  converseSessionId: string | undefined,
): RemoteConversationOwnerMode {
  if (rawMode === 'idle' || rawMode === 'converse' || rawMode === 'skill') {
    return rawMode
  }
  if (activeSkillId || executeSessionId) return 'skill'
  if (converseSessionId) return 'converse'
  return 'idle'
}

export function createRemoteUserState(): RemoteUserState {
  return {
    converseMessages: [],
    activeMode: 'idle',
    executeAwaitingInput: false,
  }
}

export function normalizeRemoteUserState(value: unknown, maxConverseMessages: number): RemoteUserState {
  if (!value || typeof value !== 'object') {
    return createRemoteUserState()
  }

  const raw = value as Record<string, unknown>
  const converseMessages = Array.isArray(raw.converseMessages)
    ? raw.converseMessages
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        role: trimOptionalString((item as Record<string, unknown>).role) || 'user',
        content: trimOptionalString((item as Record<string, unknown>).content) || '',
      }))
      .filter((item) => item.content)
      .slice(-maxConverseMessages)
    : []

  const converseSessionId = trimOptionalString(raw.converseSessionId)
  const executeSessionId = trimOptionalString(raw.executeSessionId)
  const activeSkillId = trimOptionalString(raw.activeSkillId)
  const activeMode = normalizeActiveMode(raw.activeMode, activeSkillId, executeSessionId, converseSessionId)
  const activeSessionId = trimOptionalString(raw.activeSessionId)
    || (activeMode === 'skill' ? executeSessionId : converseSessionId)

  return {
    converseSessionId,
    executeSessionId,
    converseMessages,
    defaultModelProfileId: trimOptionalString(raw.defaultModelProfileId),
    activeMode,
    activeSkillId: activeMode === 'skill' ? activeSkillId : undefined,
    activeSessionId,
    executeAwaitingInput: Boolean(raw.executeAwaitingInput && activeMode === 'skill' && executeSessionId),
    executeLastPrompt: activeMode === 'skill' ? trimOptionalString(raw.executeLastPrompt) : undefined,
  }
}

export function appendRemoteConverseMessage(
  state: RemoteUserState,
  role: string,
  content: string,
  maxConverseMessages: number,
): void {
  const text = content.trim()
  if (!text) return
  state.converseMessages.push({ role, content: text })
  if (state.converseMessages.length > maxConverseMessages) {
    state.converseMessages.splice(0, state.converseMessages.length - maxConverseMessages)
  }
}

export function setRemoteConverseSessionId(
  state: RemoteUserState,
  sessionId: string,
  options: { activate?: boolean } = {},
): void {
  state.converseSessionId = sessionId
  if (options.activate || state.activeMode === 'converse') {
    activateRemoteConverse(state)
  }
}

export function activateRemoteConverse(state: RemoteUserState): void {
  state.activeMode = state.converseSessionId ? 'converse' : 'idle'
  state.activeSkillId = undefined
  state.activeSessionId = state.converseSessionId
  state.executeSessionId = undefined
  state.executeAwaitingInput = false
  state.executeLastPrompt = undefined
}

export function activateRemoteSkill(
  state: RemoteUserState,
  skillId: string,
  sessionId: string,
): void {
  state.activeMode = 'skill'
  state.activeSkillId = skillId
  state.executeSessionId = sessionId
  state.activeSessionId = sessionId
  state.executeAwaitingInput = false
  state.executeLastPrompt = undefined
}

export function setRemoteExecuteSessionId(state: RemoteUserState, sessionId: string): void {
  state.executeSessionId = sessionId
  if (state.activeMode === 'skill') {
    state.activeSessionId = sessionId
  }
}

export function markRemoteSkillAwaitingInput(state: RemoteUserState, prompt?: string): void {
  if (state.executeSessionId && state.activeMode !== 'skill') {
    state.activeMode = 'skill'
    state.activeSessionId = state.executeSessionId
  }
  state.executeAwaitingInput = Boolean(state.executeSessionId)
  state.executeLastPrompt = trimOptionalString(prompt)
}

export function markRemoteSkillRoundSettled(state: RemoteUserState, prompt?: string): void {
  if (state.executeSessionId && state.activeMode === 'skill') {
    state.activeSessionId = state.executeSessionId
  }
  state.executeAwaitingInput = false
  state.executeLastPrompt = trimOptionalString(prompt)
}

export function clearRemoteExecuteSession(
  state: RemoteUserState,
  options: { keepSkillOwner?: boolean } = {},
): void {
  state.executeSessionId = undefined
  state.executeAwaitingInput = false
  state.executeLastPrompt = undefined

  if (options.keepSkillOwner && state.activeMode === 'skill') {
    state.activeSessionId = undefined
    return
  }

  if (state.converseSessionId) {
    state.activeMode = 'converse'
    state.activeSkillId = undefined
    state.activeSessionId = state.converseSessionId
    return
  }

  state.activeMode = 'idle'
  state.activeSkillId = undefined
  state.activeSessionId = undefined
}
