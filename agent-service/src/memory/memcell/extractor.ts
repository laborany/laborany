/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     MemCell 提取器                                        ║
 * ║                                                                          ║
 * ║  职责：从对话中提取原子记忆单元 (MemCell)                                  ║
 * ║  设计：对话边界检测 + 事实提取                                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp?: Date
}

export interface ExtractedFact {
  type: 'preference' | 'fact' | 'correction' | 'context'
  content: string
  confidence: number
}

export interface MemCell {
  id: string
  timestamp: Date
  skillId: string
  summary: string
  messages: Message[]
  facts: ExtractedFact[]
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     工具函数                                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function generateId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `cell_${ts}_${rand}`
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     MemCell 提取器类                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class MemCellExtractor {
  private readonly maxMessagesPerCell = 10
  private readonly maxTokensPerCell = 1000

  /* ────────────────────────────────────────────────────────────────────────
   *  估算 Token 数
   * ──────────────────────────────────────────────────────────────────────── */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 2.5)
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  检测对话边界
   *
   *  边界条件：
   *  1. 消息数达到上限
   *  2. Token 数达到上限
   *  3. 话题明显切换（简单实现：用户消息以问号结尾且前一条不是问答）
   * ──────────────────────────────────────────────────────────────────────── */
  detectBoundary(messages: Message[]): number {
    let tokens = 0
    for (let i = 0; i < messages.length; i++) {
      tokens += this.estimateTokens(messages[i].content)
      if (i >= this.maxMessagesPerCell - 1) return i + 1
      if (tokens >= this.maxTokensPerCell) return i + 1
    }
    return messages.length
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  提取事实（简单规则匹配）
   *
   *  识别模式：
   *  - 偏好：「我喜欢」「我习惯」「我偏好」
   *  - 纠正：「不是...是」「应该是」「错了」
   *  - 事实：「我是」「我的」「我在」
   * ──────────────────────────────────────────────────────────────────────── */
  extractFacts(messages: Message[]): ExtractedFact[] {
    const facts: ExtractedFact[] = []
    const patterns = [
      { regex: /我(喜欢|习惯|偏好|倾向)[^。，！？\n]+/g, type: 'preference' as const },
      { regex: /(不是.{2,20}是|应该是|错了.{2,20}正确)/g, type: 'correction' as const },
      { regex: /我(是|的|在|有)[^。，！？\n]{2,30}/g, type: 'fact' as const },
    ]

    for (const msg of messages) {
      if (msg.role !== 'user') continue

      for (const { regex, type } of patterns) {
        const matches = msg.content.match(regex)
        if (matches) {
          for (const match of matches) {
            facts.push({
              type,
              content: match.trim(),
              confidence: 0.7,
            })
          }
        }
      }
    }

    return facts
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  生成摘要（取第一条用户消息的前 50 字）
   * ──────────────────────────────────────────────────────────────────────── */
  generateSummary(messages: Message[]): string {
    const userMsg = messages.find(m => m.role === 'user')
    if (!userMsg) return '对话记录'
    const text = userMsg.content.slice(0, 50)
    return text + (userMsg.content.length > 50 ? '...' : '')
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  提取 MemCell
   * ──────────────────────────────────────────────────────────────────────── */
  extract(messages: Message[], skillId: string): MemCell {
    const boundary = this.detectBoundary(messages)
    const cellMessages = messages.slice(0, boundary)

    return {
      id: generateId(),
      timestamp: new Date(),
      skillId,
      summary: this.generateSummary(cellMessages),
      messages: cellMessages,
      facts: this.extractFacts(cellMessages),
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  批量提取（将长对话切分为多个 MemCell）
   * ──────────────────────────────────────────────────────────────────────── */
  extractAll(messages: Message[], skillId: string): MemCell[] {
    const cells: MemCell[] = []
    let remaining = [...messages]

    while (remaining.length > 0) {
      const cell = this.extract(remaining, skillId)
      cells.push(cell)
      remaining = remaining.slice(cell.messages.length)
    }

    return cells
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出单例                                        │
 * └──────────────────────────────────────────────────────────────���───────────┘ */
export const memCellExtractor = new MemCellExtractor()
