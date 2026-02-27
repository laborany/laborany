/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Model Profiles 管理模块                              ║
 * ║                                                                          ║
 * ║  职责：管理多个模型配置（name + apiKey + baseUrl + model）                ║
 * ║  存储：{APP_HOME}/model-profiles.json                                    ║
 * ║  迁移：从 .env 自动迁移到 profiles[0]                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { v4 as uuid } from 'uuid'
import { getConfigDir, readEnvConfig, writeEnvConfig } from './app-config.js'

export interface ModelProfile {
  id: string
  name: string
  apiKey: string
  baseUrl?: string
  model?: string
  createdAt: string
  updatedAt: string
}

export interface ModelProfilesStore {
  version: 1
  profiles: ModelProfile[]
}

function getModelProfilesPath(): string {
  return join(getConfigDir(), 'model-profiles.json')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       读取 Model Profiles                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function readModelProfiles(): ModelProfilesStore {
  const path = getModelProfilesPath()
  if (!existsSync(path)) {
    return { version: 1, profiles: [] }
  }

  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<ModelProfilesStore>

    if (!parsed || typeof parsed !== 'object') {
      return { version: 1, profiles: [] }
    }

    const profiles = Array.isArray(parsed.profiles)
      ? parsed.profiles
        .filter((item): item is ModelProfile => {
          return (
            item &&
            typeof item === 'object' &&
            typeof item.id === 'string' &&
            typeof item.name === 'string' &&
            typeof item.apiKey === 'string'
          )
        })
        .map((item) => ({
          id: item.id,
          name: item.name,
          apiKey: item.apiKey,
          baseUrl: item.baseUrl,
          model: item.model,
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString(),
        }))
      : []

    return { version: 1, profiles }
  } catch (error) {
    console.error('[ModelProfiles] Failed to read model-profiles.json:', error)
    return { version: 1, profiles: [] }
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       写入 Model Profiles                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function writeModelProfiles(store: ModelProfilesStore): void {
  const path = getModelProfilesPath()
  try {
    writeFileSync(path, JSON.stringify(store, null, 2), 'utf-8')
  } catch (error) {
    console.error('[ModelProfiles] Failed to write model-profiles.json:', error)
    throw error
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       按 ID 获取 Profile                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function getProfileById(id: string): ModelProfile | undefined {
  const store = readModelProfiles()
  return store.profiles.find((p) => p.id === id)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取默认 Profile                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function getDefaultProfile(): ModelProfile | null {
  const store = readModelProfiles()
  return store.profiles.length > 0 ? store.profiles[0] : null
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       从 .env 迁移（懒加载）                              │
 * │  如果 model-profiles.json 不存在，从 .env 生成默认 profile               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function migrateFromEnvIfNeeded(): void {
  const path = getModelProfilesPath()
  if (existsSync(path)) {
    return
  }

  const envConfig = readEnvConfig()
  const apiKey = (envConfig.ANTHROPIC_API_KEY || '').trim()

  if (!apiKey) {
    console.log('[ModelProfiles] No ANTHROPIC_API_KEY in .env, skip migration')
    return
  }

  const now = new Date().toISOString()
  const defaultProfile: ModelProfile = {
    id: uuid(),
    name: 'Default',
    apiKey,
    baseUrl: envConfig.ANTHROPIC_BASE_URL,
    model: envConfig.ANTHROPIC_MODEL,
    createdAt: now,
    updatedAt: now,
  }

  const store: ModelProfilesStore = {
    version: 1,
    profiles: [defaultProfile],
  }

  writeModelProfiles(store)
  console.log('[ModelProfiles] Migrated from .env to model-profiles.json')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       同步回写到 .env                                     │
 * │  每次保存 profiles 后，把 profiles[0] 回写到 .env                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function syncDefaultProfileToEnv(): void {
  const defaultProfile = getDefaultProfile()
  if (!defaultProfile) {
    return
  }

  const envConfig = readEnvConfig()
  envConfig.ANTHROPIC_API_KEY = defaultProfile.apiKey

  if (defaultProfile.baseUrl) {
    envConfig.ANTHROPIC_BASE_URL = defaultProfile.baseUrl
  } else {
    delete envConfig.ANTHROPIC_BASE_URL
  }

  if (defaultProfile.model) {
    envConfig.ANTHROPIC_MODEL = defaultProfile.model
  } else {
    delete envConfig.ANTHROPIC_MODEL
  }

  writeEnvConfig(envConfig)

  // 同步到 process.env
  process.env.ANTHROPIC_API_KEY = defaultProfile.apiKey
  if (defaultProfile.baseUrl) {
    process.env.ANTHROPIC_BASE_URL = defaultProfile.baseUrl
  } else {
    delete process.env.ANTHROPIC_BASE_URL
  }
  if (defaultProfile.model) {
    process.env.ANTHROPIC_MODEL = defaultProfile.model
  } else {
    delete process.env.ANTHROPIC_MODEL
  }

  console.log('[ModelProfiles] Synced default profile to .env')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       脱敏 API Key                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 8) {
    return '***'
  }
  const last4 = apiKey.slice(-4)
  return `sk-***...${last4}`
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       验证 Profile 名称唯一性                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function isProfileNameUnique(name: string, excludeId?: string): boolean {
  const store = readModelProfiles()
  const normalized = name.trim().toLowerCase()
  return !store.profiles.some(
    (p) => p.id !== excludeId && p.name.trim().toLowerCase() === normalized
  )
}
