/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         MCP 连接测试                                    ║
 * ║                                                                        ║
 * ║  职责：测试 MCP 服务器的可达性                                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { spawnSync } from 'child_process'
import type { McpServerConfig } from './types.js'

export interface McpTestResult {
  success: boolean
  message: string
  latencyMs?: number
}

/**
 * 测试 MCP 服务器连接
 */
export async function testMcpServer(config: McpServerConfig): Promise<McpTestResult> {
  if (config.type === 'http') {
    return testHttpServer(config.url, config.headers)
  }
  return testStdioServer(config.command)
}

async function testHttpServer(
  url: string,
  headers?: Record<string, string>,
): Promise<McpTestResult> {
  const start = Date.now()

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(url, {
      method: 'GET',
      headers: headers || {},
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const latencyMs = Date.now() - start

    if (res.ok || res.status === 405) {
      // 405 is acceptable — server exists but doesn't accept GET
      return { success: true, message: `连接成功 (${latencyMs}ms)`, latencyMs }
    }

    return {
      success: false,
      message: `服务器返回 HTTP ${res.status}`,
      latencyMs,
    }
  } catch (err) {
    const latencyMs = Date.now() - start
    const message = err instanceof Error && err.name === 'AbortError'
      ? '连接超时 (10s)'
      : `连接失败: ${err instanceof Error ? err.message : String(err)}`

    return { success: false, message, latencyMs }
  }
}

function testStdioServer(command: string): McpTestResult {
  try {
    const result = spawnSync(
      process.platform === 'win32' ? 'where' : 'which',
      [command],
      { timeout: 5000, encoding: 'utf-8' },
    )

    if (result.status === 0) {
      const path = (result.stdout || '').trim().split('\n')[0]
      return { success: true, message: `命令可用: ${path}` }
    }

    // For npx-based commands, check if npx itself is available
    if (command === 'npx' || command === 'node') {
      return { success: true, message: `${command} 将在运行时通过 npx 安装` }
    }

    return { success: false, message: `命令 "${command}" 未找到，请确认已安装` }
  } catch {
    return { success: false, message: `检测命令 "${command}" 时出错` }
  }
}
