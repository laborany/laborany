import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isPkg = typeof (process as any).pkg !== 'undefined'

function getResourcesDir(): string {
  if (isPkg) {
    return dirname(dirname(process.execPath))
  }
  return join(__dirname, '../..')
}

function getUserDir(): string {
  if (process.platform === 'win32') {
    return join(homedir(), 'AppData', 'Roaming', 'LaborAny')
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'LaborAny')
  }
  return join(homedir(), '.config', 'laborany')
}

function getDataDir(): string {
  if (!isPkg) return join(__dirname, '../../data')
  return join(getUserDir(), 'data')
}

export const RESOURCES_DIR = getResourcesDir()
export const DATA_DIR = getDataDir()

export { isPkg }
