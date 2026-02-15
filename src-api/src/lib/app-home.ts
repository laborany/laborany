import { join } from 'path'
import { getUserDir } from 'laborany-shared'

export function isPackagedRuntime(): boolean {
  return typeof (process as any).pkg !== 'undefined'
}

export function getFallbackAppHome(): string {
  return getUserDir()
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
