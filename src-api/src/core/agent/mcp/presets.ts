/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         MCP 预设库                                      ║
 * ║                                                                        ║
 * ║  职责：提供常用 MCP 服务器的预设配置模板                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { McpServerConfig } from './types.js'

export interface McpPreset {
  id: string
  name: string
  description: string
  category: 'search' | 'coding' | 'data' | 'ai' | 'productivity'
  configTemplate: McpServerConfig
  /** 需要用户填写的凭证字段 */
  credentials: McpPresetCredential[]
}

export interface McpPresetCredential {
  key: string
  label: string
  placeholder: string
  sensitive: boolean
  /** 凭证值注入到配置中的路径：'headers.Authorization' | 'env.SOME_KEY' */
  target: string
  /** 值模板，用 {{value}} 占位，如 'Bearer {{value}}' */
  template?: string
}

export const MCP_PRESETS: McpPreset[] = [
  {
    id: 'zhipu-web-search',
    name: '智谱网页搜索',
    description: '通过智谱 API 进行网页搜索',
    category: 'search',
    configTemplate: {
      type: 'http',
      url: 'https://open.bigmodel.cn/api/mcp/web-search-prime/sse',
      headers: { Authorization: '' },
    },
    credentials: [
      {
        key: 'apiKey',
        label: '智谱 API Key',
        placeholder: '输入智谱 API Key',
        sensitive: true,
        target: 'headers.Authorization',
        template: 'Bearer {{value}}',
      },
    ],
  },
  {
    id: 'zhipu-web-reader',
    name: '智谱网页阅读',
    description: '通过智谱 API 读取网页内容',
    category: 'search',
    configTemplate: {
      type: 'http',
      url: 'https://open.bigmodel.cn/api/mcp/web-reader/sse',
      headers: { Authorization: '' },
    },
    credentials: [
      {
        key: 'apiKey',
        label: '智谱 API Key',
        placeholder: '输入智谱 API Key',
        sensitive: true,
        target: 'headers.Authorization',
        template: 'Bearer {{value}}',
      },
    ],
  },
  {
    id: 'zhipu-zread',
    name: '智谱文档阅读',
    description: '通过智谱 API 阅读文档和代码仓库',
    category: 'search',
    configTemplate: {
      type: 'http',
      url: 'https://open.bigmodel.cn/api/mcp/zread/sse',
      headers: { Authorization: '' },
    },
    credentials: [
      {
        key: 'apiKey',
        label: '智谱 API Key',
        placeholder: '输入智谱 API Key',
        sensitive: true,
        target: 'headers.Authorization',
        template: 'Bearer {{value}}',
      },
    ],
  },
  {
    id: 'zhipu-zai',
    name: '智谱 AI 综合服务',
    description: '智谱 AI MCP 服务器（stdio 模式）',
    category: 'ai',
    configTemplate: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'zai-mcp-server@latest'],
      env: { ZHIPUAI_API_KEY: '' },
    },
    credentials: [
      {
        key: 'apiKey',
        label: '智谱 API Key',
        placeholder: '输入智谱 API Key',
        sensitive: true,
        target: 'env.ZHIPUAI_API_KEY',
      },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'GitHub 仓库操作（issues、PR、搜索等）',
    category: 'coding',
    configTemplate: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
    },
    credentials: [
      {
        key: 'token',
        label: 'GitHub Personal Access Token',
        placeholder: 'ghp_xxxxxxxxxxxx',
        sensitive: true,
        target: 'env.GITHUB_PERSONAL_ACCESS_TOKEN',
      },
    ],
  },
  {
    id: 'filesystem',
    name: '本地文件系统',
    description: '读写本地文件系统',
    category: 'data',
    configTemplate: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    },
    credentials: [],
  },
  {
    id: 'puppeteer',
    name: '浏览器自动化',
    description: '通过 Puppeteer 控制浏览器',
    category: 'productivity',
    configTemplate: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    },
    credentials: [],
  },
  {
    id: 'sqlite',
    name: 'SQLite 数据库',
    description: '查询和管理 SQLite 数据库',
    category: 'data',
    configTemplate: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sqlite', ''],
    },
    credentials: [],
  },
]

/**
 * 将凭证值注入到预设配置模板中，返回新的配置对象
 */
export function applyCredentials(
  preset: McpPreset,
  credentialValues: Record<string, string>,
): McpServerConfig {
  // 深拷贝模板
  const config = JSON.parse(JSON.stringify(preset.configTemplate)) as McpServerConfig

  for (const cred of preset.credentials) {
    const rawValue = credentialValues[cred.key] || ''
    const value = cred.template ? cred.template.replace('{{value}}', rawValue) : rawValue

    const parts = cred.target.split('.')
    if (parts.length === 2) {
      const [section, key] = parts
      if (section === 'headers' && config.type === 'http') {
        config.headers = { ...config.headers, [key]: value }
      } else if (section === 'env' && config.type === 'stdio') {
        config.env = { ...config.env, [key]: value }
      }
    }
  }

  return config
}
