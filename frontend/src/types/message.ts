/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      消息类型定义                                         ║
 * ║                                                                          ║
 * ║  统一管理所有消息相关的类型定义                                             ║
 * ║  消除重复定义，确保类型一致性                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           实时消息类型                                    │
 * │  用于 SSE 流式通信时的消息展示                                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface AgentMessage {
  id: string
  type: 'user' | 'assistant' | 'tool' | 'error'
  content: string
  toolName?: string
  toolInput?: Record<string, unknown>
  timestamp: Date
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           历史消息类型                                    │
 * │  用于从数据库获取的历史会话消息                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface HistoryMessage {
  id: number
  type: string  // 'user', 'assistant', 'tool_use', 'tool_result'
  content: string | null
  toolName: string | null
  toolInput: unknown | null
  toolResult: string | null
  createdAt: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           会话类型                                        │
 * │  注意：字段命名与后端 API 保持一致（snake_case）                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
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
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           任务文件类型                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface TaskFile {
  name: string
  path: string
  type: 'file' | 'folder'
  ext?: string
  size?: number
  children?: TaskFile[]
  stepIndex?: number    // 工作流步骤索引
  stepName?: string     // 工作流步骤名称
}
