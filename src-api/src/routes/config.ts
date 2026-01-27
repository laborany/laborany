/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         配置管理 API 路由                                 ║
 * ║                                                                          ║
 * ║  端点：读取配置、更新配置                                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Hono } from 'hono'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const config = new Hono()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取配置目录                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getConfigDir(): string {
  const appDataDir = process.platform === 'win32'
    ? join(homedir(), 'AppData', 'Roaming', 'LaborAny')
    : process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support', 'LaborAny')
      : join(homedir(), '.config', 'laborany')

  if (!existsSync(appDataDir)) {
    mkdirSync(appDataDir, { recursive: true })
  }
  return appDataDir
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       解析 .env 文件                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()

    // 移除引号
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    result[key] = value
  }

  return result
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       生成 .env 文件内容                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function generateEnvContent(config: Record<string, string>): string {
  const lines: string[] = [
    '# LaborAny 配置文件',
    '# 此文件由应用自动管理，也可手动编辑',
    ''
  ]

  for (const [key, value] of Object.entries(config)) {
    lines.push(`${key}=${value}`)
  }

  return lines.join('\n')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取配置                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
config.get('/', (c) => {
  const configDir = getConfigDir()
  const envPath = join(configDir, '.env')

  let envConfig: Record<string, string> = {}

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8')
    envConfig = parseEnvFile(content)
  }

  // 返回配置（隐藏敏感信息的完整值）
  const safeConfig: Record<string, { value: string; masked: string }> = {}

  for (const [key, value] of Object.entries(envConfig)) {
    const isSensitive = key.toLowerCase().includes('key') ||
                        key.toLowerCase().includes('secret') ||
                        key.toLowerCase().includes('password')

    safeConfig[key] = {
      value: value,
      masked: isSensitive && value.length > 8
        ? value.slice(0, 4) + '****' + value.slice(-4)
        : value
    }
  }

  return c.json({
    configDir,
    envPath,
    config: safeConfig
  })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       更新配置                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
config.post('/', async (c) => {
  const { config: newConfig } = await c.req.json<{ config: Record<string, string> }>()

  if (!newConfig || typeof newConfig !== 'object') {
    return c.json({ error: '无效的配置数据' }, 400)
  }

  const configDir = getConfigDir()
  const envPath = join(configDir, '.env')

  // 读取现有配置
  let existingConfig: Record<string, string> = {}
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8')
    existingConfig = parseEnvFile(content)
  }

  // 合并配置（新值覆盖旧值）
  const mergedConfig = { ...existingConfig, ...newConfig }

  // 移除空值
  for (const key of Object.keys(mergedConfig)) {
    if (mergedConfig[key] === '' || mergedConfig[key] === null) {
      delete mergedConfig[key]
    }
  }

  // 写入文件
  const content = generateEnvContent(mergedConfig)
  writeFileSync(envPath, content, 'utf-8')

  // 更新环境变量（立即生效）
  for (const [key, value] of Object.entries(mergedConfig)) {
    process.env[key] = value
  }

  return c.json({
    success: true,
    message: '配置已保存，部分设置可能需要重启应用生效',
    envPath
  })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取配置模板                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
config.get('/template', (c) => {
  const template = {
    ANTHROPIC_API_KEY: {
      description: 'Anthropic API 密钥',
      required: true,
      placeholder: 'sk-ant-api03-...',
      sensitive: true
    },
    ANTHROPIC_BASE_URL: {
      description: 'Anthropic API 基础 URL（可选，用于代理）',
      required: false,
      placeholder: 'https://api.anthropic.com',
      sensitive: false
    },
    ANTHROPIC_MODEL: {
      description: 'Anthropic 模型名称',
      required: false,
      placeholder: 'claude-sonnet-4-20250514',
      sensitive: false
    },
    PORT: {
      description: 'API 服务端口',
      required: false,
      placeholder: '3620',
      sensitive: false
    },
    LABORANY_SECRET_KEY: {
      description: 'JWT 签名密钥（用于用户认证）',
      required: false,
      placeholder: 'your-secret-key',
      sensitive: true
    }
  }

  return c.json({ template })
})

export default config
