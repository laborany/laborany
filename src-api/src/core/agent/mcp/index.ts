/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         MCP 模块导出                                      ║
 * ║                                                                        ║
 * ║  职责：统一导出 MCP 相关功能                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

export type { McpServerConfig, McpStdioServerConfig, McpHttpServerConfig, McpServerEntry } from './types.js'
export { isZhipuApi, buildZhipuMcpServers } from './zhipu.js'
export { injectMcpServers, removeMcpServers } from './injector.js'
export { readClaudeSettings, writeClaudeSettings, listMcpServers, getMcpServer, upsertMcpServer, deleteMcpServer } from './settings-io.js'
export { MCP_PRESETS, applyCredentials } from './presets.js'
export { testMcpServer } from './tester.js'
