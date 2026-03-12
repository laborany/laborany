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

export default Database
