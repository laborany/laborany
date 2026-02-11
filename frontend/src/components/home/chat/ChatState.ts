/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     万能对话框 - 状态机类型定义                             ║
 * ║                                                                          ║
 * ║  状态流转：IDLE → ROUTING → MATCHED → EXECUTING → DONE                   ║
 * ║                           → NO_MATCH                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           路由匹配结果                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface MatchResult {
  type: 'skill' | 'none'
  id: string
  name: string
  confidence: number
  reason: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           轮播展示项                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface ShowcaseItem {
  id: string
  type: 'skill'
  icon: string
  name: string
  description: string
  category: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           对话状态机（判别联合类型）                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export type ChatPhase =
  | 'idle'
  | 'routing'
  | 'matched'
  | 'executing'
  | 'done'
  | 'no_match'

export type ChatState =
  | { phase: 'idle' }
  | { phase: 'routing'; query: string }
  | { phase: 'matched'; query: string; match: MatchResult }
  | { phase: 'executing'; query: string; match: MatchResult }
  | { phase: 'done'; query: string; match: MatchResult }
  | { phase: 'no_match'; query: string }
