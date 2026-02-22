/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     飞书 Bot 配置模块                                    ║
 * ║                                                                        ║
 * ║  职责：从环境变量读取飞书配置，提供域名解析                              ║
 * ║  设计：纯函数 + 类型定义，零副作用                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     域名常量与解析                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */

const FEISHU_DOMAIN = 'https://open.feishu.cn'
const LARK_DOMAIN = 'https://open.larksuite.com'

type DomainType = 'feishu' | 'lark'

const DOMAIN_MAP: Record<DomainType, string> = {
  feishu: FEISHU_DOMAIN,
  lark: LARK_DOMAIN,
}

export function resolveFeishuDomain(domain: DomainType): string {
  return DOMAIN_MAP[domain]
}

export function resolveFeishuApiBase(domain: DomainType): string {
  return `${DOMAIN_MAP[domain]}/open-apis`
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     配置类型与加载                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export interface FeishuConfig {
  appId: string
  appSecret: string
  allowUsers: string[]
  requireAllowlist: boolean
  domain: DomainType
  botName: string
  defaultSkillId: string
}

/**
 * 从环境变量加载飞书配置
 * 返回 null 表示未启用或缺少必要凭证
 */
export function loadFeishuConfig(): FeishuConfig | null {
  if (process.env.FEISHU_ENABLED !== 'true') return null

  const appId = process.env.FEISHU_APP_ID?.trim()
  const appSecret = process.env.FEISHU_APP_SECRET?.trim()
  if (!appId || !appSecret) return null

  const rawDomain = (process.env.FEISHU_DOMAIN || 'feishu').trim().toLowerCase()
  const domain: DomainType = rawDomain === 'lark' ? 'lark' : 'feishu'

  const allowUsers = (process.env.FEISHU_ALLOW_USERS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  return {
    appId,
    appSecret,
    allowUsers,
    requireAllowlist: process.env.FEISHU_REQUIRE_ALLOWLIST === 'true',
    domain,
    botName: process.env.FEISHU_BOT_NAME?.trim() || 'LaborAny',
    defaultSkillId: process.env.FEISHU_DEFAULT_SKILL?.trim() || '__generic__',
  }
}
