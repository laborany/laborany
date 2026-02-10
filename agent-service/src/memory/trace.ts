import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { DATA_DIR } from '../paths.js'
import type { MemoryTraceEvent } from './types.js'

function getTraceDir(date: Date): string {
  const day = date.toISOString().split('T')[0]
  return join(DATA_DIR, 'memory', 'traces', day)
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

export class MemoryTraceLogger {
  log(event: MemoryTraceEvent): void {
    try {
      const date = new Date(event.at)
      const dir = getTraceDir(date)
      ensureDir(dir)
      const filePath = join(dir, `${event.sessionId}.jsonl`)
      appendFileSync(filePath, `${JSON.stringify(event)}\n`, 'utf-8')
    } catch {
      // trace 失败不影响主流程
    }
  }
}

export const memoryTraceLogger = new MemoryTraceLogger()

