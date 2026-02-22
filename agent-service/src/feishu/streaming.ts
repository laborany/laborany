/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     飞书流式卡片模块                                     ║
 * ║                                                                        ║
 * ║  职责：创建/更新/关闭飞书 CardKit 流式卡片                              ║
 * ║  来源：移植自 openclaw streaming-card.ts                                ║
 * ║  改动：去掉 getChildLogger → console；去掉 accountConfig → 直接传参    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { Client } from '@larksuiteoapi/node-sdk'
import { resolveFeishuApiBase } from './config.js'
import type { FeishuConfig } from './config.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     类型定义                                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */

type DomainType = FeishuConfig['domain']

interface StreamingCardState {
  cardId: string
  messageId: string
  sequence: number
  elementId: string
  currentText: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     Tenant Access Token 缓存                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */

const tokenCache = new Map<string, { token: string; expiresAt: number }>()

async function getTenantAccessToken(
  appId: string,
  appSecret: string,
  domain: DomainType,
): Promise<string> {
  const cacheKey = `${domain}|${appId}`
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

  const apiBase = resolveFeishuApiBase(domain)
  const res = await fetch(`${apiBase}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  })

  const result = (await res.json()) as {
    code: number
    msg: string
    tenant_access_token?: string
    expire?: number
  }

  if (result.code !== 0 || !result.tenant_access_token) {
    throw new Error(`获取 tenant_access_token 失败: ${result.msg}`)
  }

  tokenCache.set(cacheKey, {
    token: result.tenant_access_token,
    expiresAt: Date.now() + (result.expire ?? 7200) * 1000,
  })

  return result.tenant_access_token
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     卡片生命周期：创建 → 发送 → 更新 → 关闭             │
 * └──────────────────────────────────────────────────────────────────────────┘ */

async function createStreamingCard(
  appId: string,
  appSecret: string,
  domain: DomainType,
  title?: string,
): Promise<string> {
  const cardJson = {
    schema: '2.0',
    ...(title ? { header: { title: { content: title, tag: 'plain_text' } } } : {}),
    config: {
      streaming_mode: true,
      summary: { content: '[Generating...]' },
      streaming_config: {
        print_frequency_ms: { default: 50 },
        print_step: { default: 2 },
        print_strategy: 'fast',
      },
    },
    body: {
      elements: [{
        tag: 'markdown',
        content: '⏳ Thinking...',
        element_id: 'streaming_content',
      }],
    },
  }

  const apiBase = resolveFeishuApiBase(domain)
  const token = await getTenantAccessToken(appId, appSecret, domain)
  const res = await fetch(`${apiBase}/cardkit/v1/cards`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'card_json', data: JSON.stringify(cardJson) }),
  })

  const result = (await res.json()) as {
    code: number
    msg: string
    data?: { card_id: string }
  }

  if (result.code !== 0 || !result.data?.card_id) {
    throw new Error(`创建流式卡片失败: ${result.msg}`)
  }

  return result.data.card_id
}

async function sendStreamingCard(
  client: Client,
  chatId: string,
  cardId: string,
): Promise<string> {
  const content = JSON.stringify({ type: 'card', data: { card_id: cardId } })
  const res = await client.im.message.create({
    params: { receive_id_type: 'chat_id' },
    data: { receive_id: chatId, msg_type: 'interactive', content },
  })

  if (res.code !== 0 || !res.data?.message_id) {
    throw new Error(`发送流式卡片失败: ${res.msg}`)
  }

  return res.data.message_id
}

async function updateCardText(
  appId: string,
  appSecret: string,
  domain: DomainType,
  cardId: string,
  elementId: string,
  text: string,
  sequence: number,
): Promise<void> {
  const apiBase = resolveFeishuApiBase(domain)
  const token = await getTenantAccessToken(appId, appSecret, domain)
  const res = await fetch(
    `${apiBase}/cardkit/v1/cards/${cardId}/elements/${elementId}/content`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: text,
        sequence,
        uuid: `stream_${cardId}_${sequence}`,
      }),
    },
  )

  const result = (await res.json()) as { code: number; msg: string }
  if (result.code !== 0) {
    console.warn(`[Feishu] 更新卡片文本失败: ${result.msg}`)
  }
}

async function closeStreaming(
  appId: string,
  appSecret: string,
  domain: DomainType,
  cardId: string,
  sequence: number,
  summary?: string,
): Promise<void> {
  const settings = {
    config: {
      streaming_mode: false,
      summary: { content: summary || '' },
    },
  }

  const apiBase = resolveFeishuApiBase(domain)
  const token = await getTenantAccessToken(appId, appSecret, domain)
  const res = await fetch(`${apiBase}/cardkit/v1/cards/${cardId}/settings`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      settings: JSON.stringify(settings),
      sequence,
      uuid: `close_${cardId}_${sequence}`,
    }),
  })

  const result = (await res.json()) as { code: number; msg: string }
  if (result.code !== 0) {
    console.warn(`[Feishu] 关闭流式模式失败: ${result.msg}`)
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     工具函数                                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function truncateForSummary(text: string, maxLen = 50): string {
  if (!text) return ''
  const cleaned = text.replace(/\n/g, ' ').trim()
  return cleaned.length <= maxLen ? cleaned : cleaned.slice(0, maxLen - 3) + '...'
}

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     FeishuStreamingSession                              ║
 * ║                                                                        ║
 * ║  高层封装：创建 → 流式更新 → 关闭，队列化防并发                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

export class FeishuStreamingSession {
  private client: Client
  private appId: string
  private appSecret: string
  private domain: DomainType
  private state: StreamingCardState | null = null
  private updateQueue: Promise<void> = Promise.resolve()
  private closed = false

  constructor(client: Client, config: FeishuConfig) {
    this.client = client
    this.appId = config.appId
    this.appSecret = config.appSecret
    this.domain = config.domain
  }

  async start(chatId: string, title?: string): Promise<boolean> {
    if (this.state) return false

    try {
      const cardId = await createStreamingCard(this.appId, this.appSecret, this.domain, title)
      const messageId = await sendStreamingCard(this.client, chatId, cardId)

      this.state = {
        cardId,
        messageId,
        sequence: 1,
        elementId: 'streaming_content',
        currentText: '',
      }

      console.log(`[Feishu] 流式卡片已创建: card=${cardId}, msg=${messageId}`)
      return true
    } catch (err) {
      console.error(`[Feishu] 创建流式卡片失败:`, err)
      return false
    }
  }

  async update(text: string): Promise<void> {
    if (!this.state || this.closed) return

    this.updateQueue = this.updateQueue.then(async () => {
      if (!this.state || this.closed) return

      this.state.currentText = text
      this.state.sequence += 1

      try {
        await updateCardText(
          this.appId, this.appSecret, this.domain,
          this.state.cardId, this.state.elementId,
          text, this.state.sequence,
        )
      } catch (err) {
        console.debug(`[Feishu] 卡片更新失败（将重试）:`, err)
      }
    })

    await this.updateQueue
  }

  async close(finalText?: string, summary?: string): Promise<void> {
    if (!this.state || this.closed) return
    this.closed = true

    await this.updateQueue

    const text = finalText ?? this.state.currentText
    this.state.sequence += 1

    try {
      if (text) {
        await updateCardText(
          this.appId, this.appSecret, this.domain,
          this.state.cardId, this.state.elementId,
          text, this.state.sequence,
        )
      }

      this.state.sequence += 1
      await closeStreaming(
        this.appId, this.appSecret, this.domain,
        this.state.cardId, this.state.sequence,
        summary ?? truncateForSummary(text),
      )

      console.log(`[Feishu] 流式卡片已关闭: card=${this.state.cardId}`)
    } catch (err) {
      console.error(`[Feishu] 关闭流式卡片失败:`, err)
    }
  }

  isActive(): boolean {
    return this.state !== null && !this.closed
  }
}
