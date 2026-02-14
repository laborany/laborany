import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'
import { existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isPkg = typeof (process as any).pkg !== 'undefined'

function getResourcesDir(): string {
  if (isPkg) {
    return dirname(dirname(process.execPath))
  }
  return join(__dirname, '../..')
}

function getUserDir(): string {
  const fromEnv = (process.env.LABORANY_HOME || '').trim()
  if (fromEnv) {
    return fromEnv
  }

  const home = homedir()
  if (process.platform === 'win32') {
    const lower = join(home, 'AppData', 'Roaming', 'laborany')
    const legacy = join(home, 'AppData', 'Roaming', 'LaborAny')
    if (existsSync(lower)) return lower
    if (existsSync(legacy)) return legacy
    return lower
  }
  if (process.platform === 'darwin') {
    const lower = join(home, 'Library', 'Application Support', 'laborany')
    const legacy = join(home, 'Library', 'Application Support', 'LaborAny')
    if (existsSync(lower)) return lower
    if (existsSync(legacy)) return legacy
    return lower
  }
  const lower = join(home, '.config', 'laborany')
  const legacy = join(home, '.config', 'LaborAny')
  if (existsSync(lower)) return lower
  if (existsSync(legacy)) return legacy
  return lower
}

export function getAppHomeDir(): string {
  return getUserDir()
}

function getDataDir(): string {
  if (!isPkg) return join(__dirname, '../../data')
  return join(getUserDir(), 'data')
}

export const RESOURCES_DIR = getResourcesDir()
export const DATA_DIR = getDataDir()
export const APP_HOME_DIR = getAppHomeDir()

export { isPkg }
