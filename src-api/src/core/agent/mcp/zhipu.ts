/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         智谱 MCP 服务器配置                               ║
 * ║                                                                          ║
 * ║  职责：定义智谱 API 的 MCP 服务器配置                                      ║
 * ║  设计：纯函数，无副作用，配置即数据                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       智谱 API 检测                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/**
 * 检测当前 API 是否为智谱 API
 *
 * 设计哲学：单一职责，只做检测，不做其他
 */
export function isZhipuApi(baseUrl?: string): boolean {
  return !!baseUrl && baseUrl.includes('open.bigmodel.cn')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       智谱 MCP 服务器配置构建                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/**
 * 构建智谱 MCP 服务器配置
 *
 * 包含四个服务器：
 * - web-search-prime: 网页搜索
 * - web-reader: 网页内容读取
 * - zread: 文档阅读
 * - zai-mcp-server: 智谱 AI 综合服务 (stdio)
 */
export function buildZhipuMcpServers(apiKey: string): Record<string, McpServerConfig> {
  const authHeader = { Authorization: `Bearer ${apiKey}` }

  return {
    'web-search-prime': {
      type: 'http',
      url: 'https://open.bigmodel.cn/api/mcp/web-search-prime/sse',
      headers: authHeader,
    },
    'web-reader': {
      type: 'http',
      url: 'https://open.bigmodel.cn/api/mcp/web-reader/sse',
      headers: authHeader,
    },
    'zread': {
      type: 'http',
      url: 'https://open.bigmodel.cn/api/mcp/zread/sse',
      headers: authHeader,
    },
    'zai-mcp-server': {
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'zai-mcp-server@latest'],
      env: { ZHIPUAI_API_KEY: apiKey },
    },
  }
}
