/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     QQ Bot 模块入口                                      ║
 * ║                                                                        ║
 * ║  职责：用户状态管理、WebSocket 生命周期、事件分发                        ║
 * ║  设计：参考飞书 Bot 架构                                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { AvailableIntentsEventsEnum } from 'qq-bot-sdk'
import { createQQClient, createQQWsClient } from './client.js'
import { loadQQConfig } from './config.js'
import type { QQConfig } from './config.js'
import { handleQQMessage } from './handler.js'
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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     用户状态管理                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */

const userStates = new Map<string, RemoteUserState>()
const MAX_CONVERSE_MESSAGES = 40
const STATE_FILE_PATH = join(DATA_DIR, 'qq', 'user-states.json')

function normalizeQqStateKey(rawKey: string): string {
  return rawKey.split('@@', 1)[0]?.trim() || rawKey.trim()
}

function loadPersistedStates(): void {
  try {
    if (!existsSync(STATE_FILE_PATH)) return
    const raw = readFileSync(STATE_FILE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    for (const [key, value] of Object.entries(parsed || {})) {
      userStates.set(
        normalizeQqStateKey(key),
        normalizeRemoteUserState(value, MAX_CONVERSE_MESSAGES),
      )
    }
  } catch (error) {
    console.warn('[QQ] failed to load persisted user states:', error)
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
    console.warn('[QQ] failed to persist user states:', error)
  }
}

loadPersistedStates()

/**
 * 构建用户状态 key
 * 当前仅支持 C2C 私聊，必须按 userId 维度稳定建 key；
 * 否则 channel_id / guild_id 漂移时会把同一用户拆成多个上下文。
 */
export function buildUserStateKey(userId: string, _guildId?: string, _channelId?: string, _groupId?: string): string {
  return normalizeQqStateKey(userId)
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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     WebSocket 生命周期管理                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */

let wsClient: any | null = null
let currentConfig: QQConfig | null = null

function isSameConfig(a: QQConfig | null, b: QQConfig | null): boolean {
  if (!a || !b) return false
  if (a.appId !== b.appId) return false
  if ((a.token || '') !== (b.token || '')) return false
  if ((a.secret || '') !== (b.secret || '')) return false
  if (a.sandbox !== b.sandbox) return false
  if (a.requireAllowlist !== b.requireAllowlist) return false
  if (a.botName !== b.botName) return false
  if (a.defaultSkillId !== b.defaultSkillId) return false
  if (a.allowUsers.length !== b.allowUsers.length) return false
  for (let i = 0; i < a.allowUsers.length; i++) {
    if (a.allowUsers[i] !== b.allowUsers[i]) return false
  }
  return true
}

export function isQQEnabled(): boolean {
  return loadQQConfig() !== null
}

export function isQQRunning(): boolean {
  return wsClient !== null
}

export async function startQQBot(): Promise<void> {
  const config = loadQQConfig()
  if (!config) {
    console.log('[QQ] Bot disabled or missing required config')
    if (wsClient) {
      stopQQBot()
    }
    return
  }

  if (wsClient) {
    if (isSameConfig(currentConfig, config)) {
      console.log('[QQ] Bot is already running')
      return
    }
    await restartQQBot('configuration changed')
    return
  }

  if (!config.requireAllowlist && config.allowUsers.length === 0) {
    console.warn('[QQ] QQ_ALLOW_USERS is empty. Any QQ user can trigger tasks.')
  }
  if (config.requireAllowlist && config.allowUsers.length === 0) {
    throw new Error(
      'QQ_REQUIRE_ALLOWLIST=true but QQ_ALLOW_USERS is empty. Refusing to start QQ bot.',
    )
  }

  const qqClient = createQQClient(config)
  const candidateWsClient = createQQWsClient(config)

  // 仅保留 C2C 私聊事件
  candidateWsClient.on(AvailableIntentsEventsEnum.GROUP_AND_C2C_EVENT, async (data: any) => {
    try {
      if (data?.eventType === 'C2C_MESSAGE_CREATE') {
        await handleQQMessage(qqClient, data, config, 'c2c')
        return
      }
      console.debug(`[QQ] Ignore non-C2C event: ${String(data?.eventType || 'unknown')}`)
    } catch (err) {
      console.error('[QQ] C2C message handler error:', err)
    }
  })

  // 连接就绪事件
  candidateWsClient.on('READY', () => {
    console.log('[QQ] Bot connected and ready')
  })

  // 错误事件
  candidateWsClient.on('ERROR', (error: unknown) => {
    console.error('[QQ] WebSocket error:', error)
  })

  // 断开连接事件
  candidateWsClient.on('DISCONNECT', () => {
    console.log('[QQ] Bot disconnected')
  })

  currentConfig = config
  wsClient = candidateWsClient
  console.log('[QQ] Bot started')
}

export async function restartQQBot(reason = 'manual restart'): Promise<void> {
  if (wsClient) {
    console.log(`[QQ] Restarting bot: ${reason}`)
    stopQQBot()
  }
  await startQQBot()
}

export function stopQQBot(): void {
  if (!wsClient) return
  try {
    wsClient.disconnect()
  } catch (err) {
    console.warn('[QQ] Failed to disconnect websocket client:', err)
  }
  wsClient = null
  currentConfig = null
  console.log('[QQ] Bot stopped')
}
