
export interface AgentMessage {
  id: string
  type: 'user' | 'assistant' | 'tool' | 'error'
  content: string
  toolName?: string
  toolInput?: Record<string, unknown>
  timestamp: Date
}

export interface HistoryMessage {
  id: number
  type: string  // 'user', 'assistant', 'tool_use', 'tool_result'
  content: string | null
  toolName: string | null
  toolInput: unknown | null
  toolResult: string | null
  createdAt: string
}

export interface Session {
  id: string
  skill_id: string
  query: string
  status: string
  cost: number
  created_at: string
}

export interface SessionDetail extends Session {
  messages: HistoryMessage[]
  work_dir?: string  // 工作目录，用于 Live Preview
}


export interface SessionLiveStatus {
  sessionId: string
  dbStatus: string
  isRunning: boolean
  source: 'runtime' | 'database'
  startedAt: string
  lastEventAt?: string
  canAttach: boolean
  runtimeStatus?: string
}

export interface TaskFile {
  name: string
  path: string
  type: 'file' | 'folder'
  ext?: string
  size?: number
  children?: TaskFile[]
  stepIndex?: number    // 复合技能步骤索引
  stepName?: string     // 复合技能步骤名称
}
