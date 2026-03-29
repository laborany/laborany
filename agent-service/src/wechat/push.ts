import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import {
  getWechatContextTokensPath,
  getWechatPendingPushesPath,
  type WechatConfig,
} from './config.js'
import { sendWechatTextMessage } from './api.js'

const CONTEXT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PENDING_PUSH_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_PENDING_PUSHES_PER_USER = 10

interface StoredContextToken {
  contextToken: string
  updatedAt: number
}

type StoredContextTokenMap = Record<string, StoredContextToken>

interface PendingWechatPush {
  text: string
  createdAt: number
}

type PendingWechatPushMap = Record<string, PendingWechatPush[]>

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

function buildContextTokenKey(accountId: string, fromUserId: string): string {
  return `${accountId}@@${fromUserId}`
}

function loadContextTokenMap(): StoredContextTokenMap {
  const parsed = readJsonFile<StoredContextTokenMap>(getWechatContextTokensPath())
  return parsed && typeof parsed === 'object' ? parsed : {}
}

function saveContextTokenMap(map: StoredContextTokenMap): void {
  writeJsonFile(getWechatContextTokensPath(), map)
}

function loadPendingPushMap(): PendingWechatPushMap {
  const parsed = readJsonFile<PendingWechatPushMap>(getWechatPendingPushesPath())
  return parsed && typeof parsed === 'object' ? parsed : {}
}

function savePendingPushMap(map: PendingWechatPushMap): void {
  writeJsonFile(getWechatPendingPushesPath(), map)
}

function prunePendingPushMap(map: PendingWechatPushMap): void {
  const now = Date.now()
  for (const [key, items] of Object.entries(map)) {
    if (!Array.isArray(items)) {
      delete map[key]
      continue
    }

    const filtered = items.filter((item) => {
      const createdAt = Number(item?.createdAt || 0)
      const text = typeof item?.text === 'string' ? item.text.trim() : ''
      return Boolean(text) && Number.isFinite(createdAt) && now - createdAt <= PENDING_PUSH_TTL_MS
    })

    if (filtered.length === 0) {
      delete map[key]
      continue
    }

    map[key] = filtered.slice(-MAX_PENDING_PUSHES_PER_USER)
  }
}

export function rememberWechatContextToken(accountId: string, fromUserId: string, contextToken: string): void {
  const normalizedAccountId = accountId.trim()
  const normalizedUserId = fromUserId.trim()
  const normalizedToken = contextToken.trim()
  if (!normalizedAccountId || !normalizedUserId || !normalizedToken) return

  const key = buildContextTokenKey(normalizedAccountId, normalizedUserId)
  const store = loadContextTokenMap()
  const now = Date.now()

  for (const [candidateKey, value] of Object.entries(store)) {
    if (!value || typeof value !== 'object') {
      delete store[candidateKey]
      continue
    }
    const updatedAt = Number(value.updatedAt || 0)
    if (!Number.isFinite(updatedAt) || now - updatedAt > CONTEXT_TOKEN_TTL_MS) {
      delete store[candidateKey]
    }
  }

  store[key] = {
    contextToken: normalizedToken,
    updatedAt: now,
  }
  saveContextTokenMap(store)
}

export function getWechatContextToken(accountId: string, fromUserId: string): string | null {
  const key = buildContextTokenKey(accountId.trim(), fromUserId.trim())
  if (!key.trim()) return null

  const store = loadContextTokenMap()
  const record = store[key]
  if (!record) return null

  const updatedAt = Number(record.updatedAt || 0)
  if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > CONTEXT_TOKEN_TTL_MS) {
    delete store[key]
    saveContextTokenMap(store)
    return null
  }

  return typeof record.contextToken === 'string' && record.contextToken.trim()
    ? record.contextToken.trim()
    : null
}

export function queueWechatPendingText(accountId: string, fromUserId: string, text: string): void {
  const normalizedAccountId = accountId.trim()
  const normalizedUserId = fromUserId.trim()
  const normalizedText = text.trim()
  if (!normalizedAccountId || !normalizedUserId || !normalizedText) return

  const key = buildContextTokenKey(normalizedAccountId, normalizedUserId)
  const store = loadPendingPushMap()
  prunePendingPushMap(store)

  const nextItems = Array.isArray(store[key]) ? store[key] : []
  nextItems.push({
    text: normalizedText,
    createdAt: Date.now(),
  })

  store[key] = nextItems.slice(-MAX_PENDING_PUSHES_PER_USER)
  savePendingPushMap(store)
}

export async function flushWechatPendingTexts(
  config: WechatConfig,
  toUserId: string,
  options?: {
    accountId?: string
    contextToken?: string
  },
): Promise<number> {
  const normalizedTargetId = toUserId.trim()
  const accountId = (options?.accountId || config.accountId || 'env-token').trim()
  if (!normalizedTargetId || !accountId) return 0

  const key = buildContextTokenKey(accountId, normalizedTargetId)
  const store = loadPendingPushMap()
  prunePendingPushMap(store)

  const items = Array.isArray(store[key]) ? store[key] : []
  if (items.length === 0) {
    savePendingPushMap(store)
    return 0
  }

  const summary = items.length === 1
    ? `补发通知：\n\n${items[0].text}`
    : [
        `补发通知：你离线期间有 ${items.length} 条未送达消息。`,
        ...items.map((item, index) => `【${index + 1}】\n${item.text}`),
      ].join('\n\n')

  await sendWechatTextChunks(config, normalizedTargetId, summary, {
    accountId,
    contextToken: options?.contextToken,
  })

  delete store[key]
  savePendingPushMap(store)
  return items.length
}

function splitTextIntoChunks(text: string, maxLen: number): string[] {
  const normalized = text.trim()
  if (!normalized) return []
  if (normalized.length <= maxLen) return [normalized]

  const chunks: string[] = []
  let remaining = normalized

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining)
      break
    }

    let splitIndex = remaining.lastIndexOf('\n', maxLen)
    if (splitIndex < Math.floor(maxLen * 0.4)) {
      splitIndex = maxLen
    }

    chunks.push(remaining.slice(0, splitIndex).trim())
    remaining = remaining.slice(splitIndex).trim()
  }

  return chunks.filter(Boolean)
}

export async function sendWechatTextChunks(
  config: WechatConfig,
  toUserId: string,
  text: string,
  options?: {
    accountId?: string
    contextToken?: string
  },
): Promise<void> {
  const normalizedTargetId = toUserId.trim()
  if (!normalizedTargetId) {
    throw new Error('缺少微信目标用户 ID')
  }

  const contextToken = options?.contextToken?.trim()
    || (options?.accountId ? getWechatContextToken(options.accountId, normalizedTargetId) : null)

  if (!contextToken) {
    throw new Error('当前没有可用的微信 context_token，无法发送回复')
  }

  const chunks = splitTextIntoChunks(text, config.textChunkLimit)
  if (!chunks.length) return

  for (const chunk of chunks) {
    await sendWechatTextMessage({
      baseUrl: config.baseUrl,
      token: config.token,
      toUserId: normalizedTargetId,
      contextToken,
      text: chunk,
    })
  }
}
