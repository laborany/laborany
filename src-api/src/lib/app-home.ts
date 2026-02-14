import { homedir } from 'os'
import { join } from 'path'

export function isPackagedRuntime(): boolean {
  return typeof (process as any).pkg !== 'undefined'
}

export function getFallbackAppHome(): string {
  if (process.platform === 'win32') {
    return join(homedir(), 'AppData', 'Roaming', 'LaborAny')
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'LaborAny')
  }
  return join(homedir(), '.config', 'laborany')
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
