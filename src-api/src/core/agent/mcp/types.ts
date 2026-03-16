/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         MCP 类型定义                                    ║
 * ║                                                                        ║
 * ║  职责：统一 MCP 服务器配置的类型定义                                      ║
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
