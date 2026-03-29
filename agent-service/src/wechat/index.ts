import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import {
  deleteWechatAccount,
  getActiveWechatAccount,
  getWechatSyncBufPath,
  getWechatUserStatesPath,
  isWechatEnabled,
  loadWechatConfig,
  normalizeWechatAccountId,
  type WechatConfig,
} from './config.js'
import { hasActiveWechatLoginSession } from './qr-login.js'
import { getWechatUpdates, type WechatGetUpdatesResponse } from './api.js'
import { handleWechatMessage } from './handler.js'
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
} from '../remote-session-state.js'

const userStates = new Map<string, RemoteUserState>()
const MAX_CONVERSE_MESSAGES = 40
const MAX_CONSECUTIVE_FAILURES = 3
const RETRY_DELAY_MS = 2_000
const BACKOFF_DELAY_MS = 30_000

let pollAbortController: AbortController | null = null
let pollingPromise: Promise<void> | null = null
let currentConfig: WechatConfig | null = null
let lastError: string | null = null
let lastEventAt: number | null = null
let lastInboundAt: number | null = null

export interface WechatPublicAccount {
  accountId: string
  rawAccountId: string
  userId?: string
  savedAt: string
}

export interface WechatRuntimeStatus {
  enabled: boolean
  running: boolean
  loggedIn: boolean
  credentialSource: 'env' | 'file' | null
  loginPending: boolean
  account: WechatPublicAccount | null
  lastError?: string | null
  lastEventAt?: number | null
  lastInboundAt?: number | null
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) return null
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T
  } catch {
    return null
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8')
}

function getWechatStateFilePath(): string {
  return getWechatUserStatesPath()
}

function toPublicAccount(account: {
  accountId: string
  rawAccountId: string
  userId?: string
  savedAt: string
} | null): WechatPublicAccount | null {
  if (!account) return null
  return {
    accountId: account.accountId,
    rawAccountId: account.rawAccountId,
    userId: account.userId,
    savedAt: account.savedAt,
  }
}

function loadPersistedStates(): void {
  try {
    const parsed = readJsonFile<Record<string, unknown>>(getWechatStateFilePath())
    if (!parsed) return

    for (const [key, value] of Object.entries(parsed)) {
      userStates.set(key.trim(), normalizeRemoteUserState(value, MAX_CONVERSE_MESSAGES))
    }
  } catch (error) {
    console.warn('[WeChat] failed to load persisted user states:', error)
  }
}

function persistStates(): void {
  try {
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
    writeJsonFile(getWechatStateFilePath(), plain)
  } catch (error) {
    console.warn('[WeChat] failed to persist user states:', error)
  }
}

loadPersistedStates()

function isSameConfig(a: WechatConfig | null, b: WechatConfig | null): boolean {
  if (!a || !b) return false
  if (a.token !== b.token) return false
  if (a.baseUrl !== b.baseUrl) return false
  if (a.cdnBaseUrl !== b.cdnBaseUrl) return false
  if (a.requireAllowlist !== b.requireAllowlist) return false
  if (a.botName !== b.botName) return false
  if (a.defaultSkillId !== b.defaultSkillId) return false
  if (a.pollTimeoutMs !== b.pollTimeoutMs) return false
  if (a.textChunkLimit !== b.textChunkLimit) return false
  if ((a.accountId || '') !== (b.accountId || '')) return false
  if (a.allowUsers.length !== b.allowUsers.length) return false
  for (let index = 0; index < a.allowUsers.length; index += 1) {
    if (a.allowUsers[index] !== b.allowUsers[index]) return false
  }
  return true
}

function getRuntimeAccountId(config: WechatConfig): string {
  const rawAccountId = (config.accountId || '').trim()
  if (rawAccountId) return normalizeWechatAccountId(rawAccountId) || rawAccountId
  return 'env-token'
}

function loadSyncBuf(accountId: string): string {
  const parsed = readJsonFile<{ get_updates_buf?: string }>(getWechatSyncBufPath(accountId))
  return typeof parsed?.get_updates_buf === 'string' ? parsed.get_updates_buf : ''
}

function saveSyncBuf(accountId: string, getUpdatesBuf: string): void {
  writeJsonFile(getWechatSyncBufPath(accountId), {
    get_updates_buf: getUpdatesBuf,
  })
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('aborted'))
    }, { once: true })
  })
}

async function pollWechatLoop(config: WechatConfig, signal: AbortSignal): Promise<void> {
  const runtimeAccountId = getRuntimeAccountId(config)
  let getUpdatesBuf = loadSyncBuf(runtimeAccountId)
  let nextTimeoutMs = config.pollTimeoutMs
  let consecutiveFailures = 0

  while (!signal.aborted) {
    try {
      const response: WechatGetUpdatesResponse = await getWechatUpdates({
        baseUrl: config.baseUrl,
        token: config.token,
        getUpdatesBuf,
        timeoutMs: nextTimeoutMs,
        signal,
      })

      lastEventAt = Date.now()
      lastError = null
      consecutiveFailures = 0

      if (typeof response.longpolling_timeout_ms === 'number' && response.longpolling_timeout_ms > 0) {
        nextTimeoutMs = response.longpolling_timeout_ms
      }

      const hasApiError = (
        (typeof response.ret === 'number' && response.ret !== 0)
        || (typeof response.errcode === 'number' && response.errcode !== 0)
      )

      if (hasApiError) {
        const message = response.errmsg || `ret=${response.ret ?? 'unknown'} errcode=${response.errcode ?? 'unknown'}`
        throw new Error(message)
      }

      if (typeof response.get_updates_buf === 'string' && response.get_updates_buf) {
        getUpdatesBuf = response.get_updates_buf
        saveSyncBuf(runtimeAccountId, getUpdatesBuf)
      }

      const messages = Array.isArray(response.msgs) ? response.msgs : []
      for (const message of messages) {
        if (signal.aborted) return
        lastInboundAt = Date.now()
        try {
          await handleWechatMessage(config, message)
        } catch (error) {
          console.error('[WeChat] failed to handle message:', error)
        }
      }
    } catch (error) {
      if (signal.aborted) return

      const message = error instanceof Error ? error.message : String(error)
      lastError = message
      consecutiveFailures += 1
      console.error(`[WeChat] polling error (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`, error)

      try {
        await sleep(consecutiveFailures >= MAX_CONSECUTIVE_FAILURES ? BACKOFF_DELAY_MS : RETRY_DELAY_MS, signal)
      } catch {
        return
      }

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        consecutiveFailures = 0
      }
    }
  }
}

export function buildUserStateKey(accountId: string, fromUserId: string): string {
  const normalizedAccountId = normalizeWechatAccountId(accountId)
  const normalizedUserId = fromUserId.trim()
  return normalizedAccountId ? `${normalizedAccountId}@@${normalizedUserId}` : normalizedUserId
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
  appendRemoteConverseMessage(getUserState(stateKey), role, content, MAX_CONVERSE_MESSAGES)
  persistStates()
}

export function setConverseSessionId(stateKey: string, sessionId: string): void {
  setRemoteConverseSessionId(getUserState(stateKey), sessionId)
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

export function getActiveMode(stateKey: string): RemoteConversationOwnerMode {
  return getUserState(stateKey).activeMode || 'idle'
}

export function isWechatRunning(): boolean {
  return pollAbortController !== null
}

export function getWechatRuntimeStatus(): WechatRuntimeStatus {
  const config = loadWechatConfig()
  return {
    enabled: isWechatEnabled(),
    running: isWechatRunning(),
    loggedIn: Boolean(config),
    credentialSource: config?.credentialSource || null,
    loginPending: hasActiveWechatLoginSession(),
    account: toPublicAccount(getActiveWechatAccount()),
    lastError,
    lastEventAt,
    lastInboundAt,
  }
}

export async function startWechatBot(): Promise<void> {
  const config = loadWechatConfig()
  if (!config) {
    console.log('[WeChat] Bot disabled or missing required config')
    if (pollAbortController) {
      stopWechatBot()
    }
    return
  }

  if (!config.requireAllowlist && config.allowUsers.length === 0) {
    console.warn('[WeChat] WECHAT_ALLOW_USERS is empty. Any WeChat user can trigger tasks.')
  }
  if (config.requireAllowlist && config.allowUsers.length === 0) {
    throw new Error('WECHAT_REQUIRE_ALLOWLIST=true but WECHAT_ALLOW_USERS is empty. Refusing to start WeChat bot.')
  }

  if (pollAbortController) {
    if (isSameConfig(currentConfig, config)) {
      console.log('[WeChat] Bot is already running')
      return
    }
    await restartWechatBot('configuration changed')
    return
  }

  const controller = new AbortController()
  pollAbortController = controller
  currentConfig = config
  lastError = null

  const loopPromise = pollWechatLoop(config, controller.signal)
    .catch((error) => {
      if (!controller.signal.aborted) {
        lastError = error instanceof Error ? error.message : String(error)
        console.error('[WeChat] polling loop exited with error:', error)
      }
    })
    .finally(() => {
      if (pollAbortController === controller) {
        pollAbortController = null
      }
      if (currentConfig === config) {
        currentConfig = null
      }
      if (pollingPromise === loopPromise) {
        pollingPromise = null
      }
    })
  pollingPromise = loopPromise

  console.log('[WeChat] Bot started')
}

export async function restartWechatBot(reason = 'manual restart'): Promise<void> {
  const previous = pollingPromise
  if (pollAbortController) {
    console.log(`[WeChat] Restarting bot: ${reason}`)
    stopWechatBot()
  }
  if (previous) {
    try {
      await previous
    } catch {
    }
  }
  await startWechatBot()
}

export function stopWechatBot(): void {
  if (!pollAbortController) return
  pollAbortController.abort()
  pollAbortController = null
  currentConfig = null
  console.log('[WeChat] Bot stopped')
}

export async function testWechatConfig(): Promise<{ success: boolean; message: string }> {
  if (!isWechatEnabled()) {
    return {
      success: false,
      message: '微信未启用，请先配置 WECHAT_ENABLED=true。',
    }
  }

  const config = loadWechatConfig()
  if (!config) {
    return {
      success: false,
      message: '微信已启用，但当前没有可用凭据。请先扫码绑定微信或填写 WECHAT_BOT_TOKEN。',
    }
  }

  try {
    if (!isWechatRunning()) {
      await startWechatBot()
    }
    return {
      success: true,
      message: isWechatRunning()
        ? '微信 Bot 已启动，长轮询正在运行。'
        : '微信配置有效，但轮询尚未启动。',
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export function logoutWechatAccount(): { success: boolean; message: string } {
  const config = loadWechatConfig()
  if (!config) {
    return {
      success: false,
      message: '当前没有已登录的微信账号。',
    }
  }

  if (config.credentialSource === 'env') {
    return {
      success: false,
      message: '当前使用的是环境变量 WECHAT_BOT_TOKEN，无法通过 UI 退出，请先清除该配置。',
    }
  }

  const activeAccount = getActiveWechatAccount()
  if (!activeAccount) {
    return {
      success: false,
      message: '当前没有活动中的微信账号。',
    }
  }

  deleteWechatAccount(activeAccount.accountId)
  stopWechatBot()

  return {
    success: true,
    message: '已退出当前微信账号，并停止微信轮询。',
  }
}
