import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import { dirname, join } from 'path'

const isPkg = typeof (process as any).pkg !== 'undefined'

const getNativeBindingPath = (): string | undefined => {
  const envPath = process.env.BETTER_SQLITE3_BINDING
  if (envPath && existsSync(envPath)) return envPath
  if (!isPkg) return undefined
  const nativePath = join(dirname(process.execPath), 'better_sqlite3.node')
  return existsSync(nativePath) ? nativePath : undefined
}

export const createDatabase = (filename: string, options?: { readonly?: boolean }): Database.Database => {
  const nativeBinding = getNativeBindingPath()
  return new Database(filename, {
    ...options,
    ...(nativeBinding ? { nativeBinding } : {}),
  })
}

export function isCronStorageUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code?: string }).code
    : ''

  const details = [
    error.message || '',
    code || '',
  ].join('\n')

  return (
    details.includes('better_sqlite3.node')
    || details.includes('ERR_DLOPEN_FAILED')
    || details.includes('NODE_MODULE_VERSION')
  )
}

export default Database
