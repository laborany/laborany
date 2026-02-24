import { Hono } from 'hono'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { homedir } from 'node:os'
import {
  getConfigDir,
  getEnvPath,
  getProfilePath,
  readEnvConfig,
  writeEnvConfig,
  writeLocalProfile,
  readLocalProfile,
} from '../lib/app-config.js'
import { getAppHomeDir, getMigrationReportPath } from '../lib/app-home.js'
import { getAppLoggerStatus } from '../lib/app-logger.js'

const config = new Hono()

interface RuntimeApplyResponse {
  success: boolean
  summary?: string
  warnings?: string[]
  modules?: unknown
  error?: string
}

interface TemplateField {
  label: string
  description: string
  required: boolean
  placeholder: string
  sensitive: boolean
  group: 'model' | 'feishu' | 'email' | 'system' | 'advanced'
  order: number
  dependsOnKey?: string
  dependsOnValue?: string
}

interface TemplateGroup {
  id: 'model' | 'feishu' | 'email' | 'system' | 'advanced'
  title: string
  description: string
}

function buildTemplateGroups(): TemplateGroup[] {
  return [
    {
      id: 'model',
      title: '模型服务',
      description: 'LaborAny 调用大模型所需的核心配置（建议优先完成）',
    },
    {
      id: 'feishu',
      title: '飞书 Bot',
      description: '用于将任务从飞书会话接入 LaborAny，并回传文本与文件结果',
    },
    {
      id: 'email',
      title: '邮件通知',
      description: '用于任务完成或失败时发送邮件通知',
    },
    {
      id: 'system',
      title: '系统参数',
      description: '应用端口和密钥等运行参数',
    },
    {
      id: 'advanced',
      title: '高级配置',
      description: '不常用或定制化环境变量',
    },
  ]
}

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase()
  return (
    k.includes('key') ||
    k.includes('secret') ||
    k.includes('password') ||
    k.includes('token') ||
    k.includes('pass')
  )
}

function diffChangedKeys(prev: Record<string, string>, next: Record<string, string>): string[] {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
  const changed: string[] = []
  for (const key of keys) {
    if ((prev[key] || '') !== (next[key] || '')) {
      changed.push(key)
    }
  }
  return changed
}

function normalizeComparablePath(input: string): string {
  const resolved = resolve(input)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function isSamePath(a: string, b: string): boolean {
  return normalizeComparablePath(a) === normalizeComparablePath(b)
}

function isSubPath(parentPath: string, candidatePath: string): boolean {
  const parent = normalizeComparablePath(parentPath)
  const candidate = normalizeComparablePath(candidatePath)
  if (parent === candidate) return false
  return candidate.startsWith(`${parent}/`) || candidate.startsWith(`${parent}\\`)
}

function normalizeHomePathInput(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  if (trimmed === '~') return homedir()
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return resolve(homedir(), trimmed.slice(2))
  }
  return trimmed
}

async function applyAgentRuntimeConfig(changedKeys: string[]): Promise<{
  applied: boolean
  result?: RuntimeApplyResponse
  error?: string
}> {
  const base = process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:3002'
  try {
    const res = await fetch(`${base}/runtime/apply-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'settings-save',
        changedKeys,
      }),
      signal: AbortSignal.timeout(5000),
    })

    const raw = await res.json() as RuntimeApplyResponse
    if (!res.ok) {
      return {
        applied: false,
        error: raw?.error || raw?.summary || `runtime apply failed (${res.status})`,
      }
    }

    return {
      applied: Boolean(raw?.success),
      result: raw,
      error: raw?.success ? undefined : (raw?.error || raw?.summary || 'runtime apply failed'),
    }
  } catch (error) {
    return {
      applied: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function buildTemplate(): Record<string, TemplateField> {
  return {
    ANTHROPIC_API_KEY: {
      label: 'Anthropic API Key',
      description: '用于访问模型服务的密钥',
      required: true,
      placeholder: 'sk-ant-api03-...',
      sensitive: true,
      group: 'model',
      order: 10,
    },
    ANTHROPIC_BASE_URL: {
      label: 'Anthropic Base URL',
      description: '模型服务地址（可选，默认官方地址）',
      required: false,
      placeholder: 'https://api.anthropic.com',
      sensitive: false,
      group: 'model',
      order: 20,
    },
    ANTHROPIC_MODEL: {
      label: '模型名称',
      description: '使用的模型标识（例如 claude-sonnet-4-20250514）',
      required: false,
      placeholder: 'claude-sonnet-4-20250514',
      sensitive: false,
      group: 'model',
      order: 30,
    },
    PORT: {
      label: 'API 服务端口',
      description: '本地 API 服务监听端口',
      required: false,
      placeholder: '3620',
      sensitive: false,
      group: 'system',
      order: 10,
    },
    LABORANY_SECRET_KEY: {
      label: 'LABORANY_SECRET_KEY',
      description: '本地鉴权签名密钥',
      required: false,
      placeholder: 'your-secret-key',
      sensitive: true,
      group: 'system',
      order: 20,
    },
    NOTIFICATION_EMAIL: {
      label: '通知收件邮箱',
      description: '接收任务通知的邮箱地址',
      required: false,
      placeholder: 'your@email.com',
      sensitive: false,
      group: 'email',
      order: 10,
    },
    NOTIFY_ON_SUCCESS: {
      label: '任务成功时通知',
      description: '任务成功后是否发送邮件（true/false）',
      required: false,
      placeholder: 'true',
      sensitive: false,
      group: 'email',
      order: 20,
    },
    NOTIFY_ON_ERROR: {
      label: '任务失败时通知',
      description: '任务失败后是否发送邮件（true/false）',
      required: false,
      placeholder: 'true',
      sensitive: false,
      group: 'email',
      order: 30,
    },
    SMTP_HOST: {
      label: 'SMTP 主机',
      description: '例如 smtp.qq.com / smtp.163.com / smtp.gmail.com',
      required: false,
      placeholder: 'smtp.qq.com',
      sensitive: false,
      group: 'email',
      order: 40,
    },
    SMTP_PORT: {
      label: 'SMTP 端口',
      description: '常见端口 465（SSL）或 587（TLS）',
      required: false,
      placeholder: '465',
      sensitive: false,
      group: 'email',
      order: 50,
    },
    SMTP_USER: {
      label: 'SMTP 用户名',
      description: '通常为完整邮箱地址',
      required: false,
      placeholder: 'your@qq.com',
      sensitive: false,
      group: 'email',
      order: 60,
    },
    SMTP_PASS: {
      label: 'SMTP 授权码',
      description: '邮箱授权码或应用专用密码（不是邮箱登录密码）',
      required: false,
      placeholder: 'app-password',
      sensitive: true,
      group: 'email',
      order: 70,
    },
    FEISHU_ENABLED: {
      label: '启用飞书 Bot',
      description: '开启后，允许飞书消息触发任务（true/false）',
      required: false,
      placeholder: 'false',
      sensitive: false,
      group: 'feishu',
      order: 10,
    },
    FEISHU_APP_ID: {
      label: '飞书 App ID',
      description: '飞书开放平台应用的 App ID',
      required: false,
      placeholder: 'cli_xxxxxxxxxx',
      sensitive: false,
      group: 'feishu',
      order: 20,
      dependsOnKey: 'FEISHU_ENABLED',
      dependsOnValue: 'true',
    },
    FEISHU_APP_SECRET: {
      label: '飞书 App Secret',
      description: '飞书开放平台应用的 App Secret',
      required: false,
      placeholder: '',
      sensitive: true,
      group: 'feishu',
      order: 30,
      dependsOnKey: 'FEISHU_ENABLED',
      dependsOnValue: 'true',
    },
    FEISHU_DOMAIN: {
      label: '飞书域名',
      description: '中国区填 feishu，国际版填 lark',
      required: false,
      placeholder: 'feishu',
      sensitive: false,
      group: 'feishu',
      order: 40,
      dependsOnKey: 'FEISHU_ENABLED',
      dependsOnValue: 'true',
    },
    FEISHU_ALLOW_USERS: {
      label: '允许用户列表',
      description: '允许访问的 open_id，多个用逗号分隔',
      required: false,
      placeholder: 'ou_xxx,ou_yyy',
      sensitive: false,
      group: 'feishu',
      order: 50,
      dependsOnKey: 'FEISHU_ENABLED',
      dependsOnValue: 'true',
    },
    FEISHU_REQUIRE_ALLOWLIST: {
      label: '强制白名单',
      description: '是否要求允许用户列表不能为空（true/false）',
      required: false,
      placeholder: 'false',
      sensitive: false,
      group: 'feishu',
      order: 60,
      dependsOnKey: 'FEISHU_ENABLED',
      dependsOnValue: 'true',
    },
    FEISHU_BOT_NAME: {
      label: 'Bot 显示名称',
      description: '飞书消息与卡片中显示的名称（建议不用 emoji）',
      required: false,
      placeholder: 'LaborAny',
      sensitive: false,
      group: 'feishu',
      order: 70,
      dependsOnKey: 'FEISHU_ENABLED',
      dependsOnValue: 'true',
    },
    FEISHU_DEFAULT_SKILL: {
      label: '默认执行技能',
      description: '未匹配到具体技能时使用的默认技能 ID',
      required: false,
      placeholder: '__generic__',
      sensitive: false,
      group: 'feishu',
      order: 80,
      dependsOnKey: 'FEISHU_ENABLED',
      dependsOnValue: 'true',
    },
  }
}

config.get('/', (c) => {
  const loggerStatus = getAppLoggerStatus()
  const envConfig = readEnvConfig()
  const safeConfig: Record<string, { value: string; masked: string }> = {}

  for (const [key, value] of Object.entries(envConfig)) {
    safeConfig[key] = {
      value,
      masked: isSensitiveKey(key) && value.length > 8
        ? `${value.slice(0, 4)}****${value.slice(-4)}`
        : value,
    }
  }

  return c.json({
    appHome: getAppHomeDir(),
    configDir: getConfigDir(),
    envPath: getEnvPath(),
    profilePath: getProfilePath(),
    logsDir: loggerStatus.logRoot,
    logsFallbackActive: loggerStatus.fallbackActive,
    logsFallbackReason: loggerStatus.fallbackReason,
    migrationReportPath: getMigrationReportPath(),
    profile: readLocalProfile(),
    config: safeConfig,
  })
})

config.post('/', async (c) => {
  const { config: newConfig, profileName } = await c.req.json<{
    config: Record<string, string>
    profileName?: string
  }>()

  if (!newConfig || typeof newConfig !== 'object') {
    return c.json({ error: 'Invalid config payload' }, 400)
  }

  const existingConfig = readEnvConfig()
  const mergedConfig = { ...existingConfig, ...newConfig }

  for (const key of Object.keys(mergedConfig)) {
    if (mergedConfig[key] === '' || mergedConfig[key] === null) {
      delete mergedConfig[key]
    }
  }

  // Storage home is managed by desktop runtime command flow.
  delete mergedConfig.LABORANY_HOME
  delete mergedConfig.LABORANY_LOG_DIR

  writeEnvConfig(mergedConfig)

  for (const key of Object.keys(existingConfig)) {
    if (!(key in mergedConfig)) {
      delete process.env[key]
    }
  }
  for (const [key, value] of Object.entries(mergedConfig)) {
    process.env[key] = value
  }

  const changedKeys = diffChangedKeys(existingConfig, mergedConfig)
  const applyResult = await applyAgentRuntimeConfig(changedKeys)

  if (typeof profileName === 'string' && profileName.trim()) {
    writeLocalProfile(profileName)
  }

  return c.json({
    success: true,
    applied: applyResult.applied,
    message: applyResult.applied
      ? 'Configuration saved and applied.'
      : `Configuration saved, but runtime apply failed: ${applyResult.error || 'unknown error'}`,
    envPath: getEnvPath(),
    profilePath: getProfilePath(),
    profile: readLocalProfile(),
    changedKeys,
    applyResult: applyResult.result || null,
    applyError: applyResult.error || null,
  })
})

config.post('/storage/home', async (c) => {
  let payload: { homePath?: string } = {}
  try {
    payload = await c.req.json<{ homePath?: string }>()
  } catch {
    payload = {}
  }

  const requestedHome = normalizeHomePathInput(payload.homePath || '')
  if (!requestedHome) {
    return c.json({ error: 'homePath is required' }, 400)
  }

  if (!isAbsolute(requestedHome)) {
    return c.json({ error: 'homePath must be an absolute path' }, 400)
  }

  const targetHome = resolve(requestedHome)
  const currentHome = getAppHomeDir()
  if (isSamePath(currentHome, targetHome)) {
    return c.json({ error: 'homePath is already active' }, 400)
  }

  if (isSubPath(currentHome, targetHome) || isSubPath(targetHome, currentHome)) {
    return c.json({ error: 'homePath cannot overlap current app home path' }, 400)
  }

  const commandPath = (process.env.LABORANY_RUNTIME_COMMAND_PATH || '').trim()
  if (!commandPath) {
    return c.json({
      error: 'runtime command channel unavailable (launch from desktop app)',
    }, 400)
  }

  try {
    mkdirSync(dirname(commandPath), { recursive: true })
    writeFileSync(commandPath, JSON.stringify({
      type: 'switch-home',
      targetHome,
      requestedAt: new Date().toISOString(),
      source: 'settings-ui',
    }, null, 2), 'utf-8')
  } catch (error) {
    return c.json({
      error: `failed to write runtime command: ${error instanceof Error ? error.message : String(error)}`,
    }, 500)
  }

  // Runtime home is managed by Electron main process (runtime-meta + command processing).
  // Avoid writing LABORANY_HOME into current .env here, otherwise API may report switched
  // path before Electron runtime actually switches.
  try {
    const existingConfig = readEnvConfig()
    const nextConfig = { ...existingConfig }
    delete nextConfig.LABORANY_HOME
    delete nextConfig.LABORANY_LOG_DIR
    writeEnvConfig(nextConfig)
  } catch {
    // non-fatal: continue restart flow
  }

  setTimeout(() => {
    process.exit(75)
  }, 800)

  return c.json({
    success: true,
    message: 'Storage path switch requested, sidecar services are restarting.',
    targetHome,
  }, 202)
})

config.get('/template', (c) => {
  return c.json({
    template: buildTemplate(),
    groups: buildTemplateGroups(),
  })
})

export default config
