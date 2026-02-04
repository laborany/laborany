/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         MCP 模块导出                                      ║
 * ║                                                                          ║
 * ║  职责：统一导出 MCP 相关功能                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

export { isZhipuApi, buildZhipuMcpServers } from './zhipu.js'
export { injectMcpServers, removeMcpServers } from './injector.js'
export type { McpServerConfig, McpStdioServerConfig, McpHttpServerConfig } from './zhipu.js'
