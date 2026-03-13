import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  getRuntimeDataDir,
  getRuntimeTasksDir,
  getRuntimeUploadsDir,
  getUserDir,
} from 'laborany-shared'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isPkg = typeof (process as any).pkg !== 'undefined'

function getResourcesDir(): string {
  if (isPkg) {
    return dirname(dirname(process.execPath))
  }
  return join(__dirname, '../..')
}

export const RESOURCES_DIR = getResourcesDir()
export const DATA_DIR = getRuntimeDataDir()
export const APP_HOME_DIR = getUserDir()
export const TASKS_DIR = getRuntimeTasksDir()
export const UPLOADS_DIR = getRuntimeUploadsDir()

export { isPkg }
