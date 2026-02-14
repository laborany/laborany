import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getAppHomeDir, isPackagedRuntime } from './app-home.js'

export interface LocalProfile {
  name: string
  createdAt: string
  updatedAt: string
}

function isPackaged(): boolean {
  return isPackagedRuntime()
}

export function getConfigDir(): string {
  if (isPackaged()) {
    const appDataDir = getAppHomeDir()

    if (!existsSync(appDataDir)) {
      mkdirSync(appDataDir, { recursive: true })
    }
    return appDataDir
  }

  const devConfigDir = join(process.cwd(), 'data')
  if (!existsSync(devConfigDir)) {
    mkdirSync(devConfigDir, { recursive: true })
  }
  return devConfigDir
}

export function getEnvPath(): string {
  return join(getConfigDir(), '.env')
}

export function getProfilePath(): string {
  return join(getConfigDir(), 'profile.json')
}

export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()

    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    result[key] = value
  }

  return result
}

export function generateEnvContent(config: Record<string, string>): string {
  const lines: string[] = [
    '# LaborAny 配置文件',
    '# 此文件由应用自动管理，也可手动编辑',
    '',
  ]

  for (const [key, value] of Object.entries(config)) {
    lines.push(`${key}=${value}`)
  }

  return lines.join('\n')
}

export function readEnvConfig(): Record<string, string> {
  const envPath = getEnvPath()
  if (!existsSync(envPath)) return {}
  const content = readFileSync(envPath, 'utf-8')
  return parseEnvFile(content)
}

export function writeEnvConfig(nextConfig: Record<string, string>): void {
  const envPath = getEnvPath()
  const content = generateEnvContent(nextConfig)
  writeFileSync(envPath, content, 'utf-8')
}

export function readLocalProfile(): LocalProfile | null {
  const profilePath = getProfilePath()
  if (!existsSync(profilePath)) return null

  try {
    const raw = readFileSync(profilePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<LocalProfile>
    const name = (parsed.name || '').trim()
    if (!name) return null
    return {
      name,
      createdAt: parsed.createdAt || new Date().toISOString(),
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function writeLocalProfile(name: string): LocalProfile {
  const profilePath = getProfilePath()
  const existing = readLocalProfile()
  const now = new Date().toISOString()

  const profile: LocalProfile = {
    name: name.trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }

  writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf-8')
  return profile
}
