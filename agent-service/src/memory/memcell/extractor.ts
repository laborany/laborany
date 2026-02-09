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
   *  提取事实（规则匹配 + 保底机制）
   *
   *  识别模式（中文 + 英文）：
   *  - 偏好：「我喜欢」「我习惯」「I prefer」「I like」
   *  - 纠正：「不是...是」「应该是」「错了」
   *  - 事实：「我是」「我在」「I work with」「I use」
   *  - 上下文：「我用」「我做」「我正在」「项目」「工作」
   *
   *  保底：当所有模式均未匹配时，生成一条 context fact
   * ──────────────────────────────────────────────────────────────────────── */
  extractFacts(messages: Message[]): ExtractedFact[] {
    const facts: ExtractedFact[] = []

    /* ── 中文模式 ── */
    const zhPatterns = [
      { regex: /我(喜欢|习惯|偏好|倾向)[^。，！？\n]+/g, type: 'preference' as const },
      { regex: /(不是.{2,20}是|应该是|错了.{2,20}正确)/g, type: 'correction' as const },
      { regex: /我(是|的|在|有)[^。，！？\n]{2,30}/g, type: 'fact' as const },
      { regex: /我(用|常|需要|想|做|正在)[^。，！？\n]{2,40}/g, type: 'context' as const },
      { regex: /(项目|工作)[^。，！？\n]{2,40}/g, type: 'context' as const },
    ]

    /* ── 英文模式 ── */
    const enPatterns = [
      { regex: /I (prefer|like|enjoy|love)\b[^.!?\n]{2,60}/gi, type: 'preference' as const },
      { regex: /I (use|work with|work on|am using)\b[^.!?\n]{2,60}/gi, type: 'context' as const },
      { regex: /I (am|have been|was)\b[^.!?\n]{2,60}/gi, type: 'fact' as const },
    ]

    const allPatterns = [...zhPatterns, ...enPatterns]

    /* ── 同时处理 user 和 assistant 消息 ── */
    for (const msg of messages) {
      const confidence = msg.role === 'user' ? 0.7 : 0.5
      for (const { regex, type } of allPatterns) {
        const matches = msg.content.match(regex)
        if (!matches) continue
        for (const match of matches) {
          facts.push({ type, content: match.trim(), confidence })
        }
      }
    }

    /* ── 保底机制：确保至少产出一条 fact ── */
    if (facts.length === 0) {
      const userMsg = messages.find(m => m.role === 'user')
      if (userMsg) {
        const snippet = userMsg.content.slice(0, 50).trim()
        facts.push({ type: 'context', content: snippet, confidence: 0.5 })
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
