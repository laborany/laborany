import { existsSync, readFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { parse as parseDotenv } from 'dotenv'
import { APP_HOME_DIR } from './paths.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const RESETTABLE_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_CLASSIFY_MODEL',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_PATH',
] as const

const RUNTIME_OWNED_PREFIXES = [
  'FEISHU_',
  'SMTP_',
  'NOTIFICATION_',
  'NOTIFY_',
] as const

let lastLoadedEnvKeys = new Set<string>()

function isPackaged(): boolean {
  return !process.execPath.includes('node')
}

export function getRuntimeEnvPath(): string {
  const fromEnv = (process.env.LABORANY_HOME || '').trim()
  if (fromEnv) {
    return join(fromEnv, '.env')
  }
  return join(APP_HOME_DIR, '.env')
}

function readEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {}

  try {
    const raw = readFileSync(filePath, 'utf-8')
    return parseDotenv(raw)
  } catch {
    return {}
  }
}

export interface RuntimeConfigSnapshot {
  loadedFrom: string[]
}

export function refreshRuntimeConfig(): RuntimeConfigSnapshot {
  const runtimeEnvPath = getRuntimeEnvPath()
  const candidates = isPackaged()
    ? [runtimeEnvPath]
    : [
        resolve(__dirname, '../../.env'),
        resolve(process.cwd(), '.env'),
        resolve(process.cwd(), 'data', '.env'),
        resolve(process.cwd(), '..', 'data', '.env'),
        resolve(process.cwd(), '..', 'src-api', 'data', '.env'),
        runtimeEnvPath,
      ]

  const merged: Record<string, string> = {}
  const loadedFrom: string[] = []
  const seen = new Set<string>()

  for (const candidate of candidates) {
    if (seen.has(candidate)) continue
    seen.add(candidate)

    const parsed = readEnvFile(candidate)
    if (Object.keys(parsed).length === 0) continue
    Object.assign(merged, parsed)
    loadedFrom.push(candidate)
  }

  const runtimeRaw = readEnvFile(runtimeEnvPath)
  const runtimeFileExists = existsSync(runtimeEnvPath)
  if (runtimeFileExists) {
    for (const key of RESETTABLE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(runtimeRaw, key)) {
        merged[key] = runtimeRaw[key]
      } else {
        delete merged[key]
      }
    }

    // When runtime .env exists, it is the source of truth for notification/feishu keys.
    for (const key of Object.keys(merged)) {
      const runtimeOwned = RUNTIME_OWNED_PREFIXES.some(prefix => key.startsWith(prefix))
      if (!runtimeOwned) continue
      if (!Object.prototype.hasOwnProperty.call(runtimeRaw, key)) {
        delete merged[key]
      }
    }
  }

  for (const key of RESETTABLE_KEYS) {
    if (!(key in merged)) {
      delete process.env[key]
    }
  }

  // Remove keys previously loaded from runtime files but not present anymore.
  for (const key of lastLoadedEnvKeys) {
    if (!(key in merged)) {
      delete process.env[key]
    }
  }

  for (const [key, value] of Object.entries(merged)) {
    process.env[key] = value
  }

  lastLoadedEnvKeys = new Set(Object.keys(merged))

  return { loadedFrom }
}
