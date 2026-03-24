import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { DATA_DIR } from '../paths.js'

export const WECHAT_DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com'
export const WECHAT_DEFAULT_CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c'
const DEFAULT_POLL_TIMEOUT_MS = 35_000
const DEFAULT_TEXT_CHUNK_LIMIT = 1_000

export interface WechatStoredAccount {
  accountId: string
  rawAccountId: string
  userId?: string
  token: string
  baseUrl: string
  cdnBaseUrl: string
  savedAt: string
}

export interface WechatCredential {
  source: 'env' | 'file'
  token: string
  baseUrl: string
  cdnBaseUrl: string
  accountId?: string
  rawAccountId?: string
  userId?: string
  savedAt?: string
}

export interface WechatConfig {
  token: string
  baseUrl: string
  cdnBaseUrl: string
  allowUsers: string[]
  requireAllowlist: boolean
  botName: string
  defaultSkillId: string
  pollTimeoutMs: number
  textChunkLimit: number
  credentialSource: 'env' | 'file'
  accountId?: string
  rawAccountId?: string
  userId?: string
}

interface WechatActiveAccountRef {
  accountId: string
  updatedAt: string
}

function sanitizeBotName(name: string): string {
  const normalized = name
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\uFFFD/g, '')
    .trim()
  return normalized || 'LaborAny'
}

function parsePositiveInt(rawValue: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((rawValue || '').trim(), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
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

export function normalizeWechatAccountId(rawAccountId: string): string {
  const trimmed = rawAccountId.trim()
  if (!trimmed) return ''
  return trimmed
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

export function getWechatStateDir(): string {
  return join(DATA_DIR, 'wechat')
}

export function getWechatAccountsDir(): string {
  return join(getWechatStateDir(), 'accounts')
}

export function getWechatSyncBufDir(): string {
  return join(getWechatStateDir(), 'sync-bufs')
}

export function getWechatUserStatesPath(): string {
  return join(getWechatStateDir(), 'user-states.json')
}

export function getWechatContextTokensPath(): string {
  return join(getWechatStateDir(), 'context-tokens.json')
}

export function getWechatPendingPushesPath(): string {
  return join(getWechatStateDir(), 'pending-pushes.json')
}

export function getWechatActiveAccountPath(): string {
  return join(getWechatStateDir(), 'active-account.json')
}

export function getWechatAccountPath(accountId: string): string {
  return join(getWechatAccountsDir(), `${accountId}.json`)
}

export function getWechatSyncBufPath(accountId: string): string {
  return join(getWechatSyncBufDir(), `${accountId}.json`)
}

export function getWechatEffectiveBaseUrl(): string {
  return trimOptionalString(process.env.WECHAT_BASE_URL) || WECHAT_DEFAULT_BASE_URL
}

export function getWechatEffectiveCdnBaseUrl(): string {
  return trimOptionalString(process.env.WECHAT_CDN_BASE_URL) || WECHAT_DEFAULT_CDN_BASE_URL
}

export function loadWechatAccount(accountId: string): WechatStoredAccount | null {
  if (!accountId.trim()) return null
  const parsed = readJsonFile<Partial<WechatStoredAccount>>(getWechatAccountPath(accountId))
  if (!parsed) return null

  const normalizedAccountId = normalizeWechatAccountId(trimOptionalString(parsed.accountId) || accountId)
  const rawAccountId = trimOptionalString(parsed.rawAccountId)
  const token = trimOptionalString(parsed.token)
  if (!normalizedAccountId || !rawAccountId || !token) return null

  return {
    accountId: normalizedAccountId,
    rawAccountId,
    userId: trimOptionalString(parsed.userId),
    token,
    baseUrl: trimOptionalString(parsed.baseUrl) || getWechatEffectiveBaseUrl(),
    cdnBaseUrl: trimOptionalString(parsed.cdnBaseUrl) || getWechatEffectiveCdnBaseUrl(),
    savedAt: trimOptionalString(parsed.savedAt) || new Date().toISOString(),
  }
}

export function listWechatAccounts(): WechatStoredAccount[] {
  const dir = getWechatAccountsDir()
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .map(name => loadWechatAccount(name.replace(/\.json$/i, '')))
    .filter((item): item is WechatStoredAccount => Boolean(item))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export function loadActiveWechatAccountRef(): WechatActiveAccountRef | null {
  const parsed = readJsonFile<Partial<WechatActiveAccountRef>>(getWechatActiveAccountPath())
  const accountId = normalizeWechatAccountId(trimOptionalString(parsed?.accountId) || '')
  if (!accountId) return null
  return {
    accountId,
    updatedAt: trimOptionalString(parsed?.updatedAt) || new Date().toISOString(),
  }
}

export function getActiveWechatAccount(): WechatStoredAccount | null {
  const activeRef = loadActiveWechatAccountRef()
  if (!activeRef) return null
  const account = loadWechatAccount(activeRef.accountId)
  if (account) return account
  clearActiveWechatAccount()
  return null
}

export function saveWechatAccount(account: WechatStoredAccount): WechatStoredAccount {
  const normalizedAccountId = normalizeWechatAccountId(account.accountId || account.rawAccountId)
  const normalized: WechatStoredAccount = {
    accountId: normalizedAccountId,
    rawAccountId: account.rawAccountId.trim(),
    userId: trimOptionalString(account.userId),
    token: account.token.trim(),
    baseUrl: trimOptionalString(account.baseUrl) || getWechatEffectiveBaseUrl(),
    cdnBaseUrl: trimOptionalString(account.cdnBaseUrl) || getWechatEffectiveCdnBaseUrl(),
    savedAt: trimOptionalString(account.savedAt) || new Date().toISOString(),
  }
  writeJsonFile(getWechatAccountPath(normalized.accountId), normalized)
  return normalized
}

export function setActiveWechatAccount(accountId: string): void {
  const normalizedAccountId = normalizeWechatAccountId(accountId)
  if (!normalizedAccountId) return
  writeJsonFile(getWechatActiveAccountPath(), {
    accountId: normalizedAccountId,
    updatedAt: new Date().toISOString(),
  })
}

export function clearActiveWechatAccount(): void {
  const filePath = getWechatActiveAccountPath()
  if (existsSync(filePath)) {
    rmSync(filePath, { force: true })
  }
}

export function deleteWechatAccount(accountId: string): void {
  const normalizedAccountId = normalizeWechatAccountId(accountId)
  if (!normalizedAccountId) return
  rmSync(getWechatAccountPath(normalizedAccountId), { force: true })
  rmSync(getWechatSyncBufPath(normalizedAccountId), { force: true })

  const activeRef = loadActiveWechatAccountRef()
  if (activeRef?.accountId === normalizedAccountId) {
    clearActiveWechatAccount()
  }
}

export function resolveWechatCredential(): WechatCredential | null {
  const envToken = trimOptionalString(process.env.WECHAT_BOT_TOKEN)
  if (envToken) {
    return {
      source: 'env',
      token: envToken,
      baseUrl: getWechatEffectiveBaseUrl(),
      cdnBaseUrl: getWechatEffectiveCdnBaseUrl(),
    }
  }

  const activeAccount = getActiveWechatAccount()
  if (!activeAccount) return null

  return {
    source: 'file',
    token: activeAccount.token,
    baseUrl: activeAccount.baseUrl,
    cdnBaseUrl: activeAccount.cdnBaseUrl,
    accountId: activeAccount.accountId,
    rawAccountId: activeAccount.rawAccountId,
    userId: activeAccount.userId,
    savedAt: activeAccount.savedAt,
  }
}

export function isWechatEnabled(): boolean {
  return process.env.WECHAT_ENABLED === 'true'
}

export function loadWechatConfig(): WechatConfig | null {
  if (!isWechatEnabled()) return null

  const credential = resolveWechatCredential()
  if (!credential) return null

  const allowUsers = (process.env.WECHAT_ALLOW_USERS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)

  return {
    token: credential.token,
    baseUrl: credential.baseUrl,
    cdnBaseUrl: credential.cdnBaseUrl,
    allowUsers,
    requireAllowlist: process.env.WECHAT_REQUIRE_ALLOWLIST === 'true',
    botName: sanitizeBotName(process.env.WECHAT_BOT_NAME?.trim() || 'LaborAny'),
    defaultSkillId: process.env.WECHAT_DEFAULT_SKILL?.trim() || '__generic__',
    pollTimeoutMs: parsePositiveInt(process.env.WECHAT_POLL_TIMEOUT_MS, DEFAULT_POLL_TIMEOUT_MS),
    textChunkLimit: parsePositiveInt(process.env.WECHAT_TEXT_CHUNK_LIMIT, DEFAULT_TEXT_CHUNK_LIMIT),
    credentialSource: credential.source,
    accountId: credential.accountId,
    rawAccountId: credential.rawAccountId,
    userId: credential.userId,
  }
}
