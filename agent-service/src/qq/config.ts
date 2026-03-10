/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     QQ Bot 配置模块                                      ║
 * ║                                                                        ║
 * ║  职责：从环境变量读取 QQ Bot 配置                                        ║
 * ║  设计：纯函数 + 类型定义，零副作用                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     配置类型与加载                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export interface QQConfig {
  appId: string
  token?: string
  secret?: string
  sandbox: boolean
  allowUsers: string[]
  requireAllowlist: boolean
  botName: string
  defaultSkillId: string
}

function sanitizeBotName(name: string): string {
  const normalized = name
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\uFFFD/g, '')
    .trim()
  return normalized || 'LaborAny'
}

/**
 * 从环境变量加载 QQ Bot 配置
 * 返回 null 表示未启用或缺少必要凭证
 */
export function loadQQConfig(): QQConfig | null {
  if (process.env.QQ_ENABLED !== 'true') return null

  const appId = process.env.QQ_APP_ID?.trim()
  const token = process.env.QQ_BOT_TOKEN?.trim()
  const secret = process.env.QQ_APP_SECRET?.trim()
  if (!appId) return null
  if (!token && !secret) return null

  const sandbox = process.env.QQ_SANDBOX === 'true'

  const allowUsers = (process.env.QQ_ALLOW_USERS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  return {
    appId,
    token,
    secret,
    sandbox,
    allowUsers,
    requireAllowlist: process.env.QQ_REQUIRE_ALLOWLIST === 'true',
    botName: sanitizeBotName(process.env.QQ_BOT_NAME?.trim() || 'LaborAny'),
    defaultSkillId: process.env.QQ_DEFAULT_SKILL?.trim() || '__generic__',
  }
}
