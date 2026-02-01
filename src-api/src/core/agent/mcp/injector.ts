/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         MCP 配置注入器                                    ║
 * ║                                                                          ║
 * ║  职责：将 MCP 服务器配置注入到 ~/.claude/settings.json                     ║
 * ║  设计：幂等操作，安全合并，不破坏现有配置                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { McpServerConfig } from './zhipu.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           路径常量                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getClaudeSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json')
}

function getClaudeDir(): string {
  return join(homedir(), '.claude')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       配置读取与写入                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */

interface ClaudeSettings {
  mcpServers?: Record<string, McpServerConfig>
  [key: string]: unknown
}

/**
 * 读取现有的 Claude 设置
 *
 * 设计：容错处理，文件不存在或解析失败时返回空对象
 */
function readClaudeSettings(): ClaudeSettings {
  const settingsPath = getClaudeSettingsPath()

  if (!existsSync(settingsPath)) {
    return {}
  }

  try {
    const content = readFileSync(settingsPath, 'utf-8')
    return JSON.parse(content) as ClaudeSettings
  } catch {
    console.warn('[MCP] 无法解析 settings.json，将使用空配置')
    return {}
  }
}

/**
 * 写入 Claude 设置
 *
 * 设计：确保目录存在，格式化输出便于人工检查
 */
function writeClaudeSettings(settings: ClaudeSettings): void {
  const claudeDir = getClaudeDir()
  const settingsPath = getClaudeSettingsPath()

  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true })
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

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
