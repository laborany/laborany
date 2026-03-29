export interface ConfigItem {
  value: string
  masked: string
}

export type ConfigGroupId = 'model' | 'wechat' | 'feishu' | 'qq' | 'email' | 'system' | 'advanced'

export interface ConfigTemplate {
  label?: string
  description: string
  required: boolean
  placeholder: string
  sensitive: boolean
  group?: ConfigGroupId
  order?: number
  dependsOnKey?: string
  dependsOnValue?: string
}

export interface TemplateGroup {
  id: ConfigGroupId
  title: string
  description: string
}

export interface ConfigResponse {
  appHome?: string
  config?: Record<string, ConfigItem>
  envPath?: string
  profilePath?: string
  logsDir?: string
  logsFallbackActive?: boolean
  logsFallbackReason?: string
  migrationReportPath?: string
  profile?: { name?: string }
}

export interface SaveConfigResponse {
  success?: boolean
  message?: string
  error?: string
  profile?: { name?: string }
  applied?: boolean
  applyError?: string | null
}

export interface ApplyRuntimeResponse {
  success?: boolean
  summary?: string
  error?: string
}

export interface StorageHomeSwitchResponse {
  success?: boolean
  message?: string
  error?: string
  targetHome?: string
}

export type BannerType = 'success' | 'error' | 'warning'

export type SettingsSection = 'profile' | 'model' | 'storage' | 'integration' | 'system' | 'tools'

export interface WechatPublicAccount {
  accountId: string
  rawAccountId: string
  userId?: string
  savedAt: string
}

export interface WechatStatusResponse {
  enabled: boolean
  running: boolean
  loggedIn: boolean
  credentialSource: 'env' | 'file' | null
  loginPending: boolean
  account: WechatPublicAccount | null
  config?: {
    enabled: boolean
    baseUrl: string
    cdnBaseUrl: string
    storedAccountsCount: number
  }
}

export interface WechatTestResponse {
  success?: boolean
  message?: string
  error?: string
}

export interface WechatLoginResponse {
  success: boolean
  sessionKey: string
  status: 'ready' | 'wait' | 'scaned' | 'confirmed' | 'expired' | 'cancelled' | 'failed'
  message: string
  qrcodeDataUrl?: string
  account?: WechatPublicAccount
}

export const BOOLEAN_KEYS = new Set([
  'WECHAT_ENABLED',
  'WECHAT_REQUIRE_ALLOWLIST',
  'FEISHU_ENABLED',
  'FEISHU_REQUIRE_ALLOWLIST',
  'QQ_ENABLED',
  'QQ_SANDBOX',
  'QQ_REQUIRE_ALLOWLIST',
  'NOTIFY_ON_SUCCESS',
  'NOTIFY_ON_ERROR',
])

export const DEFAULT_GROUPS: TemplateGroup[] = [
  { id: 'model', title: '模型服务', description: '配置 API Key、Base URL 和模型名称。' },
  { id: 'wechat', title: '微信 Bot', description: '开启微信 ClawBot 接入，并支持扫码绑定。' },
  { id: 'feishu', title: '飞书 Bot', description: '开启飞书会话接入与文件回传能力。' },
  { id: 'qq', title: 'QQ Bot', description: '开启 QQ C2C 私聊接入能力。' },
  { id: 'email', title: '邮件通知', description: '任务执行完成后通过邮件通知。' },
  { id: 'system', title: '系统参数', description: '端口、密钥等系统级配置。' },
  { id: 'advanced', title: '高级配置', description: '自定义或不常用环境变量。' },
]
