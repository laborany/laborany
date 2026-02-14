/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         初始化设置 API 路由                               ║
 * ║                                                                          ║
 * ║  端点：首启状态检查、API 配置校验、完成首启                                ║
 * ║  支持：环境检测 + API 在线验证 + 本地 profile                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Hono } from 'hono'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { homedir, platform } from 'os'
import { execSync, spawnSync } from 'child_process'
import { wrapCmdForUtf8 } from 'laborany-shared'
import {
  getConfigDir,
  getEnvPath,
  getProfilePath,
  readEnvConfig,
  writeEnvConfig,
  readLocalProfile,
  writeLocalProfile,
} from '../lib/app-config.js'

const setup = new Hono()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       检查内置 CLI Bundle                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getBundledClaudePath(): { node: string; cli: string } | null {
  const os = platform()
  const exeDir = dirname(process.execPath)

  const candidates = [
    join(exeDir, '..', 'resources', 'cli-bundle'),
    join(exeDir, 'resources', 'cli-bundle'),
    join(exeDir, '..', 'cli-bundle'),
  ]

  for (const bundleDir of candidates) {
    const nodeBin = os === 'win32'
      ? join(bundleDir, 'node.exe')
      : join(bundleDir, 'node')
    const cliJs = join(bundleDir, 'deps', '@anthropic-ai', 'claude-code', 'cli.js')

    if (existsSync(nodeBin) && existsSync(cliJs)) {
      console.log(`[Setup] 找到内置 CLI Bundle: ${bundleDir}`)
      return { node: nodeBin, cli: cliJs }
    }
  }

  return null
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       查找系统安装的 Claude Code                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function findClaudeCodePath(): string | undefined {
  const os = platform()
  const whichCmd = os === 'win32' ? 'where' : 'which'

  try {
    const result = execSync(wrapCmdForUtf8(`${whichCmd} claude`), { encoding: 'utf-8' }).trim()
    if (result) {
      const paths = result.split('\n').map(p => p.trim())
      if (os === 'win32') {
        for (const p of paths) {
          if (p.endsWith('.cmd') && existsSync(p)) return p
        }
      }
      for (const p of paths) {
        if (existsSync(p)) return p
      }
    }
  } catch { /* not found */ }

  const home = homedir()
  const possiblePaths = os === 'win32'
    ? [
        join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
        join(home, 'AppData', 'Local', 'Programs', 'claude', 'claude.exe'),
      ]
    : [
        '/usr/local/bin/claude',
        '/opt/homebrew/bin/claude',
        join(home, '.local', 'bin', 'claude'),
        join(home, '.npm-global', 'bin', 'claude'),
      ]

  for (const p of possiblePaths) {
    if (existsSync(p)) return p
  }

  if (process.env.CLAUDE_CODE_PATH && existsSync(process.env.CLAUDE_CODE_PATH)) {
    return process.env.CLAUDE_CODE_PATH
  }

  return undefined
}

interface SetupClaudeCliLaunch {
  command: string
  argsPrefix: string[]
  shell: boolean
  source: 'bundled' | 'system'
}

function resolveSetupClaudeCliLaunch(): SetupClaudeCliLaunch | null {
  const bundled = getBundledClaudePath()
  if (bundled) {
    return {
      command: bundled.node,
      argsPrefix: [bundled.cli],
      shell: false,
      source: 'bundled',
    }
  }

  const systemPath = findClaudeCodePath()
  if (!systemPath) {
    return null
  }

  const isCmdShim = platform() === 'win32' && systemPath.toLowerCase().endsWith('.cmd')
  return {
    command: systemPath,
    argsPrefix: [],
    shell: isCmdShim,
    source: 'system',
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       使用 Claude Code CLI 校验 API Key                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function normalizeBaseUrl(baseUrl?: string): string {
  if (!baseUrl || !baseUrl.trim()) return 'https://api.anthropic.com'
  return baseUrl.trim().replace(/\/+$/, '')
}

function sanitizeModel(model?: string): string {
  return (model || '').trim() || 'claude-sonnet-4-20250514'
}

async function validateAnthropicConfig(params: {
  apiKey: string
  baseUrl?: string
  model?: string
}): Promise<{ success: boolean; message: string; diagnostic?: string }> {
  const apiKey = params.apiKey.trim()
  const baseUrl = normalizeBaseUrl(params.baseUrl)
  const model = sanitizeModel(params.model)

  if (!apiKey) {
    return { success: false, message: 'ANTHROPIC_API_KEY 不能为空' }
  }

  const cliLaunch = resolveSetupClaudeCliLaunch()
  if (!cliLaunch) {
    return { success: false, message: '未检测到可用的 Claude Code CLI' }
  }

  try {
    const env: Record<string, string | undefined> = { ...process.env }
    env.ANTHROPIC_API_KEY = apiKey
    env.ANTHROPIC_MODEL = model
    if (baseUrl) {
      env.ANTHROPIC_BASE_URL = baseUrl
    } else {
      delete env.ANTHROPIC_BASE_URL
    }
    delete env.ANTHROPIC_AUTH_TOKEN

    const args = [...cliLaunch.argsPrefix, '--print', '--dangerously-skip-permissions', '--model', model]
    const prompt = 'Reply with exactly: OK'

    const result = spawnSync(cliLaunch.command, args, {
      shell: cliLaunch.shell,
      env,
      input: prompt,
      encoding: 'utf-8',
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    })

    const stdout = (result.stdout || '').toString()
    const stderr = (result.stderr || '').toString()
    const diagnostic = `${stderr}\n${stdout}`.trim().slice(0, 500)

    if (result.error) {
      if (result.error.message.toLowerCase().includes('timed out')) {
        return {
          success: false,
          message: 'Claude CLI 校验超时，请检查网络或代理设置',
          diagnostic: result.error.message,
        }
      }
      return {
        success: false,
        message: 'Claude CLI 校验执行失败',
        diagnostic: result.error.message,
      }
    }

    if ((result.status ?? 1) !== 0) {
      const authLike = /auth|authentication|unauthor|invalid api|api key|401|403/i.test(diagnostic)
      return {
        success: false,
        message: authLike
          ? 'API Key 无效或认证失败（CLI）'
          : `Claude CLI 校验失败（退出码 ${result.status ?? 1}）`,
        diagnostic,
      }
    }

    return {
      success: true,
      message: `API 连接验证通过（Claude CLI/${cliLaunch.source}）`,
      diagnostic,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    return {
      success: false,
      message: '无法通过 Claude CLI 验证配置，请检查网络和 Base URL',
      diagnostic: message,
    }
  }
}

function computeSetupStatus() {
  const bundled = getBundledClaudePath()
  const systemPath = bundled ? null : findClaudeCodePath()
  const environmentReady = Boolean(bundled || systemPath)

  const envConfig = readEnvConfig()
  const apiConfigReady = Boolean((envConfig.ANTHROPIC_API_KEY || '').trim())
  const profile = readLocalProfile()
  const profileReady = Boolean(profile?.name?.trim())

  const errors: string[] = []
  if (!environmentReady) {
    errors.push('未检测到 Claude Code CLI（内置或系统安装）')
  }
  if (!apiConfigReady) {
    errors.push('未配置 ANTHROPIC_API_KEY')
  }
  if (!profileReady) {
    errors.push('未设置用户名称')
  }

  return {
    ready: environmentReady && apiConfigReady && profileReady,
    steps: {
      environment: environmentReady,
      apiConfig: apiConfigReady,
      profile: profileReady,
    },
    claudeCode: {
      installed: environmentReady,
      path: bundled?.cli || systemPath || null,
      bundled: Boolean(bundled),
    },
    envPath: getEnvPath(),
    profilePath: getProfilePath(),
    configDir: getConfigDir(),
    profile,
    errors,
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       检查设置状态                                        │
 * │  环境检测 + API 配置 + 用户 profile                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
setup.get('/status', (c) => {
  return c.json(computeSetupStatus())
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       在线校验 API 配置                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
setup.post('/validate-api', async (c) => {
  const body = await c.req.json<{
    ANTHROPIC_API_KEY?: string
    ANTHROPIC_BASE_URL?: string
    ANTHROPIC_MODEL?: string
  }>()

  const result = await validateAnthropicConfig({
    apiKey: body.ANTHROPIC_API_KEY || '',
    baseUrl: body.ANTHROPIC_BASE_URL,
    model: body.ANTHROPIC_MODEL,
  })

  if (!result.success) {
    return c.json(result, 400)
  }

  return c.json(result)
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       完成首启流程                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
setup.post('/complete', async (c) => {
  const body = await c.req.json<{
    config?: Record<string, string>
    profile?: { name?: string }
  }>()

  const cfg = body.config || {}
  const name = (body.profile?.name || '').trim()

  const apiKey = (cfg.ANTHROPIC_API_KEY || '').trim()
  if (!apiKey) {
    return c.json({ success: false, error: 'ANTHROPIC_API_KEY 不能为空' }, 400)
  }
  if (!name) {
    return c.json({ success: false, error: '用户名称不能为空' }, 400)
  }

  const validation = await validateAnthropicConfig({
    apiKey,
    baseUrl: cfg.ANTHROPIC_BASE_URL,
    model: cfg.ANTHROPIC_MODEL,
  })
  if (!validation.success) {
    return c.json({
      success: false,
      error: validation.message,
      diagnostic: validation.diagnostic,
    }, 400)
  }

  const merged = {
    ...readEnvConfig(),
    ...cfg,
    ANTHROPIC_API_KEY: apiKey,
  }

  for (const key of Object.keys(merged)) {
    if (merged[key] === '' || merged[key] === null) {
      delete merged[key]
    }
  }

  writeEnvConfig(merged)
  for (const [key, value] of Object.entries(merged)) {
    process.env[key] = value
  }
  const profile = writeLocalProfile(name)

  return c.json({
    success: true,
    message: '首启配置完成',
    status: computeSetupStatus(),
    profile,
    envPath: getEnvPath(),
  })
})

export default setup
