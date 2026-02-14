import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { parse as parseDotenv } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))

const RESETTABLE_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_CLASSIFY_MODEL',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_PATH',
] as const

function isPackaged(): boolean {
  return !process.execPath.includes('node')
}

function getUserConfigDir(): string {
  if (process.platform === 'win32') {
    return join(homedir(), 'AppData', 'Roaming', 'LaborAny')
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'LaborAny')
  }
  return join(homedir(), '.config', 'laborany')
}

export function getRuntimeEnvPath(): string {
  return join(getUserConfigDir(), '.env')
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
  }

  for (const key of RESETTABLE_KEYS) {
    if (!(key in merged)) {
      delete process.env[key]
    }
  }

  for (const [key, value] of Object.entries(merged)) {
    process.env[key] = value
  }

  return { loadedFrom }
}
