/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         沙盒 API 路由                                     ║
 * ║                                                                          ║
 * ║  职责：提供脚本执行的 HTTP API                                             ║
 * ║  端点：/api/sandbox/*                                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Hono } from 'hono'
import { getProvider, getSandboxRegistry } from '../core/sandbox/registry.js'
import { isUvAvailable, getUvPath } from '../core/sandbox/uv.js'
import type { ScriptExecOptions } from '../core/sandbox/types.js'

const app = new Hono()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           状态检查                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

app.get('/status', async (c) => {
  const registry = getSandboxRegistry()
  const uvAvailable = await isUvAvailable()
  const uvPath = getUvPath()
  const available = await registry.getAvailable()
  const registered = registry.getRegistered()

  return c.json({
    uv: {
      available: uvAvailable,
      path: uvPath,
    },
    providers: {
      registered,
      available,
    },
  })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           执行脚本                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

app.post('/run', async (c) => {
  let body: ScriptExecOptions & { provider?: string }

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: '无效的 JSON 请求体' }, 400)
  }

  const { scriptPath, workDir, args, env, timeout, packages, provider: providerType } = body

  if (!scriptPath || !workDir) {
    return c.json({ error: '缺少必要参数: scriptPath, workDir' }, 400)
  }

  try {
    const provider = await getProvider(providerType)
    if (!provider) {
      return c.json({ error: '没有可用的沙盒提供者' }, 500)
    }

    const result = await provider.runScript({
      scriptPath,
      workDir,
      args,
      env,
      timeout,
      packages,
    })

    return c.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({
      success: false,
      stdout: '',
      stderr: message,
      exitCode: 1,
      duration: 0,
      error: message,
    }, 500)
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           获取可用提供者                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */

app.get('/providers', async (c) => {
  const registry = getSandboxRegistry()
  const available = await registry.getAvailable()
  const registered = registry.getRegistered()

  return c.json({
    registered,
    available,
  })
})

export default app
