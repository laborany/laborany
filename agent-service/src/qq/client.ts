/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     QQ Bot SDK 客户端工厂                                ║
 * ║                                                                        ║
 * ║  职责：创建 QQ Bot REST Client 和 WebSocket Client                      ║
 * ║  设计：单账号模式，参考飞书 Bot 架构                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { createOpenAPI, createWebsocket, AvailableIntentsEventsEnum } from 'qq-bot-sdk'
import type { QQConfig } from './config.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     REST API 客户端                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function createQQClient(config: QQConfig): any {
  return createOpenAPI({
    appID: config.appId,
    token: config.token || '',
    sandbox: config.sandbox,
    secret: config.secret,
  })
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     WebSocket 长连接客户端                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function createQQWsClient(config: QQConfig): any {
  // 仅监听 C2C 私聊相关事件
  const intents: AvailableIntentsEventsEnum[] = [
    AvailableIntentsEventsEnum.GROUP_AND_C2C_EVENT, // C2C 私聊消息
  ]

  return createWebsocket({
    appID: config.appId,
    token: config.token || '',
    secret: config.secret,
    sandbox: config.sandbox,
    intents,
    maxRetry: 5,
  })
}
