/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    MCP Settings 读写                                    ║
 * ║                                                                        ║
 * ║  职责：~/.claude/laborany-mcp.json 的 MCP 服务器 CRUD                  ║
 * ║  设计：laborany 专用 MCP 配置，不污染 Claude Code 的 settings.json      ║
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

function getLaboranyMcpPath(): string {
  return join(getClaudeDir(), 'laborany-mcp.json')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       配置读取与写入                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export interface LaboranyMcpConfig {
  mcpServers: Record<string, McpServerConfig>
}

export function readClaudeSettings(): LaboranyMcpConfig {
  const mcpPath = getLaboranyMcpPath()
  if (!existsSync(mcpPath)) return { mcpServers: {} }

  try {
    const content = readFileSync(mcpPath, 'utf-8')
    const parsed = JSON.parse(content) as Partial<LaboranyMcpConfig>
    return { mcpServers: parsed.mcpServers || {} }
  } catch {
    console.warn('[MCP] 无法解析 laborany-mcp.json，将使用空配置')
    return { mcpServers: {} }
  }
}

export function writeClaudeSettings(config: LaboranyMcpConfig): void {
  const claudeDir = getClaudeDir()
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true })
  }
  writeFileSync(getLaboranyMcpPath(), JSON.stringify(config, null, 2), 'utf-8')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       MCP CRUD 操作                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function listMcpServers(): McpServerEntry[] {
  const config = readClaudeSettings()
  const servers = config.mcpServers

  return Object.entries(servers).map(([name, config]) => ({
    name,
    config,
    source: 'user' as const,
  }))
}

export function getMcpServer(name: string): McpServerEntry | null {
  const config = readClaudeSettings()
  const serverConfig = config.mcpServers[name]
  if (!serverConfig) return null

  return { name, config: serverConfig, source: 'user' }
}

export function upsertMcpServer(name: string, serverConfig: McpServerConfig): void {
  const config = readClaudeSettings()
  config.mcpServers[name] = serverConfig
  writeClaudeSettings(config)
  console.log(`[MCP] 已保存 MCP 服务器: ${name}`)
}

export function deleteMcpServer(name: string): boolean {
  const config = readClaudeSettings()
  if (!config.mcpServers[name]) return false

  delete config.mcpServers[name]
  writeClaudeSettings(config)
  console.log(`[MCP] 已删除 MCP 服务器: ${name}`)
  return true
}
