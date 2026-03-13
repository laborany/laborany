import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { getUserDir, isPackaged } from './paths.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function getHomeOverride(): string {
  return (process.env.LABORANY_HOME || '').trim()
}

function getProjectRoot(): string {
  return resolve(__dirname, '../..')
}

export function getRuntimeHomeDir(): string {
  const override = getHomeOverride()
  if (override) return override
  if (isPackaged()) return getUserDir()
  return getProjectRoot()
}

export function getRuntimeDataDir(): string {
  return join(getRuntimeHomeDir(), 'data')
}

export function getRuntimeUploadsDir(): string {
  return join(getRuntimeHomeDir(), 'uploads')
}

export function getRuntimeTasksDir(): string {
  if (getHomeOverride() || isPackaged()) {
    return join(getRuntimeHomeDir(), 'data', 'tasks')
  }
  return join(getRuntimeHomeDir(), 'tasks')
}
