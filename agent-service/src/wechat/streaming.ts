import type { WechatConfig } from './config.js'
import { sendWechatTextChunks } from './push.js'

interface StreamingState {
  accountId: string
  toUserId: string
  contextToken: string
  currentText: string
}

export class WechatStreamingSession {
  private state: StreamingState | null = null
  private closed = false

  constructor(private readonly config: WechatConfig) {}

  async start(params: {
    accountId: string
    toUserId: string
    contextToken: string
    title?: string
  }): Promise<void> {
    if (this.state) return

    this.state = {
      accountId: params.accountId,
      toUserId: params.toUserId,
      contextToken: params.contextToken,
      currentText: '',
    }

    const placeholder = params.title?.trim() ? `${params.title.trim()}...` : '处理中...'
    await sendWechatTextChunks(this.config, params.toUserId, placeholder, {
      accountId: params.accountId,
      contextToken: params.contextToken,
    })
  }

  async update(text: string): Promise<void> {
    if (!this.state || this.closed) return
    this.state.currentText = text
  }

  async close(finalText?: string): Promise<void> {
    if (!this.state || this.closed) return
    this.closed = true

    const text = (finalText ?? this.state.currentText).trim() || '✅ 已完成'
    await sendWechatTextChunks(this.config, this.state.toUserId, text, {
      accountId: this.state.accountId,
      contextToken: this.state.contextToken,
    })
  }
}
