import { homedir } from 'os'
import { join } from 'path'
import { existsSync } from 'fs'

export function isPackagedRuntime(): boolean {
  return typeof (process as any).pkg !== 'undefined'
}

export function getFallbackAppHome(): string {
  if (process.platform === 'win32') {
    const lower = join(homedir(), 'AppData', 'Roaming', 'laborany')
    const legacy = join(homedir(), 'AppData', 'Roaming', 'LaborAny')
    if (existsSync(lower)) return lower
    if (existsSync(legacy)) return legacy
    return lower
  }
  if (process.platform === 'darwin') {
    const lower = join(homedir(), 'Library', 'Application Support', 'laborany')
    const legacy = join(homedir(), 'Library', 'Application Support', 'LaborAny')
    if (existsSync(lower)) return lower
    if (existsSync(legacy)) return legacy
    return lower
  }
  const lower = join(homedir(), '.config', 'laborany')
  const legacy = join(homedir(), '.config', 'LaborAny')
  if (existsSync(lower)) return lower
  if (existsSync(legacy)) return legacy
  return lower
}

export function getAppHomeDir(): string {
  const fromEnv = (process.env.LABORANY_HOME || '').trim()
  if (fromEnv) return fromEnv

  if (!isPackagedRuntime()) {
    return join(process.cwd(), 'data')
  }

  return getFallbackAppHome()
}

export function getAppLogsDir(): string {
  const fromEnv = (process.env.LABORANY_LOG_DIR || '').trim()
  if (fromEnv) return fromEnv
  return join(getAppHomeDir(), 'logs')
}

export function getMigrationReportPath(): string {
  return join(getAppHomeDir(), 'migration-report.json')
}
