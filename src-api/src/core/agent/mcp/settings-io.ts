/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    MCP Settings 读写                                    ║
 * ║                                                                        ║
 * ║  职责：~/.claude/settings.json 的 MCP 服务器 CRUD                       ║
 * ║  设计：read-modify-write，保留非 MCP 配置项                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { McpServerConfig, McpServerEntry } from './types.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           路径常量                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function getClaudeDir(): string {
  return join(homedir(), '.claude')
}

function getClaudeSettingsPath(): string {
  return join(getClaudeDir(), 'settings.json')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       配置读取与写入                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export interface ClaudeSettings {
  mcpServers?: Record<string, McpServerConfig>
  [key: string]: unknown
}

export function readClaudeSettings(): ClaudeSettings {
  const settingsPath = getClaudeSettingsPath()
  if (!existsSync(settingsPath)) return {}

  try {
    const content = readFileSync(settingsPath, 'utf-8')
    return JSON.parse(content) as ClaudeSettings
  } catch {
    console.warn('[MCP] 无法解析 settings.json，将使用空配置')
    return {}
  }
}

export function writeClaudeSettings(settings: ClaudeSettings): void {
  const claudeDir = getClaudeDir()
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true })
  }
  writeFileSync(getClaudeSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       MCP CRUD 操作                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function listMcpServers(): McpServerEntry[] {
  const settings = readClaudeSettings()
  const servers = settings.mcpServers || {}

  return Object.entries(servers).map(([name, config]) => ({
    name,
    config,
    source: 'user' as const,
  }))
}

export function getMcpServer(name: string): McpServerEntry | null {
  const settings = readClaudeSettings()
  const config = settings.mcpServers?.[name]
  if (!config) return null

  return { name, config, source: 'user' }
}

export function upsertMcpServer(name: string, config: McpServerConfig): void {
  const settings = readClaudeSettings()
  const servers = settings.mcpServers || {}

  settings.mcpServers = { ...servers, [name]: config }
  writeClaudeSettings(settings)
  console.log(`[MCP] 已保存 MCP 服务器: ${name}`)
}

export function deleteMcpServer(name: string): boolean {
  const settings = readClaudeSettings()
  if (!settings.mcpServers?.[name]) return false

  const { [name]: _, ...rest } = settings.mcpServers
  settings.mcpServers = rest
  writeClaudeSettings(settings)
  console.log(`[MCP] 已删除 MCP 服务器: ${name}`)
  return true
}
