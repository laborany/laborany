/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     QQ Bot 流式消息模块                                  ║
 * ║                                                                        ║
 * ║  职责：管理流式消息展示（多条消息模式）                                  ║
 * ║  设计：由于 QQ Bot API 不支持消息编辑，使用多条消息模拟流式效果          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { QQConfig } from './config.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     类型定义                                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */

interface StreamingState {
  targetId: string // C2C user openid
  targetType: 'c2c'
  currentText: string
  title?: string
}

interface PassiveReplyContext {
  msgId?: string
  msgSeq: number
}

function nextMsgSeq(replyCtx?: PassiveReplyContext): number | undefined {
  if (!replyCtx?.msgId) return undefined
  return replyCtx.msgSeq + 1
}

function commitMsgSeq(replyCtx: PassiveReplyContext | undefined, sentSeq: number | undefined): void {
  if (!replyCtx || !replyCtx.msgId || !sentSeq) return
  replyCtx.msgSeq = sentSeq
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     工具函数                                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function truncateForSummary(text: string, maxLen = 50): string {
  if (!text) return ''
  const cleaned = text.replace(/\n/g, ' ').trim()
  return cleaned.length <= maxLen ? cleaned : cleaned.slice(0, maxLen - 3) + '...'
}

// 将长文本分段，每段不超过 maxLen 字符
function splitTextIntoChunks(text: string, maxLen = 1000): string[] {
  if (text.length <= maxLen) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining)
      break
    }

    // 尝试在换行符处分割
    let splitIndex = remaining.lastIndexOf('\n', maxLen)
    if (splitIndex === -1 || splitIndex < maxLen / 2) {
      // 如果没有合适的换行符，直接按长度分割
      splitIndex = maxLen
    }

    chunks.push(remaining.slice(0, splitIndex))
    remaining = remaining.slice(splitIndex).trim()
  }

  return chunks
}

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     QQStreamingSession                                  ║
 * ║                                                                        ║
 * ║  高层封装：创建 → 流式更新 → 关闭                                      ║
 * ║  策略：使用多条消息模拟流式效果，定期发送更新                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

export class QQStreamingSession {
  private client: any // OpenAPI client
  private config: QQConfig
  private replyCtx?: PassiveReplyContext
  private state: StreamingState | null = null
  private updateQueue: Promise<void> = Promise.resolve()
  private closed = false
  private readonly MAX_MESSAGE_LENGTH = 1000 // 单条消息最大长度

  constructor(client: any, config: QQConfig, replyCtx?: PassiveReplyContext) {
    this.client = client
    this.config = config
    this.replyCtx = replyCtx
  }

  async start(
    targetId: string,
    targetType: 'c2c',
    title?: string,
  ): Promise<boolean> {
    if (this.state) return false

    try {
      const initialContent = title ? `${title}...` : '分析中...'
      const initialMessageId = await this.sendMessage(targetId, targetType, initialContent)

      this.state = {
        targetId,
        targetType,
        currentText: '',
        title,
      }

      console.log(`[QQ] Buffered session started: target=${targetId}, type=${targetType}`)
      return true
    } catch (err) {
      console.error('[QQ] Failed to start buffered session:', err)
      return false
    }
  }

  async update(text: string): Promise<void> {
    if (!this.state || this.closed) return

    this.updateQueue = this.updateQueue.then(async () => {
      if (!this.state || this.closed) return
      this.state.currentText = text
    })

    await this.updateQueue
  }

  async close(finalText?: string, summary?: string): Promise<void> {
    if (!this.state || this.closed) return
    this.closed = true

    await this.updateQueue

    const text = (finalText ?? this.state.currentText).trim()

    try {
      const fallback = '✅ 已完成'
      const withTitle = text || fallback

      // 发送最终结果（必要时分段）
      const chunks = splitTextIntoChunks(withTitle, this.MAX_MESSAGE_LENGTH)

      if (chunks.length === 1) {
        await this.sendMessage(this.state.targetId, this.state.targetType, chunks[0])
      } else {
        for (let i = 0; i < chunks.length; i++) {
          await this.sendMessage(
            this.state.targetId,
            this.state.targetType,
            `[${i + 1}/${chunks.length}]\n${chunks[i]}`,
          )
        }
      }

      console.log(`[QQ] Buffered session closed: target=${this.state.targetId}`)
    } catch (err) {
      console.error(`[QQ] Failed to close streaming session:`, err)
    }
  }

  isActive(): boolean {
    return this.state !== null && !this.closed
  }

  private async sendMessage(
    targetId: string,
    targetType: 'c2c',
    content: string,
  ): Promise<string | null> {
    try {
      if (targetType === 'c2c') {
        const payload: Record<string, unknown> = {
          content,
          msg_type: 0, // 文本消息
        }
        const msgSeq = nextMsgSeq(this.replyCtx)
        if (this.replyCtx?.msgId) {
          payload.msg_id = this.replyCtx.msgId
          payload.msg_seq = msgSeq || 1
        }
        // C2C 私聊消息
        const res = await this.client.c2cApi.postMessage(targetId, payload)
        commitMsgSeq(this.replyCtx, msgSeq)
        return res?.data?.msg_seq || null
      }
      return null
    } catch (err) {
      console.error(`[QQ] Failed to send message (type=${targetType}):`, err)
      // 被动回复失败时，尝试主动发送兜底（例如 msg_id 超时）
      if (targetType === 'c2c') {
        try {
          const res = await this.client.c2cApi.postMessage(targetId, {
            content,
            msg_type: 0,
          })
          return res?.data?.msg_seq || null
        } catch (fallbackErr) {
          console.error('[QQ] Fallback active send failed:', fallbackErr)
        }
      }
      return null
    }
  }

}
