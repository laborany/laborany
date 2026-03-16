/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         MCP 配置注入器                                    ║
 * ║                                                                        ║
 * ║  职责：将 MCP 服务器配置注入到 ~/.claude/settings.json                     ║
 * ║  设计：幂等操作，安全合并，不破坏现有配置                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { McpServerConfig } from './types.js'
import { readClaudeSettings, writeClaudeSettings } from './settings-io.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       MCP 配置注入                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/**
 * 注入 MCP 服务器配置到 ~/.claude/settings.json
 *
 * 设计哲学：
 * - 幂等：多次调用结果相同
 * - 合并：不覆盖用户已有配置
 * - 透明：日志记录所有操作
 */
export function injectMcpServers(servers: Record<string, McpServerConfig>): void {
  const settings = readClaudeSettings()
  const existingServers = settings.mcpServers || {}

  // 合并配置：新配置覆盖同名旧配置
  const mergedServers = { ...existingServers, ...servers }

  // 检查是否有变化
  const newServerNames = Object.keys(servers)
  const addedServers = newServerNames.filter(name => !existingServers[name])

  if (addedServers.length === 0) {
    console.log('[MCP] 智谱 MCP 服务器配置已存在，无需更新')
    return
  }

  settings.mcpServers = mergedServers
  writeClaudeSettings(settings)

  console.log(`[MCP] 已注入智谱 MCP 服务器: ${addedServers.join(', ')}`)
}

/**
 * 移除指定的 MCP 服务器配置
 *
 * 设计：可选功能，用于清理不再需要的配置
 */
export function removeMcpServers(serverNames: string[]): void {
  const settings = readClaudeSettings()

  if (!settings.mcpServers) {
    return
  }

  const removedServers: string[] = []

  for (const name of serverNames) {
    if (settings.mcpServers[name]) {
      delete settings.mcpServers[name]
      removedServers.push(name)
    }
  }

  if (removedServers.length > 0) {
    writeClaudeSettings(settings)
    console.log(`[MCP] 已移除 MCP 服务器: ${removedServers.join(', ')}`)
  }
}
