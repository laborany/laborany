import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { DATA_DIR } from '../paths.js'

/* ── 类型定义 ── */

export type MemoryScene = 'general_qa' | 'code_task' | 'writing' | 'planning'

export interface InjectedMemorySection {
  title: string
  content: string
  source: string
  category: 'fixed' | 'high' | 'similar' | 'recent'
  score: number
  tokens: number
}

export interface MemoryTraceEvent {
  at: string
  stage: 'retrieve' | 'extract' | 'upsert' | 'error'
  sessionId: string
  payload: Record<string, unknown>
}

/* ── Trace Logger ── */

function getTraceDir(date: Date): string {
  const day = date.toISOString().split('T')[0]
  return join(DATA_DIR, 'memory', 'traces', day)
}

export class MemoryTraceLogger {
  log(event: MemoryTraceEvent): void {
    try {
      const date = new Date(event.at)
      const dir = getTraceDir(date)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const filePath = join(dir, `${event.sessionId}.jsonl`)
      appendFileSync(filePath, `${JSON.stringify(event)}\n`, 'utf-8')
    } catch {
      // trace 失败不影响主流程
    }
  }
}

export const memoryTraceLogger = new MemoryTraceLogger()

export function readTrace(sessionId: string): string[] {
  const day = new Date().toISOString().split('T')[0]
  const tracePath = join(DATA_DIR, 'memory', 'traces', day, `${sessionId}.jsonl`)
  if (!existsSync(tracePath)) return []
  const content = readFileSync(tracePath, 'utf-8').trim()
  if (!content) return []
  return content.split('\n').filter(Boolean)
}
