/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║         Web Research — Internal API Routes                             ║
 * ║                                                                        ║
 * ║  挂载到 agent-service Express app 的 /_internal/web-research 路径       ║
 * ║  MCP Server 通过 loopback HTTP 调用这些路由                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Router } from 'express'
import { mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, isAbsolute, join } from 'path'
import type { Request } from 'express'
import type { WebResearchRuntime } from '../runtime.js'
import type { ResearchRequestContext } from '../backends/types.js'
import { resolveModelProfile } from '../../lib/resolve-model-profile.js'

const PROFILE_CACHE_TTL_MS = 60_000
const profileCache = new Map<string, { expiresAt: number; value: Awaited<ReturnType<typeof resolveModelProfile>> }>()

export function createWebResearchRouter(runtime: WebResearchRuntime): Router {
  const router = Router()

  // POST /search
  router.post('/search', async (req, res) => {
    try {
      const { query, language, recency, site, sites, engine } = req.body
      if (!query || typeof query !== 'string') {
        res.status(400).json({ error: 'query is required' })
        return
      }
      const normalizedSite = typeof site === 'string' ? site : undefined
      const normalizedSites = Array.isArray(sites)
        ? sites.filter((item): item is string => typeof item === 'string')
        : undefined
      const context = await resolveRequestContext(req)
      const result = await runtime.search(query, {
        language,
        recency,
        site: normalizedSite,
        sites: normalizedSites,
        engine: engine === 'google' || engine === 'bing' ? engine : 'auto',
      }, context)
      res.json(result)
    } catch (err) {
      console.error('[WebResearch:API] /search error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  // POST /read-page
  router.post('/read-page', async (req, res) => {
    try {
      const { url, extract_mode } = req.body
      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'url is required' })
        return
      }
      const result = await runtime.readPage(url, extract_mode)
      res.json(result)
    } catch (err) {
      console.error('[WebResearch:API] /read-page error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  // POST /screenshot
  router.post('/screenshot', async (req, res) => {
    try {
      const { url, file_path } = req.body
      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'url is required' })
        return
      }
      const context = await resolveRequestContext(req)
      const targetPath = await resolveArtifactPath(file_path, context.taskDir, `screenshot-${Date.now()}.png`)
      const result = await runtime.screenshot(url, targetPath)
      res.json(result)
    } catch (err) {
      console.error('[WebResearch:API] /screenshot error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  // GET /site-info?domain=xxx
  router.get('/site-info', (req, res) => {
    try {
      const domain = req.query.domain as string
      if (!domain) {
        res.status(400).json({ error: 'domain query parameter is required' })
        return
      }
      const info = runtime.getSiteInfo(domain)
      res.json(info)
    } catch (err) {
      console.error('[WebResearch:API] /site-info error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  // GET /status
  // ?detailed=1 返回异步详细状态（含浏览器健康检查），否则返回同步快照
  router.get('/status', async (req, res) => {
    try {
      const detailed = req.query.detailed === '1' || req.query.detailed === 'true'
      if (detailed) {
        res.json(await runtime.getDetailedStatus())
      } else {
        res.json(runtime.getStatus())
      }
    } catch (err) {
      console.error('[WebResearch:API] /status error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  // GET /paths
  router.get('/paths', (_req, res) => {
    try {
      res.json(runtime.getPaths())
    } catch (err) {
      console.error('[WebResearch:API] /paths error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  // POST /connect-browser
  // 主动拉起并连接 CDP Proxy，用于设置页“测试连接”
  router.post('/connect-browser', async (_req, res) => {
    try {
      const available = await runtime.ensureBrowserReady()
      const status = await runtime.getDetailedStatus()
      res.json({
        ok: available,
        browser: status.browser,
        mode: status.mode,
      })
    } catch (err) {
      console.error('[WebResearch:API] /connect-browser error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  // POST /verify
  router.post('/verify', async (req, res) => {
    try {
      const { claim } = req.body
      if (!claim || typeof claim !== 'string') {
        res.status(400).json({ error: 'claim is required' })
        return
      }
      const context = await resolveRequestContext(req)
      const result = await runtime.verify(claim, context)
      res.json(result)
    } catch (err) {
      console.error('[WebResearch:API] /verify error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │  浏览器自动化路由                                                        │
   * │  转发到 runtime 的 browser* 方法，由 TabManager → CDP Proxy 执行        │
   * └──────────────────────────────────────────────────────────────────────────┘ */

  // POST /browser/open
  router.post('/browser/open', async (req, res) => {
    try {
      const { url } = req.body
      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'url is required' })
        return
      }
      const result = await runtime.browserOpen(url)
      res.json(result)
    } catch (err) {
      console.error('[WebResearch:API] /browser/open error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  // POST /browser/navigate
  router.post('/browser/navigate', async (req, res) => {
    try {
      const { target_id, url } = req.body
      if (!target_id || !url) {
        res.status(400).json({ error: 'target_id and url are required' })
        return
      }
      const result = await runtime.browserNavigate(target_id, url)
      res.json(result)
    } catch (err) {
      console.error('[WebResearch:API] /browser/navigate error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  // POST /browser/eval
  router.post('/browser/eval', async (req, res) => {
    try {
      const { target_id, expression } = req.body
      if (!target_id || !expression) {
        res.status(400).json({ error: 'target_id and expression are required' })
        return
      }
      const result = await runtime.browserEval(target_id, expression)
      res.json(result)
    } catch (err) {
      console.error('[WebResearch:API] /browser/eval error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  // POST /browser/click
  router.post('/browser/click', async (req, res) => {
    try {
      const { target_id, selector } = req.body
      if (!target_id || !selector) {
        res.status(400).json({ error: 'target_id and selector are required' })
        return
      }
      const result = await runtime.browserClick(target_id, selector)
      res.json(result)
    } catch (err) {
      console.error('[WebResearch:API] /browser/click error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  // POST /browser/scroll
  router.post('/browser/scroll', async (req, res) => {
    try {
      const { target_id, direction } = req.body
      if (!target_id) {
        res.status(400).json({ error: 'target_id is required' })
        return
      }
      const result = await runtime.browserScroll(target_id, direction)
      res.json(result)
    } catch (err) {
      console.error('[WebResearch:API] /browser/scroll error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  // POST /browser/screenshot
  router.post('/browser/screenshot', async (req, res) => {
    try {
      const { target_id, file_path } = req.body
      if (!target_id) {
        res.status(400).json({ error: 'target_id is required' })
        return
      }
      const context = await resolveRequestContext(req)
      const resolvedPath = await resolveArtifactPath(file_path, context.taskDir, `browser-screenshot-${Date.now()}.png`)
      const result = await runtime.browserScreenshot(target_id, resolvedPath)
      res.json(result)
    } catch (err) {
      console.error('[WebResearch:API] /browser/screenshot error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  // POST /browser/close
  router.post('/browser/close', async (req, res) => {
    try {
      const { target_id } = req.body
      if (!target_id) {
        res.status(400).json({ error: 'target_id is required' })
        return
      }
      const result = await runtime.browserClose(target_id)
      res.json(result)
    } catch (err) {
      console.error('[WebResearch:API] /browser/close error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  router.post('/site-patterns/import', async (req, res) => {
    try {
      const { content, filename } = req.body
      if (!content || typeof content !== 'string') {
        res.status(400).json({ error: 'content is required' })
        return
      }
      const imported = await runtime.importSitePattern(content, {
        filename: typeof filename === 'string' ? filename : undefined,
      })
      res.json({
        ok: true,
        pattern: {
          domain: imported.domain,
          access_strategy: imported.accessStrategy,
        },
      })
    } catch (err) {
      console.error('[WebResearch:API] /site-patterns/import error:', err)
      const message = err instanceof Error ? err.message : String(err)
      const status = /格式无效|frontmatter/i.test(message) ? 400 : 500
      res.status(status).json({ error: message })
    }
  })

  // POST /global-notes
  router.post('/global-notes', async (req, res) => {
    try {
      const { category, note } = req.body
      if (!note || typeof note !== 'string') {
        res.status(400).json({ error: 'note is required' })
        return
      }
      const result = await runtime.saveGlobalNote(category || '调研技巧', note)
      res.json({ ok: true, ...result })
    } catch (err) {
      console.error('[WebResearch:API] /global-notes error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  // GET /global-notes
  router.get('/global-notes', async (_req, res) => {
    try {
      const notes = runtime.getGlobalNotes()
      res.json({ ok: true, notes })
    } catch (err) {
      console.error('[WebResearch:API] /global-notes error:', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  return router
}

async function resolveRequestContext(req: Request): Promise<ResearchRequestContext> {
  const taskDirHeader = req.header('X-LaborAny-Task-Dir')
  const modelProfileId = req.header('X-LaborAny-Model-Profile-Id')?.trim()
  const modelOverride = modelProfileId ? await resolveModelProfileCached(modelProfileId) : undefined

  return {
    apiKey: modelOverride?.apiKey,
    baseUrl: modelOverride?.baseUrl,
    interfaceType: modelOverride?.interfaceType,
    model: modelOverride?.model,
    taskDir: typeof taskDirHeader === 'string' && taskDirHeader.trim() ? taskDirHeader.trim() : undefined,
  }
}

async function resolveModelProfileCached(profileId: string) {
  const now = Date.now()
  const cached = profileCache.get(profileId)
  if (cached && cached.expiresAt > now) {
    return cached.value
  }

  const value = await resolveModelProfile(profileId)
  profileCache.set(profileId, { value, expiresAt: now + PROFILE_CACHE_TTL_MS })
  return value
}

async function resolveArtifactPath(
  filePath: unknown,
  taskDir: string | undefined,
  defaultFileName: string,
): Promise<string> {
  const baseDir = taskDir
    ? join(taskDir, 'artifacts', 'web-research')
    : join(tmpdir(), 'laborany-web-research')

  if (typeof filePath === 'string' && filePath.trim()) {
    const raw = filePath.trim()
      const target = isAbsolute(raw)
        ? raw
        : taskDir
        ? join(taskDir, raw)
        : join(baseDir, raw)
    await mkdir(dirname(target), { recursive: true })
    return target
  }

  await mkdir(baseDir, { recursive: true })
  return join(baseDir, defaultFileName)
}
