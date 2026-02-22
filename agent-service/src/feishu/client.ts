/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     飞书 SDK 客户端工厂                                  ║
 * ║                                                                        ║
 * ║  职责：创建 Lark REST Client 和 WebSocket Client                       ║
 * ║  设计：单账号模式，精简自 openclaw 多账号逻辑                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import * as Lark from '@larksuiteoapi/node-sdk'
import type { FeishuConfig } from './config.js'
import { resolveFeishuDomain } from './config.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     REST API 客户端                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function createLarkClient(config: FeishuConfig): Lark.Client {
  return new Lark.Client({
    appId: config.appId,
    appSecret: config.appSecret,
    domain: resolveFeishuDomain(config.domain),
    logger: {
      debug: (msg) => console.debug('[Lark SDK]', msg),
      info: (msg) => console.log('[Lark SDK]', msg),
      warn: (msg) => console.warn('[Lark SDK]', msg),
      error: (msg) => console.error('[Lark SDK]', msg),
      trace: (msg) => console.debug('[Lark SDK trace]', msg),
    },
  })
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     WebSocket 长连接客户端                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function createLarkWsClient(config: FeishuConfig): Lark.WSClient {
  return new Lark.WSClient({
    appId: config.appId,
    appSecret: config.appSecret,
    domain: resolveFeishuDomain(config.domain) as any,
    loggerLevel: Lark.LoggerLevel.warn,
  })
}
