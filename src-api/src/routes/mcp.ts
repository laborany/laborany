/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         MCP API 路由                                    ║
 * ║                                                                        ║
 * ║  职责：MCP 服务器的 CRUD + 测试 + 预设管理                               ║
 * ║  注意：静态路由（/presets）必须在参数路由（/:name）之前注册                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Hono } from 'hono'
import {
  listMcpServers,
  getMcpServer,
  upsertMcpServer,
  deleteMcpServer,
} from '../core/agent/mcp/settings-io.js'
import { testMcpServer } from '../core/agent/mcp/tester.js'
import { MCP_PRESETS, applyCredentials } from '../core/agent/mcp/presets.js'
import type { McpServerConfig } from '../core/agent/mcp/types.js'

const mcpRoutes = new Hono()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  GET /api/mcp — 列出所有 MCP 服务器                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
mcpRoutes.get('/', (c) => {
  try {
    const servers = listMcpServers()
    return c.json({ success: true, servers })
  } catch (err) {
    console.error('[MCP Route] 列出服务器失败:', err)
    return c.json({ success: false, error: '读取 MCP 配置失败' }, 500)
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  POST /api/mcp — 添加/更新服务器                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
mcpRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json<{ name: string; config: McpServerConfig }>()

    if (!body.name?.trim()) {
      return c.json({ success: false, error: '服务器名称不能为空' }, 400)
    }
    if (!body.config?.type) {
      return c.json({ success: false, error: '缺少服务器配置' }, 400)
    }

    if (body.config.type === 'http' && !body.config.url?.trim()) {
      return c.json({ success: false, error: 'HTTP 服务器缺少 URL' }, 400)
    }
    if (body.config.type === 'stdio' && !body.config.command?.trim()) {
      return c.json({ success: false, error: 'Stdio 服务器缺少命令' }, 400)
    }

    upsertMcpServer(body.name.trim(), body.config)
    return c.json({ success: true, message: `MCP 服务器 "${body.name}" 已保存` })
  } catch (err) {
    console.error('[MCP Route] 保存服务器失败:', err)
    return c.json({ success: false, error: '保存 MCP 配置失败' }, 500)
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  GET /api/mcp/presets — 列出预设（标记已安装）                              │
 * │  静态路由，必须在 /:name 之前注册                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
mcpRoutes.get('/presets', (c) => {
  try {
    const installed = listMcpServers()
    const installedNames = new Set(installed.map(s => s.name))

    const presets = MCP_PRESETS.map(preset => ({
      ...preset,
      installed: installedNames.has(preset.id),
    }))

    return c.json({ success: true, presets })
  } catch (err) {
    console.error('[MCP Route] 列出预设失败:', err)
    return c.json({ success: false, error: '读取预设失败' }, 500)
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  POST /api/mcp/presets/apply — 安装预设                                   │
 * │  静态路由，必须在 /:name 之前注册                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
mcpRoutes.post('/presets/apply', async (c) => {
  try {
    const body = await c.req.json<{ presetId: string; credentials: Record<string, string> }>()

    const preset = MCP_PRESETS.find(p => p.id === body.presetId)
    if (!preset) {
      return c.json({ success: false, error: `预设 "${body.presetId}" 不存在` }, 404)
    }

    // 验证必填凭证
    for (const cred of preset.credentials) {
      if (!(body.credentials?.[cred.key] || '').trim()) {
        return c.json({ success: false, error: `缺少凭证: ${cred.label}` }, 400)
      }
    }

    const config = applyCredentials(preset, body.credentials || {})
    upsertMcpServer(preset.id, config)

    return c.json({ success: true, message: `预设 "${preset.name}" 已安装` })
  } catch (err) {
    console.error('[MCP Route] 安装预设失败:', err)
    return c.json({ success: false, error: '安装预设失败' }, 500)
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  DELETE /api/mcp/:name — 删除服务器                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
mcpRoutes.delete('/:name', (c) => {
  try {
    const name = c.req.param('name')
    const deleted = deleteMcpServer(name)

    if (!deleted) {
      return c.json({ success: false, error: `服务器 "${name}" 不存在` }, 404)
    }

    return c.json({ success: true, message: `MCP 服务器 "${name}" 已删除` })
  } catch (err) {
    console.error('[MCP Route] 删除服务器失败:', err)
    return c.json({ success: false, error: '删除 MCP 配置失败' }, 500)
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  POST /api/mcp/:name/test — 测试服务器连接                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */
mcpRoutes.post('/:name/test', async (c) => {
  try {
    const name = c.req.param('name')
    const server = getMcpServer(name)

    if (!server) {
      return c.json({ success: false, error: `服务器 "${name}" 不存在` }, 404)
    }

    const result = await testMcpServer(server.config)
    return c.json(result)
  } catch (err) {
    console.error('[MCP Route] 测试服务器失败:', err)
    return c.json({ success: false, message: '测试请求失败' }, 500)
  }
})

export default mcpRoutes
