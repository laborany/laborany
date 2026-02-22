import * as Lark from '@larksuiteoapi/node-sdk'
import { createLarkClient, createLarkWsClient } from './client.js'
import { loadFeishuConfig } from './config.js'
import type { FeishuConfig } from './config.js'
import { handleFeishuMessage } from './handler.js'

interface UserState {
  converseSessionId?: string
  executeSessionId?: string
  converseMessages: Array<{ role: string; content: string }>
}

const userStates = new Map<string, UserState>()
const MAX_CONVERSE_MESSAGES = 40

export function getUserState(openId: string): UserState {
  let state = userStates.get(openId)
  if (!state) {
    state = { converseMessages: [] }
    userStates.set(openId, state)
  }
  return state
}

export function appendConverseMessage(openId: string, role: string, content: string): void {
  const state = getUserState(openId)
  state.converseMessages.push({ role, content })
  if (state.converseMessages.length > MAX_CONVERSE_MESSAGES) {
    state.converseMessages.splice(0, state.converseMessages.length - MAX_CONVERSE_MESSAGES)
  }
}

export function setConverseSessionId(openId: string, sessionId: string): void {
  getUserState(openId).converseSessionId = sessionId
}

export function setExecuteSessionId(openId: string, sessionId: string): void {
  getUserState(openId).executeSessionId = sessionId
}

export function clearExecuteSessionId(openId: string): void {
  getUserState(openId).executeSessionId = undefined
}

export function resetUser(openId: string): void {
  userStates.delete(openId)
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
