import { Hono } from 'hono'
import {
  getConfigDir,
  getEnvPath,
  getProfilePath,
  readEnvConfig,
  writeEnvConfig,
  writeLocalProfile,
  readLocalProfile,
} from '../lib/app-config.js'
import { getMigrationReportPath } from '../lib/app-home.js'
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
  description: string
  required: boolean
  placeholder: string
  sensitive: boolean
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
      description: 'Anthropic API key',
      required: true,
      placeholder: 'sk-ant-api03-...',
      sensitive: true,
    },
    ANTHROPIC_BASE_URL: {
      description: 'Anthropic API base URL (optional)',
      required: false,
      placeholder: 'https://api.anthropic.com',
      sensitive: false,
    },
    ANTHROPIC_MODEL: {
      description: 'Anthropic model name',
      required: false,
      placeholder: 'claude-sonnet-4-20250514',
      sensitive: false,
    },
    PORT: {
      description: 'API service port',
      required: false,
      placeholder: '3620',
      sensitive: false,
    },
    LABORANY_SECRET_KEY: {
      description: 'JWT signing key',
      required: false,
      placeholder: 'your-secret-key',
      sensitive: true,
    },
    NOTIFICATION_EMAIL: {
      description: 'Email address for cron notifications',
      required: false,
      placeholder: 'your@email.com',
      sensitive: false,
    },
    NOTIFY_ON_SUCCESS: {
      description: 'Send notification when task succeeds (true/false)',
      required: false,
      placeholder: 'true',
      sensitive: false,
    },
    NOTIFY_ON_ERROR: {
      description: 'Send notification when task fails (true/false)',
      required: false,
      placeholder: 'true',
      sensitive: false,
    },
    SMTP_HOST: {
      description: 'SMTP host, e.g. smtp.qq.com / smtp.163.com / smtp.gmail.com',
      required: false,
      placeholder: 'smtp.qq.com',
      sensitive: false,
    },
    SMTP_PORT: {
      description: 'SMTP port, commonly 465 or 587',
      required: false,
      placeholder: '465',
      sensitive: false,
    },
    SMTP_USER: {
      description: 'SMTP username, usually the full email address',
      required: false,
      placeholder: 'your@qq.com',
      sensitive: false,
    },
    SMTP_PASS: {
      description: 'SMTP auth password / app password',
      required: false,
      placeholder: 'app-password',
      sensitive: true,
    },
    FEISHU_ENABLED: {
      description: 'Enable Feishu bot (true/false)',
      required: false,
      placeholder: 'false',
      sensitive: false,
    },
    FEISHU_APP_ID: {
      description: 'Feishu app id',
      required: false,
      placeholder: 'cli_xxxxxxxxxx',
      sensitive: false,
    },
    FEISHU_APP_SECRET: {
      description: 'Feishu app secret',
      required: false,
      placeholder: '',
      sensitive: true,
    },
    FEISHU_DOMAIN: {
      description: 'feishu for CN, lark for global',
      required: false,
      placeholder: 'feishu',
      sensitive: false,
    },
    FEISHU_ALLOW_USERS: {
      description: 'Allowed open_id list separated by comma',
      required: false,
      placeholder: 'ou_xxx,ou_yyy',
      sensitive: false,
    },
    FEISHU_REQUIRE_ALLOWLIST: {
      description: 'Require allowlist to be non-empty (true/false)',
      required: false,
      placeholder: 'false',
      sensitive: false,
    },
    FEISHU_BOT_NAME: {
      description: 'Bot display name in Feishu cards',
      required: false,
      placeholder: 'LaborAny',
      sensitive: false,
    },
    FEISHU_DEFAULT_SKILL: {
      description: 'Fallback skill id for general execution',
      required: false,
      placeholder: '__generic__',
      sensitive: false,
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

config.get('/template', (c) => {
  return c.json({ template: buildTemplate() })
})

export default config
