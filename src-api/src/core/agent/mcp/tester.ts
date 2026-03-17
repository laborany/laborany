/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         MCP 连接测试                                    ║
 * ║                                                                        ║
 * ║  职责：尽量复现 Claude Code CLI 的真实 MCP 握手过程                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { spawn, execSync } from 'child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sanitizeClaudeEnv, withUtf8Env, wrapCmdForUtf8 } from 'laborany-shared'
import type { McpServerConfig } from './types.js'

export interface McpTestResult {
  success: boolean
  message: string
  latencyMs?: number
}

interface McpServerStatus {
  name: string
  status: 'connected' | 'failed' | 'disabled' | 'connecting'
  reason?: string
}

interface ClaudeInitMessage {
  type?: string
  subtype?: string
  mcp_servers?: Array<{ name?: string; status?: string }>
}

const MCP_TEST_TIMEOUT_MS = 20_000

/**
 * 使用 Claude Code CLI 对单个 MCP server 执行真实握手测试。
 */
export async function testMcpServer(config: McpServerConfig, serverName = 'test-server'): Promise<McpTestResult> {
  const claudePath = findClaudeCodePath()
  if (!claudePath) {
    return {
      success: false,
      message: '未找到 Claude Code，可先安装并确保 `claude` 命令可用',
    }
  }

  const taskDir = mkdtempSync(join(tmpdir(), 'laborany-mcp-test-'))
  const start = Date.now()

  try {
    const configPath = join(taskDir, '.mcp-test.json')
    writeFileSync(configPath, JSON.stringify({
      mcpServers: {
        [serverName]: config,
      },
    }, null, 2), 'utf-8')

    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--dangerously-skip-permissions',
      '--strict-mcp-config',
      '--debug', 'mcp',
      '--mcp-config', configPath,
      '--',
      '请仅用一句话回答：MCP handshake test.',
    ]

    const env: Record<string, string | undefined> = sanitizeClaudeEnv(
      withUtf8Env({ ...process.env }),
    )

    const result = await runClaudeMcpHandshake({
      claudePath,
      args,
      env,
      serverName,
      timeoutMs: MCP_TEST_TIMEOUT_MS,
    })

    return {
      success: result.status === 'connected',
      message: formatHandshakeMessage(serverName, result),
      latencyMs: Date.now() - start,
    }
  } catch (err) {
    return {
      success: false,
      message: `测试失败: ${err instanceof Error ? err.message : String(err)}`,
      latencyMs: Date.now() - start,
    }
  } finally {
    rmSync(taskDir, { recursive: true, force: true })
  }
}

function findClaudeCodePath(): string | undefined {
  const os = process.platform
  const whichCmd = os === 'win32' ? 'where' : 'which'

  try {
    const result = execSync(wrapCmdForUtf8(`${whichCmd} claude`), { encoding: 'utf-8' }).trim()
    if (result) {
      const paths = result.split('\n').map(item => item.trim()).filter(Boolean)
      if (os === 'win32') {
        for (const item of paths) {
          if (item.endsWith('.cmd') && existsSync(item)) return item
        }
      }
      for (const item of paths) {
        if (existsSync(item)) return item
      }
    }
  } catch {
    // ignore lookup errors
  }

  const fallback = process.env.CLAUDE_CODE_PATH?.trim()
  if (fallback && existsSync(fallback)) return fallback
  return undefined
}

async function runClaudeMcpHandshake({
  claudePath,
  args,
  env,
  serverName,
  timeoutMs,
}: {
  claudePath: string
  args: string[]
  env: Record<string, string | undefined>
  serverName: string
  timeoutMs: number
}): Promise<McpServerStatus> {
  return await new Promise<McpServerStatus>((resolve) => {
    const proc = spawn(claudePath, args, {
      cwd: process.cwd(),
      env,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdoutBuffer = ''
    let stderrBuffer = ''
    let resolved = false
    let latestStatus: McpServerStatus = { name: serverName, status: 'connecting' }

    const finish = (status: McpServerStatus) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      resolve(status)
    }

    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      finish({
        name: serverName,
        status: 'failed',
        reason: latestStatus.reason || `握手超时（>${timeoutMs}ms）`,
      })
    }, timeoutMs)

    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf-8')
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() || ''

      for (const line of lines) {
        const parsed = parseInitStatusLine(line, serverName)
        if (!parsed) continue
        latestStatus = parsed
        if (parsed.status === 'connected' || parsed.status === 'disabled') {
          finish(parsed)
          return
        }
      }
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf-8')
      const lines = stderrBuffer.split('\n')
      stderrBuffer = lines.pop() || ''

      for (const line of lines) {
        const parsed = parseDebugStatusLine(line, serverName)
        if (!parsed) continue
        latestStatus = parsed
        if (parsed.status === 'failed') {
          finish(parsed)
          return
        }
      }
    })

    proc.on('close', (code) => {
      if (resolved) return
      if (latestStatus.status !== 'connecting') {
        finish(latestStatus)
        return
      }
      const stderrSnippet = stderrBuffer.trim().split('\n').filter(Boolean).slice(-3).join(' | ')
      finish({
        name: serverName,
        status: 'failed',
        reason: stderrSnippet || `Claude Code 退出码 ${code ?? 'unknown'}`,
      })
    })

    proc.on('error', (err) => {
      finish({
        name: serverName,
        status: 'failed',
        reason: err.message,
      })
    })
  })
}

function parseInitStatusLine(line: string, serverName: string): McpServerStatus | null {
  if (!line.trim()) return null

  try {
    const msg = JSON.parse(line) as ClaudeInitMessage
    if (msg.type !== 'system' || msg.subtype !== 'init' || !Array.isArray(msg.mcp_servers)) {
      return null
    }

    const target = msg.mcp_servers.find((server) => (server.name || '').trim() === serverName)
    if (!target) return null

    const status = (target.status || '').trim()
    if (status === 'connected' || status === 'failed' || status === 'disabled') {
      return { name: serverName, status }
    }
    return { name: serverName, status: 'connecting' }
  } catch {
    return null
  }
}

function parseDebugStatusLine(line: string, serverName: string): McpServerStatus | null {
  const trimmed = line.trim()
  if (!trimmed.includes(`MCP server "${serverName}"`)) return null

  const connectedMatch = trimmed.match(/MCP server "([^"]+)": Successfully connected/i)
  if (connectedMatch) {
    return { name: connectedMatch[1], status: 'connected' }
  }

  const failedMatch = trimmed.match(/MCP server "([^"]+)": (?:HTTP )?Connection failed(?: after \d+ms)?: (.+)$/i)
  if (failedMatch) {
    return {
      name: failedMatch[1],
      status: 'failed',
      reason: normalizeReason(failedMatch[2]),
    }
  }

  const errorMatch = trimmed.match(/MCP server "([^"]+)" Connection failed: (.+)$/i)
  if (errorMatch) {
    return {
      name: errorMatch[1],
      status: 'failed',
      reason: normalizeReason(errorMatch[2]),
    }
  }

  return null
}

function normalizeReason(reason: string): string {
  return reason
    .replace(/^Error:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatHandshakeMessage(serverName: string, status: McpServerStatus): string {
  if (status.status === 'connected') {
    return `Claude MCP 握手成功：${serverName} 已连接`
  }
  if (status.status === 'disabled') {
    return `Claude MCP 握手未启用：${serverName} 当前为 disabled`
  }
  if (status.status === 'failed') {
    return `Claude MCP 握手失败：${status.reason || serverName}`
  }
  return `Claude MCP 握手未完成：${serverName} 仍处于 connecting`
}
