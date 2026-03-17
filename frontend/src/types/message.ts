
export type MessageSessionMode = 'converse' | 'execution'

export type MessageKind =
  | 'user'
  | 'assistant_reply'
  | 'decision_reply'
  | 'action_summary'
  | 'question_summary'
  | 'rule_reply'
  | 'error'
  | 'system'
  | 'tool_use'
  | 'tool_result'

export interface MessageCapabilities {
  canCopy?: boolean
  canRegenerate?: boolean
}

export interface MessageMeta {
  sessionMode?: MessageSessionMode
  messageKind?: MessageKind
  turnId?: string
  replyToMessageId?: number | null
  variantGroupId?: string | null
  variantIndex?: number | null
  source?: 'user' | 'llm' | 'rule' | 'system'
  capabilities?: MessageCapabilities
  widget?: { widgetId: string; title: string; html: string; status: string }
}

export interface MessageVariant {
  id: string
  serverMessageId?: number | null
  content: string
  timestamp: Date
  meta?: MessageMeta | null
}

export interface AgentMessage {
  id: string
  type: 'user' | 'assistant' | 'tool' | 'error'
  content: string
  toolName?: string
  toolInput?: Record<string, unknown>
  timestamp: Date
  serverMessageId?: number | null
  meta?: MessageMeta | null
  variants?: MessageVariant[]
  activeVariantIndex?: number
  /** Widget anchor: links this message to a widget in the panel */
  widgetId?: string
  widgetTitle?: string
}

export interface WidgetState {
  widgetId: string
  title: string
  html: string
  status: 'loading' | 'ready' | 'error'
  errorMessage?: string
}

export interface HistoryMessage {
  id: number
  type: string  // 'user', 'assistant', 'tool_use', 'tool_result'
  content: string | null
  toolName: string | null
  toolInput: unknown | null
  toolResult: string | null
  meta?: MessageMeta | null
  createdAt: string
}

export type SessionSource = 'desktop' | 'converse' | 'cron' | 'feishu' | 'qq'

export interface Session {
  id: string
  skill_id: string
  query: string
  status: string
  cost: number
  created_at: string
  source?: SessionSource
}

export interface SessionDetail extends Session {
  messages: HistoryMessage[]
  work_dir?: string  // 工作目录，用于 Live Preview
  sourceMeta?: {
    attachmentIds?: string[] | string
  } | null
}


export interface SessionLiveStatus {
  sessionId: string
  dbStatus: string
  isRunning: boolean
  needsInput?: boolean
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
  mtimeMs?: number
  updatedAt?: string
  children?: TaskFile[]
  stepIndex?: number    // 复合技能步骤索引
  stepName?: string     // 复合技能步骤名称
}
