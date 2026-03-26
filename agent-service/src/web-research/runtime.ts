/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║              WebResearchRuntime — 核心运行时单例                         ║
 * ║                                                                        ║
 * ║  职责：持有浏览器状态、站点知识、后端适配器                                 ║
 * ║  设计：全局单例，进程级生命周期                                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { CdpProxyManager } from './browser/cdp-proxy-manager.js'
import { TabManager } from './browser/tab-manager.js'
import { SiteKnowledge } from './knowledge/site-knowledge.js'
import { GlobalKnowledge } from './knowledge/global-knowledge.js'
import { ZhipuSearchAdapter } from './backends/zhipu-adapter.js'
import { JinaReaderAdapter } from './backends/jina-adapter.js'
import { StaticFetchAdapter } from './backends/static-adapter.js'
import { CdpBrowserAdapter } from './backends/cdp-adapter.js'
import type {
  SearchResult,
  SearchOptions,
  PageContent,
  ResearchObservation,
  ResearchRequestContext,
} from './backends/types.js'
import { collectRequestedSites, filterSearchResultsBySites } from './backends/search-utils.js'
import { DATA_DIR } from '../paths.js'
import { extractDomain } from './knowledge/pattern-matcher.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const LOG_PREFIX = '[WebResearch]'
const ZHIPU_BASE_URL_PATTERN = /(?:^|\/\/)(?:[^/]+\.)?bigmodel\.cn(?:\/|$)/i

function isZhipuBaseUrl(baseUrl: string | undefined): boolean {
  return Boolean(baseUrl && ZHIPU_BASE_URL_PATTERN.test(baseUrl))
}

function resolveBuiltinPatternsDir(): string {
  const candidates = [
    join(__dirname, 'knowledge', 'builtin-patterns'),
    join(__dirname, 'web-research', 'knowledge', 'builtin-patterns'),
    join(dirname(process.execPath), 'web-research', 'knowledge', 'builtin-patterns'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return candidates[0]
}

export class WebResearchRuntime {
  private cdpManager: CdpProxyManager
  private tabManager: TabManager
  private siteKnowledge: SiteKnowledge
  private globalKnowledge: GlobalKnowledge
  private zhipuAdapter: ZhipuSearchAdapter | null = null
  private jinaAdapter: JinaReaderAdapter
  private staticAdapter: StaticFetchAdapter
  private cdpAdapter: CdpBrowserAdapter
  private initialized = false

  constructor() {
    const cdpPort = parseInt(process.env.CDP_PROXY_PORT || '3456', 10)
    this.cdpManager = new CdpProxyManager(cdpPort)
    this.tabManager = new TabManager({ port: cdpPort })
    this.siteKnowledge = new SiteKnowledge(
      join(DATA_DIR, 'web-research', 'site-patterns'),
      resolveBuiltinPatternsDir(),
    )
    this.globalKnowledge = new GlobalKnowledge(DATA_DIR)
    this.jinaAdapter = new JinaReaderAdapter()
    this.staticAdapter = new StaticFetchAdapter()
    this.cdpAdapter = new CdpBrowserAdapter(cdpPort, this.siteKnowledge)
  }

  async init(): Promise<void> {
    if (this.initialized) return

    // 初始化站点知识
    await this.siteKnowledge.init()
    await this.globalKnowledge.init()

    // 检测智谱 API key
    // 支持两种配置方式：
    //   1. 显式 ZHIPU_API_KEY 环境变量
    //   2. 当 ANTHROPIC_BASE_URL 指向智谱时，从 ANTHROPIC_API_KEY 推断
    const zhipuKey = process.env.ZHIPU_API_KEY
    const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL || ''
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY || ''
    const isZhipuBaseUrl = anthropicBaseUrl.includes('open.bigmodel.cn')

    if (zhipuKey) {
      this.zhipuAdapter = new ZhipuSearchAdapter(zhipuKey)
      console.log(`${LOG_PREFIX} Zhipu adapter enabled (via ZHIPU_API_KEY)`)
    } else if (isZhipuBaseUrl && anthropicApiKey) {
      this.zhipuAdapter = new ZhipuSearchAdapter(anthropicApiKey)
      console.log(`${LOG_PREFIX} Zhipu adapter enabled (via ANTHROPIC_API_KEY + bigmodel.cn base URL)`)
    } else {
      console.log(`${LOG_PREFIX} Zhipu adapter not available (no ZHIPU_API_KEY or bigmodel.cn config)`)
    }

    // 不在此处启动 CDP Proxy（按需启动）
    this.initialized = true
    console.log(`${LOG_PREFIX} Runtime initialized`)
  }

  async shutdown(): Promise<void> {
    // 关闭所有由 runtime 管理的 tab
    await this.tabManager.closeAllTabs()
    // 停止 CDP Proxy
    await this.cdpManager.stop()
    this.initialized = false
    console.log(`${LOG_PREFIX} Runtime shut down`)
  }

  getStatus(): { browser: boolean; zhipu: boolean; sitePatterns: number } {
    const stats = this.siteKnowledge.getStats()
    return {
      browser: false, // 按需启动，此处不做 async 检查
      zhipu: Boolean(this.zhipuAdapter),
      sitePatterns: stats.totalCount,
    }
  }

  getPaths(): {
    runtimeHomeDir: string
    dataDir: string
    sitePatternsRoot: string
    sitePatternsVerified: string
    builtinPatternsDir: string
  } {
    const paths = this.siteKnowledge.getPaths()
    return {
      runtimeHomeDir: dirname(DATA_DIR),
      dataDir: DATA_DIR,
      sitePatternsRoot: paths.rootDir,
      sitePatternsVerified: paths.verifiedDir,
      builtinPatternsDir: paths.builtinDir,
    }
  }

  /**
   * 异步获取详细状态（包括浏览器健康检查）
   * 用于前端设置页展示
   */
  async getDetailedStatus(): Promise<{
    browser: { available: boolean; port: number }
    zhipu: { available: boolean }
    sitePatterns: { count: number; builtinCount: number; userCount: number }
    paths: ReturnType<WebResearchRuntime['getPaths']>
    mode: 'full' | 'api' | 'degraded'
    nodeVersion: string
  }> {
    const browserAvailable = await this.cdpManager.checkHealth()
    const cdpPort = this.cdpManager.getPort()
    const hasZhipu = Boolean(this.zhipuAdapter)

    const stats = this.siteKnowledge.getStats()

    let mode: 'full' | 'api' | 'degraded'
    if (browserAvailable) {
      mode = 'full'
    } else if (hasZhipu) {
      mode = 'api'
    } else {
      mode = 'degraded'
    }

    return {
      browser: { available: browserAvailable, port: cdpPort },
      zhipu: { available: hasZhipu },
      sitePatterns: {
        count: stats.totalCount,
        builtinCount: stats.builtinCount,
        userCount: stats.userCount,
      },
      paths: this.getPaths(),
      mode,
      nodeVersion: process.version,
    }
  }

  /* ════════════════════════════════════════════════════════════════════════════
   *  核心搜索方法 — 降级链
   *
   *  1. site pattern 短路检查
   *  2. 智谱搜索（如果可用）
   *  3. CDP 浏览器搜索（如果可用）
   *  4. 全部失败 → 返回 degraded
   * ════════════════════════════════════════════════════════════════════════════ */
  async search(
    query: string,
    options?: SearchOptions,
    context?: ResearchRequestContext,
  ): Promise<{
    results: SearchResult[]
    backend: string
    degraded: boolean
    reason?: string
    strategy?: string
    observations?: ResearchObservation[]
  }> {
    const searchQuery = this.buildSearchQuery(query, options)
    const requestedSites = collectRequestedSites(searchQuery, options)
    const siteMatch = this.siteKnowledge.matchQuery(searchQuery)
    const activeZhipuAdapter = this.resolveZhipuAdapter(context)
    const forceBrowserEngine = options?.engine === 'google' || options?.engine === 'bing'
    const reasons: string[] = []
    let attemptedStrategy: string | undefined = forceBrowserEngine ? options?.engine : undefined

    // ── Step 1: site pattern 短路 ──
    // 如果 access_strategy == cdp_only，跳过 API 直接走 CDP
    const skipApi = siteMatch?.accessStrategy === 'cdp_only' || forceBrowserEngine

    // ── Step 2: 智谱搜索 ──
    if (!skipApi && activeZhipuAdapter) {
      const available = await activeZhipuAdapter.isAvailable()
      if (available) {
        try {
          const results = filterSearchResultsBySites(
            await activeZhipuAdapter.search(searchQuery, options),
            requestedSites,
          )
          if (results.length > 0) {
            return { results, backend: 'zhipu', degraded: false, strategy: 'zhipu' }
          }
          reasons.push(
            requestedSites.length > 0
              ? `智谱搜索未返回指定站点结果（${requestedSites.join(', ')}）`
              : '智谱搜索未返回结果',
          )
        } catch (err) {
          reasons.push(`智谱搜索失败: ${err instanceof Error ? err.message : String(err)}`)
          console.log(`${LOG_PREFIX} Zhipu search failed, falling through:`, err)
        }
      }
    } else if (skipApi) {
      if (forceBrowserEngine) {
        reasons.push(`已按请求跳过 API 搜索，直接使用浏览器搜索引擎（${options?.engine}）`)
      } else {
        reasons.push(`已根据站点经验跳过 API 搜索（${siteMatch?.domain} 需要浏览器访问）`)
      }
    }

    // ── Step 3: CDP 浏览器搜索 ──
    const cdpAvailable = await this.ensureBrowser()
    if (cdpAvailable) {
      try {
        const cdpResult = await this.cdpAdapter.searchWithDiagnostics(searchQuery, options)
        attemptedStrategy = cdpResult.strategy || attemptedStrategy
        const filteredResults = filterSearchResultsBySites(cdpResult.results, requestedSites)
        if (filteredResults.length > 0) {
          await this.recordSearchSuccess(
            cdpResult.strategy,
            filteredResults,
            cdpResult.observations,
          )
          return {
            results: filteredResults,
            backend: 'cdp',
            degraded: false,
            strategy: cdpResult.strategy,
            observations: cdpResult.observations,
          }
        }
        reasons.push(
          cdpResult.reason
          || (requestedSites.length > 0
            ? `浏览器搜索未返回指定站点结果（${requestedSites.join(', ')}）`
            : '浏览器搜索未返回结果'),
        )
      } catch (err) {
        reasons.push(`浏览器搜索失败: ${err instanceof Error ? err.message : String(err)}`)
        console.log(`${LOG_PREFIX} CDP search failed:`, err)
      }
    }

    // ── Step 4: 全部失败 ──
    if (!skipApi && !activeZhipuAdapter) {
      reasons.push('智谱 API 未配置')
    }
    if (!cdpAvailable) {
      reasons.push('浏览器增强未配置')
    }

    const missingSetupReasons = []
    if (!skipApi && !activeZhipuAdapter) missingSetupReasons.push('ZHIPU_API_KEY')
    if (!cdpAvailable) missingSetupReasons.push('Chrome 远程调试')
    const setupHint = missingSetupReasons.length > 0
      ? `。请配置 ${missingSetupReasons.join(' 或 ')}。`
      : '。'

    return {
      results: [],
      backend: 'none',
      degraded: true,
      reason: `搜索后端未返回可用结果: ${reasons.join('；') || '未知原因'}${setupHint}`,
      strategy: attemptedStrategy,
    }
  }

  private async recordSearchSuccess(
    strategy: string | undefined,
    results: SearchResult[],
    observations?: ResearchObservation[],
  ): Promise<void> {
    const relevantObservation = observations?.find((item) => (
      item.kind === 'site_search_success' || item.kind === 'site_search_fallback'
    ))

    const domain = (relevantObservation?.domain
      || (strategy?.startsWith('site:') ? strategy.slice('site:'.length).trim().toLowerCase() : ''))
      .trim()
    if (!domain) return

    const matchedResult = results.find((result) => {
      const resultDomain = extractDomain(result.url)
      return Boolean(
        resultDomain
        && (resultDomain === domain
          || resultDomain.endsWith(`.${domain}`)
          || domain.endsWith(`.${resultDomain}`)),
      )
    })

    await this.siteKnowledge
      .recordSuccess(domain, {
        method: relevantObservation?.kind === 'site_search_fallback' ? 'search_fallback' : 'cdp_search',
        url: relevantObservation?.url || matchedResult?.url || results[0]?.url,
        observations: relevantObservation
          ? [formatSearchObservationLine(relevantObservation, matchedResult?.url || results[0]?.url)]
          : undefined,
      })
      .catch((err) => {
        console.log(`${LOG_PREFIX} Failed to record search success for ${domain}:`, err)
      })
  }

  /* ════════════════════════════════════════════════════════════════════════════
   *  核心页面读取方法 — 降级链
   *
   *  1. site pattern 短路检查
   *  2. Jina Reader
   *  3. 静态 HTTP fetch
   *  4. CDP 浏览器提取
   *  成功走 CDP 后 → recordSuccess
   * ════════════════════════════════════════════════════════════════════════════ */
  async readPage(url: string, format?: 'text' | 'markdown' | 'html'): Promise<PageContent> {
    const siteMatch = this.siteKnowledge.matchUrl(url)
    const outputFormat = format ?? 'markdown'
    const failedBackends: string[] = []

    // cdp_only → 跳过所有静态方法（Jina + static），直接 CDP
    // cdp_preferred → 跳过 static fetch（仍尝试 Jina），失败后立即 CDP
    const skipAllStatic = siteMatch?.accessStrategy === 'cdp_only'
    const skipStaticFetch = skipAllStatic || siteMatch?.accessStrategy === 'cdp_preferred'

    // ── Step 2: Jina Reader ──
    if (!skipAllStatic) {
      try {
        const result = await this.jinaAdapter.readPage(url, outputFormat)
        if (isUsablePageContent(result)) {
          return result
        }
        failedBackends.push('jina')
        console.log(`${LOG_PREFIX} Jina read returned blocked/low-quality content, falling through: ${describeRejectedPageContent(result)}`)
      } catch (err) {
        failedBackends.push('jina')
        console.log(`${LOG_PREFIX} Jina read failed, falling through:`, err)
      }
    }

    // ── Step 2b: 静态 HTTP fetch ──
    if (!skipStaticFetch) {
      try {
        const result = await this.staticAdapter.readPage(url, outputFormat)
        if (isUsablePageContent(result)) {
          return result
        }
        failedBackends.push('static')
        console.log(`${LOG_PREFIX} Static read returned blocked/low-quality content, falling through: ${describeRejectedPageContent(result)}`)
      } catch (err) {
        failedBackends.push('static')
        console.log(`${LOG_PREFIX} Static read failed, falling through:`, err)
      }
    }

    // ── Step 3: CDP 浏览器提取 ──
    const cdpAvailable = await this.ensureBrowser()
    if (cdpAvailable) {
      try {
        const result = await this.cdpAdapter.readPage(url, outputFormat)
        if (isUsablePageContent(result, { requireMinLength: 50 })) {
          // 成功走了 CDP → 记录站点经验
          const domain = extractDomain(url)
          const observationLines: string[] = []
          const observations: ResearchObservation[] = []

          if (result.strategy === 'structured_note' || result.strategy === 'structured_video') {
            observationLines.push(`- [auto-observation] 结构化提取成功（${result.strategy}）: ${url}`)
            observations.push({
              kind: 'structured_read',
              domain: domain || undefined,
              url,
              strategy: result.strategy,
              message: `结构化提取成功（${result.strategy}）`,
            })
          }

          if (!skipAllStatic && failedBackends.length > 0) {
            const fallbackStrategy = failedBackends.join('+')
            observationLines.push(
              `- [auto-observation] ${humanizeBackendChain(fallbackStrategy)} 不可用后，浏览器兜底成功: ${url}`,
            )
            observations.push({
              kind: 'browser_fallback',
              domain: domain || undefined,
              url,
              strategy: fallbackStrategy,
              message: `${humanizeBackendChain(fallbackStrategy)} 不可用后，浏览器兜底成功`,
            })
          }

          if (domain) {
            await this.siteKnowledge
              .recordSuccess(domain, {
                method: 'cdp',
                url,
                observations: observationLines.length > 0 ? observationLines : undefined,
              })
              .catch((err) => {
                console.log(`${LOG_PREFIX} Failed to record success for ${domain}:`, err)
              })
          }
          return {
            ...result,
            observations: observations.length > 0 ? observations : result.observations,
          }
        }
        console.log(`${LOG_PREFIX} CDP read returned blocked/low-quality content: ${describeRejectedPageContent(result)}`)
      } catch (err) {
        console.log(`${LOG_PREFIX} CDP read failed:`, err)
      }
    }

    // ── Step 4: 全部失败 ──
    return {
      url,
      title: '',
      content: '',
      format: outputFormat,
      fetchMethod: 'none',
      error: `无法读取页面 ${url}。所有后端均失败。`,
    }
  }

  /* ════════════════════════════════════════════════════════════════════════════
   *  截图 — 必须走 CDP
   * ════════════════════════════════════════════════════════════════════════════ */
  async screenshot(
    url: string,
    filePath: string,
  ): Promise<{ file_path: string; url: string; error?: string }> {
    const cdpAvailable = await this.ensureBrowser()
    if (!cdpAvailable) {
      return {
        file_path: filePath,
        url,
        error: '浏览器增强未配置，无法截图。请先配置 Chrome 远程调试。',
      }
    }

    try {
      const result = await this.cdpAdapter.screenshot(url, filePath)
      return { file_path: result.filePath, url }
    } catch (err) {
      return {
        file_path: filePath,
        url,
        error: `截图失败: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  async ensureBrowserReady(): Promise<boolean> {
    return this.ensureBrowser()
  }

  /* ════════════════════════════════════════════════════════════════════════════
   *  站点信息
   * ════════════════════════════════════════════════════════════════════════════ */
  getSiteInfo(domain: string): Record<string, unknown> {
    const pattern = this.siteKnowledge.getPattern(domain)
    if (!pattern) {
      return {
        domain,
        info: null,
      }
    }

    return {
      domain: pattern.domain,
      access_strategy: pattern.accessStrategy,
      aliases: pattern.aliases,
      source: pattern.source,
      verified_at: pattern.verifiedAt,
      evidence_count: pattern.evidenceCount,
      characteristics: pattern.characteristics || null,
      patterns: pattern.effectivePatterns || null,
      pitfalls: pattern.knownPitfalls || null,
      automation: pattern.automation || null,
      markdown: this.siteKnowledge.getPatternMarkdown(domain),
    }
  }

  getGlobalNotes(): string {
    return this.globalKnowledge.getAllNotes()
  }

  async saveGlobalNote(category: string, note: string): Promise<{ added: boolean; reason?: string }> {
    return this.globalKnowledge.addNote(category, note)
  }

  /* ════════════════════════════════════════════════════════════════════════════
   *  verify — 事实核查
   *
   *  1. 搜索声明/事实
   *  2. 筛选一手来源（官网、.gov、.edu、.org）
   *  3. 读取页面内容
   *  4. 返回来源材料（让模型根据内容判断）
   * ════════════════════════════════════════════════════════════════════════════ */
  async verify(claim: string, context?: ResearchRequestContext): Promise<{
    verified: boolean | null  // true=已验证, false=已否定, null=无法确定
    sources: Array<{ url: string; title: string; relevance: string; pageContent?: string }>
    summary: string
    method: string
  }> {
    // 1. 搜索这个声明/事实
    const searchResults = await this.search(claim, { recency: 'any' }, context)

    // 2. 从结果中筛选最可能的一手来源（官网、官方文档、权威媒体）
    //    优先选择：包含 .gov / .edu / .org / official / 官方 的 URL
    const primarySources = searchResults.results
      .filter(r => /\.gov|\.edu|\.org|official|官方|官网/.test(r.url + r.title + r.snippet))
      .slice(0, 3)

    // 3. 如果没有明显的一手来源，用前 3 个结果
    const sourcesToRead = primarySources.length > 0 ? primarySources : searchResults.results.slice(0, 3)

    // 4. 读取这些页面并收集内容
    const pageResults = await Promise.allSettled(
      sourcesToRead.map(s => this.readPage(s.url, 'text'))
    )

    // 5. 返回结果（不做判断，让模型根据页面内容判断）
    const sources = sourcesToRead.map((s, i) => {
      const pageResult = pageResults[i]
      const pageContent = pageResult.status === 'fulfilled' && pageResult.value.content
        ? pageResult.value.content.slice(0, 3000)  // 截断避免太长
        : undefined
      return {
        url: s.url,
        title: s.title,
        relevance: s.snippet,
        pageContent,
      }
    })

    return {
      verified: null,
      sources,
      summary: `Searched for: "${claim}". Found ${searchResults.results.length} results, read ${sourcesToRead.length} primary sources.`,
      method: searchResults.backend,
    }
  }

  /* ════════════════════════════════════════════════════════════════════════════
   *  浏览器自动化方法 — 通过 CDP Proxy 的 TabManager 转发
   *
   *  这些方法对应 P7 的 browser_* MCP 工具，仅在环境变量
   *  LABORANY_BROWSER_AUTOMATION=true 时通过 MCP 暴露给模型。
   * ════════════════════════════════════════════════════════════════════════════ */

  async browserOpen(url: string): Promise<{ target_id: string; url: string; error?: string }> {
    const cdpAvailable = await this.ensureBrowser()
    if (!cdpAvailable) {
      return { target_id: '', url, error: '浏览器增强未配置。请先配置 Chrome 远程调试。' }
    }
    try {
      const targetId = await this.tabManager.createTab(url)
      return { target_id: targetId, url }
    } catch (err) {
      return { target_id: '', url, error: `打开页面失败: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  async browserNavigate(
    targetId: string,
    url: string,
  ): Promise<{ target_id: string; url: string; error?: string }> {
    try {
      await this.tabManager.navigateTab(targetId, url)
      return { target_id: targetId, url }
    } catch (err) {
      return { target_id: targetId, url, error: `导航失败: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  async browserEval(
    targetId: string,
    expression: string,
  ): Promise<{ target_id: string; result: unknown; error?: string }> {
    try {
      const result = await this.tabManager.evalInTab(targetId, expression)
      return { target_id: targetId, result }
    } catch (err) {
      return { target_id: targetId, result: null, error: `执行失败: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  async browserClick(
    targetId: string,
    selector: string,
  ): Promise<{ target_id: string; clicked: boolean; error?: string }> {
    try {
      await this.tabManager.clickInTab(targetId, selector)
      return { target_id: targetId, clicked: true }
    } catch (err) {
      return { target_id: targetId, clicked: false, error: `点击失败: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  async browserScroll(
    targetId: string,
    direction?: 'up' | 'down' | 'top' | 'bottom',
  ): Promise<{ target_id: string; scrolled: boolean; error?: string }> {
    try {
      await this.tabManager.scrollTab(targetId, direction || 'down')
      return { target_id: targetId, scrolled: true }
    } catch (err) {
      return { target_id: targetId, scrolled: false, error: `滚动失败: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  async browserScreenshot(
    targetId: string,
    filePath?: string,
  ): Promise<{ target_id: string; file_path: string; error?: string }> {
    const targetPath = filePath || join(tmpdir(), `browser-screenshot-${Date.now()}.png`)
    try {
      await this.tabManager.screenshotTab(targetId, targetPath)
      return { target_id: targetId, file_path: targetPath }
    } catch (err) {
      return { target_id: targetId, file_path: targetPath, error: `截图失败: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  async browserClose(targetId: string): Promise<{ target_id: string; closed: boolean; error?: string }> {
    try {
      await this.tabManager.closeTab(targetId)
      return { target_id: targetId, closed: true }
    } catch (err) {
      return { target_id: targetId, closed: false, error: `关闭失败: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  /* ════════════════════════════════════════════════════════════════════════════
   *  内部辅助
   * ════════════════════════════════════════════════════════════════════════════ */

  /**
   * 按需启动 CDP Proxy，返回是否可用
   */
  private async ensureBrowser(): Promise<boolean> {
    try {
      await this.cdpManager.ensureRunning()
      return await this.cdpManager.isAvailable()
    } catch {
      return false
    }
  }

  async importSitePattern(
    content: string,
    options?: { filename?: string },
  ) {
    return this.siteKnowledge.importPattern(content, options)
  }

  private resolveZhipuAdapter(context?: ResearchRequestContext): ZhipuSearchAdapter | null {
    const apiKey = (context?.apiKey || '').trim()
    const baseUrl = (context?.baseUrl || '').trim()
    if (apiKey && isZhipuBaseUrl(baseUrl)) {
      return new ZhipuSearchAdapter(apiKey)
    }
    return this.zhipuAdapter
  }

  private buildSearchQuery(query: string, options?: SearchOptions): string {
    const existingSites = new Set(
      Array.from(query.matchAll(/(?:^|\s)site:([^\s]+)/gi))
        .map(match => match[1]?.trim().toLowerCase())
        .filter(Boolean) as string[],
    )
    const requestedSites = [
      options?.site,
      ...(options?.sites || []),
    ]
      .map(site => site?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, ''))
      .filter((site): site is string => Boolean(site))
      .filter(site => !existingSites.has(site))

    if (requestedSites.length === 0) return query
    return `${query} ${requestedSites.map(site => `site:${site}`).join(' ')}`.trim()
  }
}

const BLOCKED_PAGE_PATTERNS = [
  'just a moment',
  'checking your browser before accessing',
  'verification successful. waiting for',
  'enable javascript and cookies to continue',
  'please verify you are human',
  'verify you are human',
  'access denied',
  'attention required',
  'security check',
  'captcha',
  'cloudflare',
  '403 forbidden',
  '请求被阻止',
  '安全验证',
  '人机验证',
]

function isUsablePageContent(
  result: PageContent | null | undefined,
  options?: { requireMinLength?: number },
): boolean {
  if (!result || result.error) return false

  const content = (result.content || '').trim()
  const title = (result.title || '').trim()
  if (!content) return false

  const minLength = options?.requireMinLength ?? 1
  if (content.length < minLength) return false

  const combined = `${title}\n${content}`.toLowerCase()
  if (BLOCKED_PAGE_PATTERNS.some(pattern => combined.includes(pattern))) {
    return false
  }

  return true
}

function describeRejectedPageContent(result: PageContent | null | undefined): string {
  if (!result) return 'empty result'
  const parts = [
    `fetchMethod=${result.fetchMethod}`,
    `title="${(result.title || '').slice(0, 60)}"`,
    `contentLength=${result.content?.length || 0}`,
  ]
  if (result.error) {
    parts.push(`error=${result.error}`)
  }
  return parts.join(', ')
}

function formatSearchObservationLine(
  observation: ResearchObservation,
  fallbackUrl?: string,
): string {
  const targetUrl = observation.url || fallbackUrl
  const urlSuffix = targetUrl ? `: ${targetUrl}` : ''

  switch (observation.kind) {
    case 'site_search_success':
      return `- [auto-observation] 通过站内搜索自动化成功找到结果${urlSuffix}`
    case 'site_search_fallback':
      return `- [auto-observation] ${observation.message || '站内搜索失败后，搜索引擎 fallback 成功'}${urlSuffix}`
    default:
      return `- [auto-observation] ${observation.message || observation.kind}${urlSuffix}`
  }
}

function humanizeBackendChain(chain: string): string {
  const labels: Record<string, string> = {
    jina: 'Jina',
    static: '静态读取',
  }

  return chain
    .split('+')
    .map(part => labels[part] || part)
    .join(' + ')
}
