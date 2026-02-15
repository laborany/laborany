import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getUserDir } from 'laborany-shared'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isPkg = typeof (process as any).pkg !== 'undefined'

function getResourcesDir(): string {
  if (isPkg) {
    return dirname(dirname(process.execPath))
  }
  return join(__dirname, '../..')
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
