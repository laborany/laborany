/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    MCP 前端类型定义                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

export interface McpStdioServerConfig {
  type: 'stdio'
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface McpHttpServerConfig {
  type: 'http'
  url: string
  headers?: Record<string, string>
}

export type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig

export interface McpServerEntry {
  name: string
  config: McpServerConfig
  source: 'user' | 'preset' | 'auto'
}

export interface McpPresetCredential {
  key: string
  label: string
  placeholder: string
  sensitive: boolean
  target: string
  template?: string
}

export interface McpPreset {
  id: string
  name: string
  description: string
  category: 'search' | 'coding' | 'data' | 'ai' | 'productivity'
  configTemplate: McpServerConfig
  credentials: McpPresetCredential[]
  installed: boolean
}

export interface McpTestResult {
  success: boolean
  message: string
  latencyMs?: number
}
