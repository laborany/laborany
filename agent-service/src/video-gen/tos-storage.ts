import { randomUUID } from 'crypto'
import { stat } from 'fs/promises'
import { basename, extname } from 'path'
import { TosClient } from '@volcengine/tos-sdk'

interface TosStorageConfig {
  accessKeyId: string
  accessKeySecret: string
  stsToken?: string
  region: string
  endpoint?: string
  secure: boolean
  bucket: string
  prefix: string
  publicBaseUrl?: string
  signedUrlExpires: number
}

export interface TosConfigStatus {
  configured: boolean
  explicitlyEnabled: boolean
  missingKeys: string[]
  config?: TosStorageConfig
}

export interface TosUploadResult {
  url: string
  bucket: string
  key: string
  size: number
}

const REQUIRED_ENV_KEYS = [
  'LABORANY_TOS_ACCESS_KEY_ID',
  'LABORANY_TOS_ACCESS_KEY_SECRET',
  'LABORANY_TOS_REGION',
  'LABORANY_TOS_BUCKET',
]

function envValue(key: string): string {
  return (process.env[key] || '').trim()
}

function normalizeBool(value: string): boolean {
  const raw = value.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

function isFalse(value: string): boolean {
  const raw = value.trim().toLowerCase()
  return raw === '0' || raw === 'false' || raw === 'no' || raw === 'off'
}

function normalizeEndpoint(raw: string): { endpoint?: string; secure?: boolean } {
  const value = raw.trim()
  if (!value) return {}

  try {
    const url = /^https?:\/\//i.test(value) ? new URL(value) : null
    if (url) {
      return {
        endpoint: url.host,
        secure: url.protocol !== 'http:',
      }
    }
  } catch {
    // Fall through and let the SDK report endpoint issues.
  }

  return {
    endpoint: value.replace(/^\/+/, '').replace(/\/+$/, ''),
  }
}

function normalizePrefix(raw: string): string {
  const value = raw.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  return value || 'laborany/media-references'
}

function parsePositiveInt(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

function sanitizeFileName(filePath: string): string {
  const name = basename(filePath).trim() || `media${extname(filePath) || ''}`
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+/, '') || `media${extname(filePath) || ''}`
}

function buildObjectKey(config: TosStorageConfig, filePath: string): string {
  const now = new Date()
  const datePath = now.toISOString().slice(0, 10)
  const safeName = sanitizeFileName(filePath)
  return `${config.prefix}/${datePath}/${randomUUID()}-${safeName}`
}

function encodeObjectKey(key: string): string {
  return key.split('/').map(part => encodeURIComponent(part)).join('/')
}

function buildPublicObjectUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${encodeObjectKey(key)}`
}

export function readTosStorageConfig(): TosConfigStatus {
  const enabledRaw = envValue('LABORANY_TOS_ENABLED')
  const explicitlyEnabled = normalizeBool(enabledRaw)
  const explicitlyDisabled = isFalse(enabledRaw)
  if (explicitlyDisabled) {
    return { configured: false, explicitlyEnabled: false, missingKeys: [] }
  }

  const hasAnyConfig = REQUIRED_ENV_KEYS.some(key => envValue(key))
    || envValue('LABORANY_TOS_ENDPOINT')
    || envValue('LABORANY_TOS_PUBLIC_BASE_URL')
    || envValue('LABORANY_TOS_PREFIX')

  if (!explicitlyEnabled && !hasAnyConfig) {
    return { configured: false, explicitlyEnabled: false, missingKeys: [] }
  }

  const missingKeys = REQUIRED_ENV_KEYS.filter(key => !envValue(key))
  if (missingKeys.length > 0) {
    return { configured: false, explicitlyEnabled, missingKeys }
  }

  const endpoint = normalizeEndpoint(envValue('LABORANY_TOS_ENDPOINT'))
  const secureRaw = envValue('LABORANY_TOS_SECURE')
  const secure = secureRaw
    ? normalizeBool(secureRaw)
    : endpoint.secure ?? true

  return {
    configured: true,
    explicitlyEnabled,
    missingKeys: [],
    config: {
      accessKeyId: envValue('LABORANY_TOS_ACCESS_KEY_ID'),
      accessKeySecret: envValue('LABORANY_TOS_ACCESS_KEY_SECRET'),
      stsToken: envValue('LABORANY_TOS_STS_TOKEN') || undefined,
      region: envValue('LABORANY_TOS_REGION'),
      endpoint: endpoint.endpoint,
      secure,
      bucket: envValue('LABORANY_TOS_BUCKET'),
      prefix: normalizePrefix(envValue('LABORANY_TOS_PREFIX')),
      publicBaseUrl: envValue('LABORANY_TOS_PUBLIC_BASE_URL') || undefined,
      signedUrlExpires: parsePositiveInt(envValue('LABORANY_TOS_SIGNED_URL_EXPIRES'), 24 * 60 * 60),
    },
  }
}

export function formatTosMissingConfigMessage(status: TosConfigStatus): string {
  if (status.missingKeys.length > 0) {
    return `TOS 配置不完整，缺少 ${status.missingKeys.join(', ')}`
  }
  return '未配置 TOS，无法把本地视频 reference 上传为 Seedance 可访问 URL'
}

export async function uploadLocalMediaToTos(
  filePath: string,
  contentType: string,
): Promise<TosUploadResult> {
  const status = readTosStorageConfig()
  if (!status.config) {
    throw new Error(formatTosMissingConfigMessage(status))
  }

  const fileStat = await stat(filePath)
  const key = buildObjectKey(status.config, filePath)
  const client = new TosClient({
    accessKeyId: status.config.accessKeyId,
    accessKeySecret: status.config.accessKeySecret,
    stsToken: status.config.stsToken,
    region: status.config.region,
    endpoint: status.config.endpoint,
    secure: status.config.secure,
    bucket: status.config.bucket,
    requestTimeout: 10 * 60 * 1000,
    connectionTimeout: 30 * 1000,
    maxRetryCount: 3,
  })

  await client.putObjectFromFile({
    bucket: status.config.bucket,
    key,
    filePath,
    contentType,
    contentLength: fileStat.size,
  })

  const url = status.config.publicBaseUrl
    ? buildPublicObjectUrl(status.config.publicBaseUrl, key)
    : client.getPreSignedUrl({
      bucket: status.config.bucket,
      key,
      method: 'GET',
      expires: status.config.signedUrlExpires,
    })

  return {
    url,
    bucket: status.config.bucket,
    key,
    size: fileStat.size,
  }
}
