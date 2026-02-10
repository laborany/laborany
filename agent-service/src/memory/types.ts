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

