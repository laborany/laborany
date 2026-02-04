/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     LaborAny 统一 API 服务                                ║
 * ║                                                                          ║
 * ║  技术栈：Hono + sql.js + jose                                            ║
 * ║  端口：3620（开发和生产）                                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { config } from 'dotenv'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs'
import { homedir } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       配置文件路径                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function isPackaged(): boolean {
  // pkg 打包后，process.execPath 指向 exe 文件
  // 开发模式下，process.execPath 指向 node.exe
  return !process.execPath.includes('node')
}

function getConfigDir(): string {
  if (isPackaged()) {
    const appDataDir = process.platform === 'win32'
      ? join(homedir(), 'AppData', 'Roaming', 'LaborAny')
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support', 'LaborAny')
        : join(homedir(), '.config', 'laborany')
    if (!existsSync(appDataDir)) {
      mkdirSync(appDataDir, { recursive: true })
    }
    return appDataDir
  }
  return resolve(__dirname, '../..')
}

function loadEnvConfig(): void {
  const configDir = getConfigDir()
  const envPath = join(configDir, '.env')

  // 如果用户配置不存在，从示例文件复制
  if (!existsSync(envPath)) {
    // API exe 在 resources/api/，.env.example 在 resources/
    const examplePath = join(dirname(process.execPath), '..', '.env.example')
    const devExamplePath = resolve(__dirname, '../../.env.example')

    if (existsSync(examplePath)) {
      copyFileSync(examplePath, envPath)
      console.log(`[Config] 已创建配置文件: ${envPath}`)
    } else if (existsSync(devExamplePath)) {
      copyFileSync(devExamplePath, envPath)
    }
  }

  // 加载配置
  config({ path: envPath })
  console.log(`[Config] 配置文件路径: ${envPath}`)
}

loadEnvConfig()

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from '@hono/node-server/serve-static'

import authRoutes from './routes/auth.js'
import skillRoutes from './routes/skill.js'
import workflowRoutes from './routes/workflow.js'
import fileRoutes from './routes/file.js'
import configRoutes from './routes/config.js'
import sessionRoutes from './routes/session.js'
import setupRoutes from './routes/setup.js'
import sandboxRoutes from './routes/sandbox.js'
import previewRoutes from './routes/preview.js'
import { initDb, closeDb } from './core/database.js'
import { registerAllProviders } from './providers/index.js'
import { stopAllProviders } from './core/sandbox/registry.js'

const app = new Hono()
const PORT = parseInt(process.env.PORT || '3620', 10)
const isProduction = process.env.NODE_ENV === 'production'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           中间件配置                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.use('*', cors())
app.use('*', logger())

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                         健康检查端点                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           路由挂载                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.route('/api/auth', authRoutes)
app.route('/api/skill', skillRoutes)
app.route('/api/workflow', workflowRoutes)
app.route('/api/config', configRoutes)
app.route('/api/sessions', sessionRoutes)
app.route('/api/setup', setupRoutes)
app.route('/api/sandbox', sandboxRoutes)
app.route('/api/preview', previewRoutes)
app.route('/api', fileRoutes)

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     Agent Service 代理                                    │
 * │  将 /agent-api/* 请求代理到 agent-service (端口 3002)                      │
 * │  增强：健康检查缓存 + 友好错误提示                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://localhost:3002'

/* ════════════════════════════════════════════════════════════════════════════
 *  Agent 服务健康状态缓存
 *  避免每次请求都检查健康状态，减少延迟
 * ════════════════════════════════════════════════════════════════════════════ */
let agentHealthy = false
let lastHealthCheck = 0
const HEALTH_CHECK_INTERVAL_MS = 3000

async function checkAgentHealth(): Promise<boolean> {
  const now = Date.now()
  if (agentHealthy && now - lastHealthCheck < HEALTH_CHECK_INTERVAL_MS) {
    return true
  }

  try {
    const res = await fetch(`${AGENT_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(2000)
    })
    agentHealthy = res.ok
    lastHealthCheck = now
    return agentHealthy
  } catch {
    agentHealthy = false
    return false
  }
}

app.all('/agent-api/*', async (c) => {
  /* ────────────────────────────────────────────────────────────────────────
   *  先检查 Agent 服务是否可用
   *  不可用时返回友好的 503 响应，包含重试建议
   * ──────────────────────────────────────────────────────────────────────── */
  const isAvailable = await checkAgentHealth()
  if (!isAvailable) {
    return c.json({
      error: 'Agent service is starting up',
      message: 'Agent 服务正在启动中，请稍后重试',
      retryAfter: 3
    }, 503)
  }

  const path = c.req.path.replace('/agent-api', '')
  const targetUrl = `${AGENT_SERVICE_URL}${path}`

  try {
    const headers = new Headers(c.req.raw.headers)
    headers.delete('host')

    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body: c.req.method !== 'GET' && c.req.method !== 'HEAD'
        ? c.req.raw.body
        : undefined,
      // @ts-ignore - duplex is needed for streaming
      duplex: 'half',
    })

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    })
  } catch (error) {
    console.error(`[Proxy] 代理请求失败: ${targetUrl}`, error)
    /* ────────────────────────────────────────────────────────────────────────
     *  请求失败时标记 Agent 为不健康，触发下次健康检查
     * ──────────────────────────────────────────────────────────────────────── */
    agentHealthy = false
    return c.json({
      error: 'Agent service unavailable',
      message: 'Agent 服务暂时不可用',
      retryAfter: 3
    }, 503)
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       静态文件服务（生产模式）                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getStaticRoot(): string {
  // 打包后的路径：与 exe 同级的 frontend 目录
  const pkgPath = join(dirname(process.execPath), 'frontend')
  if (existsSync(pkgPath)) return pkgPath

  // 开发模式：相对于源码的路径
  const devPath = resolve(__dirname, '../../frontend/dist')
  if (existsSync(devPath)) return devPath

  return ''
}

const staticRoot = getStaticRoot()

if (staticRoot) {
  console.log(`[LaborAny API] 静态文件目录: ${staticRoot}`)

  // 服务静态资源
  app.get('/assets/*', async (c) => {
    const filePath = join(staticRoot, c.req.path)
    if (existsSync(filePath)) {
      const content = readFileSync(filePath)
      const ext = filePath.split('.').pop() || ''
      const mimeTypes: Record<string, string> = {
        js: 'application/javascript',
        css: 'text/css',
        html: 'text/html',
        png: 'image/png',
        jpg: 'image/jpeg',
        svg: 'image/svg+xml',
        ico: 'image/x-icon',
      }
      return c.body(content, 200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      })
    }
    return c.notFound()
  })

  // SPA 回退：所有非 API 请求返回 index.html
  app.get('*', async (c) => {
    if (c.req.path.startsWith('/api') || c.req.path.startsWith('/agent-api')) {
      return c.notFound()
    }
    const indexPath = join(staticRoot, 'index.html')
    if (existsSync(indexPath)) {
      const content = readFileSync(indexPath, 'utf-8')
      return c.html(content)
    }
    return c.notFound()
  })
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           启动服务                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

async function main() {
  // 初始化数据库（sql.js 需要异步初始化）
  await initDb()

  // 注册沙盒提供者
  registerAllProviders()

  console.log(`[LaborAny API] 启动中...`)

  serve({
    fetch: app.fetch,
    port: PORT,
  }, (info) => {
    console.log(`[LaborAny API] 运行在 http://localhost:${info.port}`)
  })
}

main().catch((err) => {
  console.error('[LaborAny API] 启动失败:', err)
  process.exit(1)
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           优雅关闭                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
process.on('SIGINT', async () => {
  console.log('[LaborAny API] 正在关闭...')
  await stopAllProviders()
  closeDb()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('[LaborAny API] 正在关闭...')
  await stopAllProviders()
  closeDb()
  process.exit(0)
})
