import * as Lark from '@larksuiteoapi/node-sdk'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { createLarkClient, createLarkWsClient } from './client.js'
import { loadFeishuConfig } from './config.js'
import type { FeishuConfig } from './config.js'
import { handleFeishuMessage } from './handler.js'
import { DATA_DIR } from '../paths.js'
import {
  type RemoteConversationOwnerMode,
  type RemoteUserState,
  activateRemoteConverse,
  activateRemoteSkill,
  appendRemoteConverseMessage,
  clearRemoteExecuteSession,
  createRemoteUserState,
  markRemoteSkillAwaitingInput,
  markRemoteSkillRoundSettled,
  normalizeRemoteUserState,
  setRemoteConverseSessionId,
  setRemoteExecuteSessionId,
} from '../remote-session-state.js'

const userStates = new Map<string, RemoteUserState>()
const MAX_CONVERSE_MESSAGES = 40
const STATE_FILE_PATH = join(DATA_DIR, 'feishu', 'user-states.json')

function loadPersistedStates(): void {
  try {
    if (!existsSync(STATE_FILE_PATH)) return
    const raw = readFileSync(STATE_FILE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    for (const [key, value] of Object.entries(parsed || {})) {
      userStates.set(key, normalizeRemoteUserState(value, MAX_CONVERSE_MESSAGES))
    }
  } catch (error) {
    console.warn('[Feishu] failed to load persisted user states:', error)
  }
}

function persistStates(): void {
  try {
    mkdirSync(dirname(STATE_FILE_PATH), { recursive: true })
    const plain: Record<string, RemoteUserState> = {}
    for (const [key, value] of userStates.entries()) {
      plain[key] = {
        converseSessionId: value.converseSessionId,
        executeSessionId: value.executeSessionId,
        defaultModelProfileId: value.defaultModelProfileId,
        activeMode: value.activeMode,
        activeSkillId: value.activeSkillId,
        activeSessionId: value.activeSessionId,
        executeAwaitingInput: value.executeAwaitingInput,
        executeLastPrompt: value.executeLastPrompt,
        converseMessages: value.converseMessages.slice(-MAX_CONVERSE_MESSAGES),
      }
    }
    writeFileSync(STATE_FILE_PATH, JSON.stringify(plain, null, 2), 'utf-8')
  } catch (error) {
    console.warn('[Feishu] failed to persist user states:', error)
  }
}

loadPersistedStates()

export function buildUserStateKey(openId: string, chatId: string): string {
  return `${openId.trim()}@@${chatId.trim()}`
}

export function getUserState(stateKey: string): RemoteUserState {
  let state = userStates.get(stateKey)
  if (!state) {
    state = createRemoteUserState()
    userStates.set(stateKey, state)
    persistStates()
  }
  return state
}

export function appendConverseMessage(stateKey: string, role: string, content: string): void {
  const state = getUserState(stateKey)
  appendRemoteConverseMessage(state, role, content, MAX_CONVERSE_MESSAGES)
  persistStates()
}

export function setConverseSessionId(stateKey: string, sessionId: string): void {
  setRemoteConverseSessionId(getUserState(stateKey), sessionId)
  persistStates()
}

export function setExecuteSessionId(stateKey: string, sessionId: string): void {
  setRemoteExecuteSessionId(getUserState(stateKey), sessionId)
  persistStates()
}

export function clearExecuteSessionId(stateKey: string): void {
  clearRemoteExecuteSession(getUserState(stateKey))
  persistStates()
}

export function resetUser(stateKey: string): void {
  userStates.delete(stateKey)
  persistStates()
}

export function setDefaultModelProfileId(stateKey: string, profileId: string | undefined): void {
  getUserState(stateKey).defaultModelProfileId = profileId
  persistStates()
}

export function getDefaultModelProfileId(stateKey: string): string | undefined {
  return getUserState(stateKey).defaultModelProfileId
}

export function activateConverseOwner(stateKey: string): void {
  activateRemoteConverse(getUserState(stateKey))
  persistStates()
}

export function activateSkillOwner(stateKey: string, skillId: string, sessionId: string): void {
  activateRemoteSkill(getUserState(stateKey), skillId, sessionId)
  persistStates()
}

export function markSkillAwaitingInput(stateKey: string, prompt?: string): void {
  markRemoteSkillAwaitingInput(getUserState(stateKey), prompt)
  persistStates()
}

export function markSkillRoundSettled(stateKey: string, prompt?: string): void {
  markRemoteSkillRoundSettled(getUserState(stateKey), prompt)
  persistStates()
}

export function clearExecuteSessionKeepingOwner(stateKey: string): void {
  clearRemoteExecuteSession(getUserState(stateKey), { keepSkillOwner: true })
  persistStates()
}

export function getActiveMode(stateKey: string): RemoteConversationOwnerMode {
  return getUserState(stateKey).activeMode || 'idle'
}

let wsClient: Lark.WSClient | null = null
let currentConfig: FeishuConfig | null = null

function isSameConfig(a: FeishuConfig | null, b: FeishuConfig | null): boolean {
  if (!a || !b) return false
  if (a.appId !== b.appId) return false
  if (a.appSecret !== b.appSecret) return false
  if (a.domain !== b.domain) return false
  if (a.requireAllowlist !== b.requireAllowlist) return false
  if (a.botName !== b.botName) return false
  if (a.defaultSkillId !== b.defaultSkillId) return false
  if (a.allowUsers.length !== b.allowUsers.length) return false
  for (let i = 0; i < a.allowUsers.length; i++) {
    if (a.allowUsers[i] !== b.allowUsers[i]) return false
  }
  return true
}

export function isFeishuEnabled(): boolean {
  return loadFeishuConfig() !== null
}

export function isFeishuRunning(): boolean {
  return wsClient !== null
}

export async function startFeishuBot(): Promise<void> {
  const config = loadFeishuConfig()
  if (!config) {
    console.log('[Feishu] Bot disabled or missing required config')
    if (wsClient) {
      stopFeishuBot()
    }
    return
  }

  if (wsClient) {
    if (isSameConfig(currentConfig, config)) {
      console.log('[Feishu] Bot is already running')
      return
    }
    await restartFeishuBot('configuration changed')
    return
  }

  if (!config.requireAllowlist && config.allowUsers.length === 0) {
    console.warn('[Feishu] FEISHU_ALLOW_USERS is empty. Any Feishu user can trigger tasks.')
  }
  if (config.requireAllowlist && config.allowUsers.length === 0) {
    throw new Error(
      'FEISHU_REQUIRE_ALLOWLIST=true but FEISHU_ALLOW_USERS is empty. Refusing to start Feishu bot.',
    )
  }

  const larkClient = createLarkClient(config)

  const dispatcher = new Lark.EventDispatcher({}).register({
    'im.message.receive_v1': async (data: unknown) => {
      try {
        await handleFeishuMessage(larkClient, data, config)
      } catch (err) {
        console.error('[Feishu] Message handler error:', err)
      }
    },
  })

  const candidateWsClient = createLarkWsClient(config)
  try {
    await candidateWsClient.start({ eventDispatcher: dispatcher })
  } catch (err) {
    try {
      candidateWsClient.close({ force: true })
    } catch {
    }
    throw err
  }

  currentConfig = config
  wsClient = candidateWsClient
  console.log('[Feishu] Bot started')
}

export async function restartFeishuBot(reason = 'manual restart'): Promise<void> {
  if (wsClient) {
    console.log(`[Feishu] Restarting bot: ${reason}`)
    stopFeishuBot()
  }
  await startFeishuBot()
}

export function stopFeishuBot(): void {
  if (!wsClient) return
  try {
    wsClient.close({ force: true })
  } catch (err) {
    console.warn('[Feishu] Failed to close websocket client:', err)
  }
  wsClient = null
  currentConfig = null
  console.log('[Feishu] Bot stopped')
}
