/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║               CDP 浏览器适配器 (CDP Browser Adapter)                     ║
 * ║                                                                        ║
 * ║  职责：通过 CDP Proxy HTTP API 实现搜索、页面读取和截图                      ║
 * ║  设计：依赖 CDP Proxy 进程，通过 loopback HTTP 通信                        ║
 * ║  搜索引擎降级：站点内搜索 → Google → Bing → 空结果                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type {
  SearchBackend,
  PageReader,
  SearchResult,
  SearchOptions,
  PageContent,
  ResearchObservation,
} from './types.js'
import {
  collectRequestedSites,
  filterSearchResultsBySites,
  scoreSearchResults,
  shouldTryAlternateSearchEngine,
} from './search-utils.js'
import type { SiteKnowledge } from '../knowledge/site-knowledge.js'
import type {
  SitePattern,
  SiteSearchAutomation,
  SiteSearchEngineAutomation,
  SiteSearchFormAutomation,
  SiteReadAutomation,
  SiteReadStructuredAutomation,
  SiteReadStructuredVideoAutomation,
  SiteSnippetField,
} from '../knowledge/types.js'

const LOG_PREFIX = '[WebResearch:CDP]'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                          常量                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */

const DEFAULT_CDP_PROXY_PORT = 3456
const CDP_TIMEOUT_MS = 30_000
/** 搜索页面加载等待时间 — 检测到结果容器后可提前退出 */
const SEARCH_LOAD_WAIT_MS = 5_000
const SEARCH_POLL_INTERVAL_MS = 300
const PAGE_LOAD_WAIT_MS = 3_000

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     CDP Proxy 响应类型                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */

interface CdpNewTabResponse {
  targetId: string
}

interface CdpEvalResponse {
  value?: unknown
  error?: string
}

interface CdpHealthResponse {
  status: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                 搜索引擎提取脚本 (eval JS)                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/**
 * Google 搜索结果提取 — 多选择器兼容策略
 */
const GOOGLE_EXTRACT_SCRIPT = `
(() => {
  const results = [];
  const items = document.querySelectorAll('div.g, div[data-hveid] div.tF2Cxc');
  for (const item of items) {
    const titleEl = item.querySelector('h3');
    const linkEl = item.querySelector('a[href^="http"]');
    const snippetEl = item.querySelector('div.VwiC3b, span.aCOpRe, div[data-sncf] span, div.IsZvec');
    if (titleEl && linkEl) {
      results.push({
        title: titleEl.textContent || '',
        url: linkEl.href || '',
        snippet: snippetEl ? snippetEl.textContent || '' : '',
      });
    }
    if (results.length >= 10) break;
  }
  return JSON.stringify(results);
})()
`

/**
 * Google 结果容器检测 — 用于提前退出等待
 */
const GOOGLE_CONTAINER_CHECK = `
(() => {
  const items = document.querySelectorAll('div.g, div[data-hveid] div.tF2Cxc');
  return items.length;
})()
`

/**
 * Bing 搜索结果提取
 */
const BING_EXTRACT_SCRIPT = `
(() => {
  const results = [];
  const items = document.querySelectorAll('li.b_algo');
  for (const item of items) {
    const titleEl = item.querySelector('h2 a');
    const snippetEl = item.querySelector('p.b_lineclamp2, div.b_caption p, p');
    if (titleEl) {
      results.push({
        title: titleEl.textContent || '',
        url: titleEl.href || '',
        snippet: snippetEl ? snippetEl.textContent || '' : '',
      });
    }
    if (results.length >= 10) break;
  }
  return JSON.stringify(results);
})()
`

/**
 * Bing 结果容器检测
 */
const BING_CONTAINER_CHECK = `
(() => {
  const items = document.querySelectorAll('li.b_algo');
  return items.length;
})()
`

const SEARCH_PAGE_TEXT_SCRIPT = `
(() => {
  const text = document.body?.innerText || '';
  return text.slice(0, 4000);
})()
`

const XIAOHONGSHU_SEARCH_TRIGGER_SCRIPT = `
(async () => {
  const confirm = document.querySelector('button.reds-alert-footer__right');
  if (confirm) {
    confirm.click();
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  const input = document.querySelector('input.search-input');
  if (!input) {
    return { error: '未找到小红书搜索输入框' };
  }

  const keyword = __LABORANY_KEYWORD__;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, keyword);
  else input.value = keyword;

  input.focus();
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 250));

  const trigger = document.querySelector('div.search-icon');
  if (!trigger) {
    return { error: '未找到小红书搜索按钮' };
  }

  trigger.click();
  return { ok: true, keyword, url: location.href };
})()
`

const XIAOHONGSHU_EXTRACT_SCRIPT = `
(() => {
  const results = [];
  const seen = new Set();
  const anchors = document.querySelectorAll('a[href*="/search_result/"][href*="xsec_token"], a.cover.mask[href*="/search_result/"]');

  for (const anchor of anchors) {
    const href = anchor.href || '';
    if (!href || seen.has(href)) continue;
    seen.add(href);

    const card = anchor.parentElement;
    const title = card?.querySelector('.title span')?.textContent?.trim()
      || card?.querySelector('.title')?.textContent?.trim()
      || '';
    const author = card?.querySelector('.author .name')?.textContent?.trim() || '';
    const time = card?.querySelector('.author .time')?.textContent?.trim() || '';
    const likes = card?.querySelector('.count')?.textContent?.trim() || '';

    results.push({
      title,
      url: href,
      snippet: [author, time, likes ? ('likes ' + likes) : ''].filter(Boolean).join(' · '),
    });

    if (results.length >= 10) break;
  }

  return JSON.stringify(results);
})()
`

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       CdpBrowserAdapter                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export class CdpBrowserAdapter implements SearchBackend, PageReader {
  readonly name = 'cdp'
  private readonly baseUrl: string
  private readonly siteKnowledge?: Pick<SiteKnowledge, 'getPattern' | 'matchQuery'>

  constructor(
    cdpProxyPort: number = DEFAULT_CDP_PROXY_PORT,
    siteKnowledge?: Pick<SiteKnowledge, 'getPattern' | 'matchQuery'>,
  ) {
    this.baseUrl = `http://127.0.0.1:${cdpProxyPort}`
    this.siteKnowledge = siteKnowledge
  }

  /* ── 可用性检查 ── */

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(3_000),
      })
      if (!response.ok) return false

      const data = (await response.json()) as CdpHealthResponse
      return data.status === 'ok'
    } catch {
      return false
    }
  }

  /* ── 搜索（降级链：站内搜索 → Google → Bing → 空结果）── */

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const { results } = await this.searchWithDiagnostics(query, options)
    return results
  }

  async searchWithDiagnostics(
    query: string,
    options?: SearchOptions,
  ): Promise<{
    results: SearchResult[]
    reason?: string
    strategy?: string
    observations?: ResearchObservation[]
  }> {
    const requestedSites = collectRequestedSites(query, options)
    const siteSearchPattern = this.resolveSiteSearchPattern(query, requestedSites)
    const forcedEngine = options?.engine === 'google' || options?.engine === 'bing'
      ? options.engine
      : 'auto'
    let googleReason: string | undefined
    let googleResults: SearchResult[] = []
    let normalizedGoogle: SearchResult[] = []
    let siteSearchAttempted = false

    if (siteSearchPattern && forcedEngine === 'auto') {
      try {
        siteSearchAttempted = true
        const results = await this.searchWithConfiguredSiteSearch(
          siteSearchPattern,
          query,
          options,
        )
        if (results.length > 0) {
          return {
            results,
            strategy: `site:${siteSearchPattern.domain}`,
            observations: [
              buildSiteSearchSuccessObservation(siteSearchPattern.domain, `site:${siteSearchPattern.domain}`, results),
            ],
          }
        }
        googleReason = `${siteSearchPattern.domain} 站内搜索未返回结果`
      } catch (err) {
        siteSearchAttempted = true
        googleReason = describeSearchError(err, `${siteSearchPattern.domain} 站内搜索失败`)
        console.log(
          `${LOG_PREFIX} Site search failed for ${siteSearchPattern.domain}, falling back to Google:`,
          err,
        )
      }
    }

    if (forcedEngine === 'google') {
      try {
        googleResults = await this.searchWithGoogle(query, options)
        normalizedGoogle = filterSearchResultsBySites(googleResults, requestedSites)
        if (normalizedGoogle.length > 0) {
          return {
            results: normalizedGoogle,
            strategy: 'google',
            observations: buildSiteSearchFallbackObservations(
              siteSearchPattern,
              siteSearchAttempted,
              'google',
              normalizedGoogle,
              googleReason,
            ),
          }
        }
        return {
          results: [],
          reason: describeInsufficientSearchResults('Google', googleResults, normalizedGoogle, requestedSites, query),
          strategy: 'google',
        }
      } catch (err) {
        return {
          results: [],
          reason: describeSearchError(err, 'Google 搜索失败'),
          strategy: 'google',
        }
      }
    }

    if (forcedEngine === 'bing') {
      try {
        const bingResults = await this.searchWithBing(query, options)
        const normalizedBing = filterSearchResultsBySites(bingResults, requestedSites)
        if (normalizedBing.length > 0) {
          return {
            results: normalizedBing,
            strategy: 'bing',
            observations: buildSiteSearchFallbackObservations(
              siteSearchPattern,
              siteSearchAttempted,
              'bing',
              normalizedBing,
              googleReason,
            ),
          }
        }
        return {
          results: [],
          reason: describeInsufficientSearchResults('Bing', bingResults, normalizedBing, requestedSites, query),
          strategy: 'bing',
        }
      } catch (err) {
        return {
          results: [],
          reason: describeSearchError(err, 'Bing 搜索失败'),
          strategy: 'bing',
        }
      }
    }

    // auto: 先试 Google
    try {
      googleResults = await this.searchWithGoogle(query, options)
      normalizedGoogle = filterSearchResultsBySites(googleResults, requestedSites)
      if (!shouldTryAlternateSearchEngine(normalizedGoogle, query, requestedSites)) {
        return {
          results: normalizedGoogle,
          strategy: 'google',
          observations: buildSiteSearchFallbackObservations(
            siteSearchPattern,
            siteSearchAttempted,
            'google',
            normalizedGoogle,
            googleReason,
          ),
        }
      }
      googleReason = describeInsufficientSearchResults('Google', googleResults, normalizedGoogle, requestedSites, query)
    } catch (err) {
      googleReason = describeSearchError(err, 'Google 搜索失败')
      console.log(`${LOG_PREFIX} Google search failed, falling back to Bing:`, err)
    }

    // Google 失败，试 Bing
    try {
      const bingResults = await this.searchWithBing(query, options)
      const normalizedBing = filterSearchResultsBySites(bingResults, requestedSites)
      const merged = mergeSearchResults(
        rankResultSets(query, requestedSites, normalizedGoogle, normalizedBing),
      )
      if (merged.length > 0) {
        const primaryStrategy = normalizedGoogle.length > 0 ? 'google+bing' : 'bing'
        const trimmed = merged.slice(0, options?.maxResults ?? 10)
        return {
          results: trimmed,
          strategy: primaryStrategy,
          observations: buildSiteSearchFallbackObservations(
            siteSearchPattern,
            siteSearchAttempted,
            primaryStrategy,
            trimmed,
            googleReason,
          ),
        }
      }

      const reason = [
        googleReason,
        describeInsufficientSearchResults('Bing', bingResults, normalizedBing, requestedSites, query),
      ].filter(Boolean).join('；')
      return { results: [], reason: reason || '浏览器搜索未返回结果', strategy: 'google+bing' }
    } catch (err) {
      const bingReason = describeSearchError(err, 'Bing 搜索失败')
      console.log(`${LOG_PREFIX} Bing search also failed:`, err)
      return {
        results: [],
        reason: [googleReason, bingReason].filter(Boolean).join('；') || '浏览器搜索失败',
        strategy: 'google+bing',
      }
    }
  }

  /* ── Google 搜索 ── */

  private async searchWithGoogle(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    return this.searchWithConfiguredEngine(
      'google.com',
      'google',
      query,
      options,
      {
        mode: 'search_engine',
        entryUrl: 'https://www.google.com/search',
        queryParam: 'q',
        languageParam: 'hl',
        languageMap: { zh: 'zh-CN', en: 'en' },
        recencyParam: 'tbs',
        recencyMap: {
          day: 'qdr:d',
          week: 'qdr:w',
          month: 'qdr:m',
          year: 'qdr:y',
        },
        waitSelector: 'div.g, div[data-hveid] div.tF2Cxc',
        resultSelector: 'div.g, div[data-hveid] div.tF2Cxc',
        titleSelectors: ['h3'],
        linkSelector: 'a[href^="http"]',
        snippetSelectors: ['div.VwiC3b', 'span.aCOpRe', 'div[data-sncf] span', 'div.IsZvec'],
        blockedPatterns: [
          '异常流量',
          'unusual traffic',
          'our systems have detected unusual traffic',
          'not a robot',
        ],
      },
    )
  }

  /* ── Bing 搜索 ── */

  private async searchWithBing(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    return this.searchWithConfiguredEngine(
      'bing.com',
      'bing',
      query,
      options,
      {
        mode: 'search_engine',
        entryUrl: 'https://www.bing.com/search',
        queryParam: 'q',
        languageParam: 'setlang',
        languageMap: { zh: 'zh-Hans', en: 'en' },
        recencyParam: 'filters',
        recencyMap: {
          day: 'ex1:"ez1"',
          week: 'ex1:"ez2"',
          month: 'ex1:"ez3"',
        },
        waitSelector: 'li.b_algo',
        resultSelector: 'li.b_algo',
        titleSelectors: ['h2 a'],
        linkSelector: 'h2 a',
        snippetSelectors: ['p.b_lineclamp2', 'div.b_caption p', 'p'],
        blockedPatterns: [
          '请解决以下难题以继续',
          'solve the following puzzle to continue',
          'verify you are human',
          'prove you are human',
        ],
      },
    )
  }

  private async searchWithConfiguredSiteSearch(
    pattern: SitePattern,
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    const automation = pattern.automation?.search
    if (!automation) return []

    if (isSiteSearchEngineAutomation(automation)) {
      const keyword = extractSiteSearchKeyword(query, [pattern.domain, ...pattern.aliases])
      if (!keyword) return []
      return this.searchWithDirectEngineConfig(pattern.domain, pattern.domain, keyword, options, automation)
    }

    if (!isSiteSearchFormAutomation(automation)) return []

    let targetId: string | null = null

    try {
      const keyword = extractSiteSearchKeyword(
        query,
        automation.keywordAliases?.length
          ? automation.keywordAliases
          : [pattern.domain, ...pattern.aliases],
      )
      if (!keyword) return []

      console.log(`${LOG_PREFIX} Searching via ${pattern.domain} site search: "${keyword}"`)

      targetId = await this.openTab(automation.entryUrl)
      await sleep(1_500)

      const triggerScript = buildSiteSearchTriggerScript(automation, keyword)
      const triggerResult = await this.evalInTab(targetId, triggerScript)
      if (triggerResult && typeof triggerResult === 'object' && 'error' in triggerResult) {
        throw new Error(String(triggerResult.error))
      }

      if (automation.waitUrlIncludes) {
        await this.waitForUrlIncludes(targetId, automation.waitUrlIncludes, 8_000)
      }
      if (automation.waitSelector) {
        await this.waitForSelector(targetId, automation.waitSelector, 8_000).catch(() => {})
      }
      await sleep(automation.postSubmitDelayMs ?? 1_500)

      const results = await this.extractSearchResults(
        targetId,
        buildSearchExtractScript(automation),
        pattern.domain,
      )
      const maxResults = options?.maxResults ?? 10
      return results.slice(0, maxResults)
    } finally {
      if (targetId) {
        await this.closeTab(targetId).catch(() => {})
      }
    }
  }

  private resolveSiteSearchPattern(
    query: string,
    requestedSites: string[],
  ): SitePattern | null {
    if (requestedSites.length > 1) return null

    const fromRequestedSites = requestedSites
      .map(site => this.siteKnowledge?.getPattern(site) ?? null)
      .filter((pattern): pattern is SitePattern => Boolean(pattern))
      .find(pattern => Boolean(pattern.automation?.search))

    if (fromRequestedSites) return fromRequestedSites

    const fromQuery = this.siteKnowledge?.matchQuery(query) ?? null
    if (fromQuery && fromQuery.automation?.search) {
      return fromQuery
    }

    return null
  }

  private async searchWithConfiguredEngine(
    domain: string,
    source: string,
    query: string,
    options: SearchOptions | undefined,
    fallbackConfig: SiteSearchEngineAutomation,
  ): Promise<SearchResult[]> {
    let targetId: string | null = null

    try {
      console.log(`${LOG_PREFIX} Searching via ${source}: "${query}"`)

      const pattern = this.siteKnowledge?.getPattern(domain) ?? null
      const automation = pattern?.automation?.search
      const config = isSiteSearchEngineAutomation(automation)
        ? automation
        : fallbackConfig
      const searchUrl = buildSearchEngineUrl(config, query, options)

      targetId = await this.openTab(searchUrl)
      await this.dismissSelectors(targetId, config.dismissSelectors || [])

      if (config.waitSelector) {
        await this.waitForSelector(targetId, config.waitSelector, SEARCH_LOAD_WAIT_MS)
          .catch(() => {})
      } else {
        await this.waitForResults(
          targetId,
          `(() => document.querySelectorAll(${JSON.stringify(config.resultSelector)}).length)()`,
          SEARCH_LOAD_WAIT_MS,
        )
      }

      const results = await this.extractSearchResults(
        targetId,
        buildSearchExtractScript(config),
        source,
      )
      const maxResults = options?.maxResults ?? 10
      const trimmed = results.slice(0, maxResults)

      if (!trimmed.length) {
        const blockedReason = await this.detectBlockedPage(
          targetId,
          config.blockedPatterns || [],
          source,
        )
        if (blockedReason) {
          throw new Error(blockedReason)
        }
      }

      console.log(`${LOG_PREFIX} ${source} search returned ${trimmed.length} results`)
      return trimmed
    } finally {
      if (targetId) {
        await this.closeTab(targetId).catch(() => {})
      }
    }
  }

  private async searchWithDirectEngineConfig(
    domain: string,
    source: string,
    query: string,
    options: SearchOptions | undefined,
    config: SiteSearchEngineAutomation,
  ): Promise<SearchResult[]> {
    let targetId: string | null = null

    try {
      console.log(`${LOG_PREFIX} Searching via ${source} direct site search: "${query}"`)
      const searchUrl = buildSearchEngineUrl(config, query, options)
      targetId = await this.openTab(searchUrl)
      await this.dismissSelectors(targetId, config.dismissSelectors || [])

      if (config.waitSelector) {
        await this.waitForSelector(targetId, config.waitSelector, SEARCH_LOAD_WAIT_MS).catch(() => {})
      }

      const results = await this.extractSearchResults(
        targetId,
        buildSearchExtractScript(config),
        source,
      )
      const trimmed = results.slice(0, options?.maxResults ?? 10)
      if (!trimmed.length) {
        const blockedReason = await this.detectBlockedPage(
          targetId,
          config.blockedPatterns || [],
          source,
        )
        if (blockedReason) {
          throw new Error(blockedReason)
        }
      }

      console.log(`${LOG_PREFIX} ${domain} direct site search returned ${trimmed.length} results`)
      return trimmed
    } finally {
      if (targetId) {
        await this.closeTab(targetId).catch(() => {})
      }
    }
  }

  /* ── 等待搜索结果容器出现（性能优化：提前退出）── */

  private async waitForResults(
    targetId: string,
    containerCheckScript: string,
    maxWaitMs: number,
  ): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < maxWaitMs) {
      try {
        const count = await this.evalInTab(targetId, containerCheckScript)
        if (typeof count === 'number' && count > 0) {
          console.log(`${LOG_PREFIX} Search results container detected (${count} items) after ${Date.now() - start}ms`)
          return
        }
      } catch {
        // eval 失败（页面可能还在加载），继续等待
      }
      await sleep(SEARCH_POLL_INTERVAL_MS)
    }
    // 超时：仍然尝试提取，结果可能为空
    console.log(`${LOG_PREFIX} Search results wait timed out after ${maxWaitMs}ms, attempting extraction anyway`)
  }

  private async waitForUrlIncludes(
    targetId: string,
    fragment: string,
    maxWaitMs: number,
  ): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < maxWaitMs) {
      try {
        const currentUrl = await this.evalInTab(targetId, 'location.href')
        if (typeof currentUrl === 'string' && currentUrl.includes(fragment)) {
          return
        }
      } catch {
        // Page may still be navigating.
      }
      await sleep(250)
    }
    throw new Error(`Timed out waiting for URL to include "${fragment}"`)
  }

  private async waitForSelector(
    targetId: string,
    selector: string,
    maxWaitMs: number,
  ): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < maxWaitMs) {
      try {
        const found = await this.evalInTab(
          targetId,
          `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
        )
        if (found === true) {
          return
        }
      } catch {
        // Page may still be navigating.
      }
      await sleep(250)
    }
    throw new Error(`Timed out waiting for selector "${selector}"`)
  }

  private async dismissSelectors(targetId: string, selectors: string[]): Promise<void> {
    if (selectors.length === 0) return
    const script = `
      (() => {
        const selectors = ${JSON.stringify(selectors)};
        let clicked = 0;
        for (const selector of selectors) {
          const node = document.querySelector(selector);
          if (!node) continue;
          node.click();
          clicked += 1;
        }
        return clicked;
      })()
    `
    try {
      const clicked = await this.evalInTab(targetId, script)
      if (typeof clicked === 'number' && clicked > 0) {
        await sleep(400)
      }
    } catch {
      // Non-fatal; continue.
    }
  }

  /* ── 从搜索页面提取结果 ── */

  private async extractSearchResults(
    targetId: string,
    extractScript: string,
    source: string,
  ): Promise<SearchResult[]> {
    const evalResult = await this.evalInTab(targetId, extractScript)

    if (typeof evalResult !== 'string') return []

    try {
      const parsed = JSON.parse(evalResult) as Array<{ title: string; url: string; snippet: string }>
      return parsed.map((item) => ({
        title: item.title,
        url: normalizeSearchResultUrl(item.url, source),
        snippet: item.snippet,
        source,
      }))
    } catch {
      console.log(`${LOG_PREFIX} Failed to parse ${source} search results JSON`)
      return []
    }
  }

  private async detectBlockedPage(
    targetId: string,
    blockedPatterns: string[],
    source: string,
  ): Promise<string | null> {
    try {
      const pageText = await this.evalInTab(targetId, SEARCH_PAGE_TEXT_SCRIPT)
      if (typeof pageText !== 'string') return null

      const normalized = pageText.toLowerCase()
      for (const pattern of blockedPatterns) {
        if (normalized.includes(pattern.toLowerCase())) {
          return `${source} 搜索页被反爬拦截`
        }
      }
    } catch {
      return null
    }

    return null
  }

  /* ── 页面阅读 ── */

  async readPage(url: string, format?: 'text' | 'markdown' | 'html'): Promise<PageContent> {
    let targetId: string | null = null

    try {
      console.log(`${LOG_PREFIX} Reading page: ${url}`)
      const hostname = extractHostname(url)
      const pattern = this.siteKnowledge?.getPattern(hostname) ?? null
      const readAutomation = pattern?.automation?.read ?? null
      const outputFormat = format ?? 'text'
      const extractionStrategy = getReadExtractionStrategy(readAutomation, outputFormat)

      // 1. 打开页面
      targetId = await this.openTab(url)

      // 2. 等待页面动态内容加载
      // 注意：cdp-proxy 的 /new 端点已经 waitForLoad（等待 DOMContentLoaded），
      // 但很多现代 SPA 页面在 DOMContentLoaded 后仍需时间渲染动态内容（如 React hydration、
      // 懒加载图片、AJAX 请求等）。这里额外等待以提高内容提取的完整性。
      // TODO: 可改为轮询 document.readyState === 'complete' + 内容稳定检测，减少不必要等待。
      await sleep(PAGE_LOAD_WAIT_MS)
      if (readAutomation?.waitUrlIncludes) {
        await this.waitForUrlIncludes(targetId, readAutomation.waitUrlIncludes, 8_000)
          .catch(() => {})
      }
      if (readAutomation?.readySelector) {
        await this.waitForSelector(targetId, readAutomation.readySelector, 8_000)
          .catch(() => {})
      }

      // 3. 提取内容
      const extractScript = buildExtractionScript(pattern, url, format ?? 'text')
      const evalResult = await this.evalInTab(targetId, extractScript)

      let title = ''
      let content = ''

      if (typeof evalResult === 'string') {
        try {
          const parsed = JSON.parse(evalResult) as { title: string; content: string }
          title = parsed.title ?? ''
          content = parsed.content ?? ''
        } catch {
          // evalResult 可能直接就是文本内容
          content = evalResult
        }
      }

      console.log(
        `${LOG_PREFIX} Read page: title="${title.slice(0, 60)}", content=${content.length} chars`,
      )

      return {
        url,
        title,
        content,
        format: outputFormat,
        fetchMethod: 'cdp',
        strategy: extractionStrategy,
      }
    } catch (err) {
      const errorMsg = String(err)
      console.log(`${LOG_PREFIX} Read page failed: ${errorMsg}`)

      return {
        url,
        title: '',
        content: '',
        format: format ?? 'text',
        fetchMethod: 'cdp',
        strategy: getReadExtractionStrategy(null, format ?? 'text'),
        error: errorMsg,
      }
    } finally {
      if (targetId) {
        await this.closeTab(targetId).catch(() => {})
      }
    }
  }

  /* ── 截图 ── */

  async screenshot(url: string, filePath: string): Promise<{ filePath: string }> {
    let targetId: string | null = null

    try {
      console.log(`${LOG_PREFIX} Taking screenshot: ${url}`)

      // 1. 打开页面
      targetId = await this.openTab(url)

      // 2. 等待页面加载
      await sleep(PAGE_LOAD_WAIT_MS)

      // 3. 截图
      const screenshotUrl = new URL(`${this.baseUrl}/screenshot`)
      screenshotUrl.searchParams.set('target', targetId)
      screenshotUrl.searchParams.set('file', filePath)

      const response = await fetch(screenshotUrl.toString(), {
        signal: AbortSignal.timeout(CDP_TIMEOUT_MS),
      })

      if (!response.ok) {
        throw new Error(`Screenshot API returned ${response.status}: ${response.statusText}`)
      }

      console.log(`${LOG_PREFIX} Screenshot saved: ${filePath}`)
      return { filePath }
    } finally {
      if (targetId) {
        await this.closeTab(targetId).catch(() => {})
      }
    }
  }

  /* ┌────────────────────────────────────────────────────────────────────────┐
   * │                     CDP Proxy 通信方法                                  │
   * └────────────────────────────────────────────────────────────────────────┘ */

  /**
   * 打开新标签页，返回 targetId
   */
  private async openTab(url: string): Promise<string> {
    const newTabUrl = new URL(`${this.baseUrl}/new`)
    newTabUrl.searchParams.set('url', url)

    const response = await fetch(newTabUrl.toString(), {
      signal: AbortSignal.timeout(CDP_TIMEOUT_MS),
    })

    if (!response.ok) {
      throw new Error(`CDP /new failed with ${response.status}: ${response.statusText}`)
    }

    const data = (await response.json()) as CdpNewTabResponse
    if (!data.targetId) {
      throw new Error('CDP /new returned no targetId')
    }

    return data.targetId
  }

  /**
   * 在标签页中执行 JavaScript
   */
  private async evalInTab(targetId: string, expression: string): Promise<unknown> {
    const evalUrl = new URL(`${this.baseUrl}/eval`)
    evalUrl.searchParams.set('target', targetId)

    const response = await fetch(evalUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: expression,
      signal: AbortSignal.timeout(CDP_TIMEOUT_MS),
    })

    if (!response.ok) {
      throw new Error(`CDP /eval failed with ${response.status}: ${response.statusText}`)
    }

    const data = (await response.json()) as CdpEvalResponse

    if (data.error) {
      throw new Error(`CDP /eval error: ${data.error}`)
    }

    return data.value
  }

  /**
   * 关闭标签页
   */
  private async closeTab(targetId: string): Promise<void> {
    try {
      const closeUrl = new URL(`${this.baseUrl}/close`)
      closeUrl.searchParams.set('target', targetId)

      await fetch(closeUrl.toString(), {
        signal: AbortSignal.timeout(5_000),
      })
    } catch (err) {
      console.log(`${LOG_PREFIX} Failed to close tab ${targetId}:`, err)
    }
  }
}

function describeInsufficientSearchResults(
  engine: 'Google' | 'Bing',
  rawResults: SearchResult[],
  filteredResults: SearchResult[],
  requestedSites: string[],
  query: string,
): string {
  if (rawResults.length === 0) return `${engine} 搜索未返回结果`
  if (requestedSites.length > 0 && filteredResults.length === 0) {
    return `${engine} 搜索未返回指定站点结果（${requestedSites.join(', ')}）`
  }
  return `${engine} 搜索结果质量不足（score=${scoreSearchResults(filteredResults, query, requestedSites)})`
}

function rankResultSets(
  query: string,
  requestedSites: string[],
  first: SearchResult[],
  second: SearchResult[],
): SearchResult[][] {
  const firstScore = scoreSearchResults(first, query, requestedSites)
  const secondScore = scoreSearchResults(second, query, requestedSites)
  return firstScore >= secondScore ? [first, second] : [second, first]
}

function mergeSearchResults(resultSets: SearchResult[][]): SearchResult[] {
  const merged: SearchResult[] = []
  const seen = new Set<string>()

  for (const results of resultSets) {
    for (const result of results) {
      const key = result.url.trim()
      if (!key || seen.has(key)) continue
      seen.add(key)
      merged.push(result)
    }
  }

  return merged
}

function extractSiteSearchKeyword(query: string, siteAliases: string[]): string {
  let keyword = query.replace(/(?:^|\s)site:[^\s]+/gi, ' ')
  for (const alias of siteAliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    keyword = keyword.replace(new RegExp(escaped, 'ig'), ' ')
  }
  return keyword.replace(/\s+/g, ' ').trim()
}

function normalizeSearchResultUrl(url: string, source: string): string {
  if (source !== 'bing') return url

  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'www.bing.com' || parsed.pathname !== '/ck/a') {
      return url
    }

    const raw = parsed.searchParams.get('u') || parsed.searchParams.get('url') || ''
    if (!raw) return url

    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return raw
    }

    if (raw.startsWith('a1')) {
      const decoded = decodeBase64Url(raw.slice(2))
      if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
        return decoded
      }
    }
  } catch {
    return url
  }

  return url
}

function describeSearchError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message || fallback
  }
  if (typeof error === 'string' && error.trim()) {
    return error
  }
  return fallback
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return Buffer.from(padded, 'base64').toString('utf-8')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                         辅助函数                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function buildSearchEngineUrl(
  config: SiteSearchEngineAutomation,
  query: string,
  options?: SearchOptions,
): string {
  const url = new URL(config.entryUrl)
  url.searchParams.set(config.queryParam || 'q', query)

  const language = options?.language ?? 'auto'
  if (config.languageParam && language !== 'auto') {
    const languageValue = config.languageMap?.[language]
    if (languageValue) {
      url.searchParams.set(config.languageParam, languageValue)
    }
  }

  const recency = options?.recency ?? 'any'
  if (config.recencyParam && recency !== 'any') {
    const recencyValue = config.recencyMap?.[recency]
    if (recencyValue) {
      url.searchParams.set(config.recencyParam, recencyValue)
    }
  }

  return url.toString()
}

function buildSiteSearchTriggerScript(
  config: SiteSearchFormAutomation,
  keyword: string,
): string {
  return `
    (async () => {
      const dismissSelectors = ${JSON.stringify(config.dismissSelectors || [])};
      for (const selector of dismissSelectors) {
        const node = document.querySelector(selector);
        if (node) {
          node.click();
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      }

      const input = document.querySelector(${JSON.stringify(config.inputSelector)});
      if (!input) {
        return { error: '未找到站内搜索输入框' };
      }

      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, ${JSON.stringify(keyword)});
      else input.value = ${JSON.stringify(keyword)};

      input.focus();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 250));

      const trigger = document.querySelector(${JSON.stringify(config.submitSelector)});
      if (!trigger) {
        return { error: '未找到站内搜索提交按钮' };
      }

      trigger.click();
      return { ok: true, keyword: ${JSON.stringify(keyword)}, url: location.href };
    })()
  `
}

function buildSearchExtractScript(config: SiteSearchAutomation): string {
  const snippetSelectors = isSiteSearchEngineAutomation(config)
    ? config.snippetSelectors || []
    : []
  const snippetFields = isSiteSearchFormAutomation(config)
    ? config.snippetFields || []
    : []

  return `
    (() => {
      const cleanText = (value) => (value || '').replace(/\\s+/g, ' ').trim();
      const titleSelectors = ${JSON.stringify(config.titleSelectors || [])};
      const linkSelector = ${JSON.stringify(config.linkSelector || '')};
      const snippetSelectors = ${JSON.stringify(snippetSelectors)};
      const snippetFields = ${JSON.stringify(snippetFields)};

      const pickText = (root, selectors) => {
        for (const selector of selectors) {
          const node = root.querySelector(selector);
          const text = cleanText(node ? (node.textContent || '') : '');
          if (text) return text;
        }
        return '';
      };

      const resolveUrl = (root) => {
        const node = (linkSelector ? root.querySelector(linkSelector) : null) || root.querySelector('a[href]') || root;
        if (!node) return '';
        const href = node.href || (node.getAttribute ? node.getAttribute('href') : '') || '';
        if (!href) return '';
        try {
          return new URL(href, location.href).href;
        } catch {
          return href;
        }
      };

      const buildSnippet = (root) => {
        if (snippetFields.length > 0) {
          return snippetFields
            .map(field => {
              const node = root.querySelector(field.selector);
              const text = cleanText(node ? (node.textContent || '') : '');
              if (!text) return '';
              return (field.prefix || '') + text;
            })
            .filter(Boolean)
            .join(' · ');
        }

        for (const selector of snippetSelectors) {
          const node = root.querySelector(selector);
          const text = cleanText(node ? (node.textContent || '') : '');
          if (text) return text;
        }
        return '';
      };

      const results = [];
      const seen = new Set();
      const items = document.querySelectorAll(${JSON.stringify(config.resultSelector)});
      for (const item of items) {
        const contentRoot = item.matches && item.matches('a[href]')
          ? (item.parentElement || item)
          : item;
        const title = pickText(contentRoot, titleSelectors) || cleanText(contentRoot.textContent || '');
        const url = resolveUrl(item);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        results.push({
          title,
          url,
          snippet: buildSnippet(contentRoot),
        });
        if (results.length >= 10) break;
      }

      return JSON.stringify(results);
    })()
  `
}

/**
 * 构建页面内容提取的 JavaScript 代码
 */
function buildExtractionScript(
  pattern: SitePattern | null,
  url: string,
  format: 'text' | 'markdown' | 'html',
): string {
  const automation = pattern?.automation?.read

  if (isStructuredReadAutomation(automation) && format !== 'html') {
    return buildStructuredNoteExtractionScript(automation, format)
  }
  if (isStructuredVideoReadAutomation(automation) && format !== 'html') {
    return buildStructuredVideoExtractionScript(automation, format)
  }

  return buildGenericExtractionScript(format, automation)
}

function getReadExtractionStrategy(
  automation: SiteReadAutomation | null | undefined,
  format: 'text' | 'markdown' | 'html',
): string {
  if (format === 'html') return 'html_snapshot'
  if (isStructuredReadAutomation(automation)) return 'structured_note'
  if (isStructuredVideoReadAutomation(automation)) return 'structured_video'
  return 'generic'
}

function buildGenericExtractionScript(
  format: 'text' | 'markdown' | 'html',
  automation?: SiteReadAutomation | null,
): string {
  if (format === 'html') {
    return `
      JSON.stringify({
        title: document.title || '',
        content: document.documentElement.outerHTML,
      })
    `
  }

  const rootSelectors = automation?.mode === 'generic'
    ? automation.rootSelectors || ['article', 'main']
    : ['article', 'main']
  const removeSelectors = automation?.mode === 'generic'
    ? automation.removeSelectors || ['script', 'style', 'nav', 'footer', 'iframe', 'noscript']
    : ['script', 'style', 'nav', 'footer', 'iframe', 'noscript']

  return `
    (() => {
      const cleanText = (value) => (value || '').replace(/\\s+/g, ' ').trim();
      const rootSelectors = ${JSON.stringify(rootSelectors)};
      const removeSelectors = ${JSON.stringify(removeSelectors)};
      const cloned = document.body ? document.body.cloneNode(true) : document.documentElement.cloneNode(true);
      removeSelectors.forEach(sel => {
        cloned.querySelectorAll(sel).forEach(el => el.remove());
      });

      let root = cloned;
      for (const selector of rootSelectors) {
        const candidate = cloned.querySelector(selector);
        if (candidate) {
          root = candidate;
          break;
        }
      }

      const content = cleanText(root.innerText || root.textContent || '');

      return JSON.stringify({
        title: document.title || '',
        content,
      });
    })()
  `
}

function buildStructuredNoteExtractionScript(
  config: SiteReadStructuredAutomation,
  format: 'text' | 'markdown',
): string {
  const markdownOutput = format === 'markdown'

  return `
    (() => {
      const config = ${JSON.stringify(config)};
      const cleanText = (value) => (value || '').replace(/\\s+/g, ' ').trim();
      const unique = (items) => Array.from(new Set(items.filter(Boolean)));
      const pickText = (root, selectors = []) => {
        for (const selector of selectors) {
          const node = root.querySelector(selector);
          const text = cleanText(node ? (node.textContent || '') : '');
          if (text) return text;
        }
        return '';
      };
      const pickTexts = (root, selectors = []) => unique(
        selectors.flatMap(selector => Array.from(root.querySelectorAll(selector)).map(node => cleanText(node.textContent || '')))
      );
      const fallback = () => {
        const cloned = document.body ? document.body.cloneNode(true) : document.documentElement.cloneNode(true);
        ['script', 'style', 'nav', 'footer', 'iframe', 'noscript'].forEach(sel => {
          cloned.querySelectorAll(sel).forEach(el => el.remove());
        });
        const article = cloned.querySelector('article') || cloned.querySelector('main') || cloned;
        return {
          title: document.title || '',
          content: cleanText(article.innerText || article.textContent || ''),
        };
      };

      const root = document.querySelector(config.rootSelector);
      if (!root) {
        return JSON.stringify(fallback());
      }

      const title = pickText(root, config.titleSelectors) || cleanText(document.title || '');
      const author = pickText(root, config.authorSelectors);
      const publishedAt = pickText(root, config.publishedAtSelectors);
      const description = pickText(root, config.bodySelectors);
      const tags = pickTexts(root, config.tagSelectors);
      const likeCount = pickText(root, config.statSelectors?.like);
      const collectCount = pickText(root, config.statSelectors?.collect);
      const commentCount = pickText(root, config.statSelectors?.comment);
      const imageUrls = config.imageSelector
        ? unique(Array.from(root.querySelectorAll(config.imageSelector))
          .map(node => node.getAttribute('src') || node.getAttribute('data-src') || ''))
        : [];
      const comments = config.commentSelector
        ? Array.from(root.querySelectorAll(config.commentSelector))
          .map(item => {
            const content = pickText(item, config.commentBodySelectors);
            if (!content) return null;
            const author = pickText(item, config.commentAuthorSelectors);
            const meta = pickText(item, config.commentMetaSelectors);
            const isReply = config.replyCommentClass
              ? item.classList.contains(config.replyCommentClass)
              : false;
            return { author, content, meta, isReply };
          })
          .filter(Boolean)
          .slice(0, config.commentLimit || 5)
        : [];

      const headerParts = [
        author ? ('作者: ' + author) : '',
        publishedAt ? ('发布时间: ' + publishedAt) : '',
        likeCount ? ('点赞: ' + likeCount) : '',
        collectCount ? ('收藏: ' + collectCount) : '',
        commentCount ? ('评论: ' + commentCount) : '',
      ].filter(Boolean);

      let content = '';
      if (${markdownOutput ? 'true' : 'false'}) {
        const lines = [];
        if (title) lines.push('# ' + title, '');
        if (headerParts.length) lines.push(headerParts.join(' | '), '');
        if (description) lines.push(description, '');
        if (tags.length) lines.push('标签: ' + tags.join(' '), '');
        if (imageUrls.length) {
          lines.push('图片:');
          imageUrls.slice(0, 8).forEach(url => lines.push('- ' + url));
          lines.push('');
        }
        if (comments.length) {
          lines.push('热门评论:');
          comments.forEach(comment => {
            const meta = [comment.author, comment.meta, comment.isReply ? '回复' : '评论'].filter(Boolean).join(' | ');
            lines.push('- ' + meta);
            lines.push('  ' + comment.content);
          });
          lines.push('');
        }
        content = lines.join('\\n').trim();
      } else {
        const parts = [];
        if (title) parts.push(title);
        if (headerParts.length) parts.push(headerParts.join(' | '));
        if (description) parts.push(description);
        if (tags.length) parts.push('标签: ' + tags.join(' '));
        if (imageUrls.length) parts.push('图片: ' + imageUrls.slice(0, 8).join('\\n'));
        if (comments.length) {
          parts.push('热门评论:');
          comments.forEach(comment => {
            const meta = [comment.author, comment.meta, comment.isReply ? '回复' : '评论'].filter(Boolean).join(' | ');
            parts.push(meta + '\\n' + comment.content);
          });
        }
        content = parts.join('\\n\\n').trim();
      }

      return JSON.stringify({ title, content });
    })()
  `
}

function buildStructuredVideoExtractionScript(
  config: SiteReadStructuredVideoAutomation,
  format: 'text' | 'markdown',
): string {
  const markdownOutput = format === 'markdown'

  return `
    (() => {
      const config = ${JSON.stringify(config)};
      const cleanText = (value) => (value || '').replace(/\\s+/g, ' ').trim();
      const unique = (items) => Array.from(new Set(items.filter(Boolean)));
      const pickText = (root, selectors = []) => {
        for (const selector of selectors || []) {
          const node = root.querySelector(selector);
          const text = cleanText(node ? (node.textContent || '') : '');
          if (text) return text;
        }
        return '';
      };
      const pickTexts = (root, selectors = []) => unique(
        (selectors || []).flatMap(selector =>
          Array.from(root.querySelectorAll(selector)).map(node => cleanText(node.textContent || ''))
        )
      );
      const root = config.rootSelector ? document.querySelector(config.rootSelector) : document;
      const scope = root || document;
      const fallback = () => {
        const cloned = document.body ? document.body.cloneNode(true) : document.documentElement.cloneNode(true);
        ['script', 'style', 'nav', 'footer', 'iframe', 'noscript', 'aside'].forEach(sel => {
          cloned.querySelectorAll(sel).forEach(el => el.remove());
        });
        const content = cleanText(cloned.innerText || cloned.textContent || '');
        return {
          title: cleanText(document.title || ''),
          content,
        };
      };

      const title = pickText(scope, config.titleSelectors) || cleanText(document.title || '');
      const author = pickText(scope, config.authorSelectors);
      const publishedAt = pickText(scope, config.publishedAtSelectors);
      const viewCount = pickText(scope, config.viewCountSelectors);
      const description = pickText(scope, config.descriptionSelectors);
      const tags = pickTexts(scope, config.tagSelectors);
      const transcriptSegments = config.transcriptContainerSelectors && config.transcriptContainerSelectors.length > 0
        ? unique(
          config.transcriptContainerSelectors.flatMap(containerSelector => {
            const container = document.querySelector(containerSelector);
            if (!container) return [];
            const segmentSelectors = config.transcriptSegmentSelectors && config.transcriptSegmentSelectors.length > 0
              ? config.transcriptSegmentSelectors
              : ['[class*="segment"]', '[class*="cue-group"]', '[class*="transcript"] span'];
            return segmentSelectors.flatMap(segmentSelector =>
              Array.from(container.querySelectorAll(segmentSelector)).map(node => cleanText(node.textContent || ''))
            );
          })
        )
        : [];

      const headerParts = [
        author ? ('作者: ' + author) : '',
        publishedAt ? ('发布时间: ' + publishedAt) : '',
        viewCount ? ('观看: ' + viewCount) : '',
      ].filter(Boolean);

      let content = '';
      if (${markdownOutput ? 'true' : 'false'}) {
        const lines = [];
        if (title) lines.push('# ' + title, '');
        if (headerParts.length) lines.push(headerParts.join(' | '), '');
        if (description) lines.push(description, '');
        if (tags.length) lines.push('标签: ' + tags.join(' '), '');
        if (transcriptSegments.length) {
          lines.push('字幕/Transcript:');
          transcriptSegments.slice(0, 80).forEach(segment => lines.push('- ' + segment));
          lines.push('');
        }
        content = lines.join('\\n').trim();
      } else {
        const parts = [];
        if (title) parts.push(title);
        if (headerParts.length) parts.push(headerParts.join(' | '));
        if (description) parts.push(description);
        if (tags.length) parts.push('标签: ' + tags.join(' '));
        if (transcriptSegments.length) {
          parts.push('字幕/Transcript:\\n' + transcriptSegments.slice(0, 80).join('\\n'));
        }
        content = parts.join('\\n\\n').trim();
      }

      if (!content || content.length < 80) {
        return JSON.stringify(fallback());
      }

      return JSON.stringify({ title, content });
    })()
  `
}

function isSiteSearchEngineAutomation(
  config: SiteSearchAutomation | undefined,
): config is SiteSearchEngineAutomation {
  return Boolean(config && config.mode === 'search_engine')
}

function isSiteSearchFormAutomation(
  config: SiteSearchAutomation | undefined,
): config is SiteSearchFormAutomation {
  return Boolean(config && config.mode === 'site_form')
}

function isStructuredReadAutomation(
  config: SiteReadAutomation | null | undefined,
): config is SiteReadStructuredAutomation {
  return Boolean(config && config.mode === 'structured_note')
}

function isStructuredVideoReadAutomation(
  config: SiteReadAutomation | null | undefined,
): config is SiteReadStructuredVideoAutomation {
  return Boolean(config && config.mode === 'structured_video')
}

function buildSiteSearchSuccessObservation(
  domain: string,
  strategy: string,
  results: SearchResult[],
): ResearchObservation {
  return {
    kind: 'site_search_success',
    domain,
    strategy,
    url: findResultUrlForDomain(results, domain) || results[0]?.url,
    message: `${domain} 站内搜索自动化成功返回结果`,
  }
}

function buildSiteSearchFallbackObservations(
  pattern: SitePattern | null,
  siteSearchAttempted: boolean,
  strategy: string,
  results: SearchResult[],
  failureReason?: string,
): ResearchObservation[] | undefined {
  if (!pattern || !siteSearchAttempted || results.length === 0) return undefined

  const matchedUrl = findResultUrlForDomain(results, pattern.domain)
  if (!matchedUrl) return undefined

  return [
    {
      kind: 'site_search_fallback',
      domain: pattern.domain,
      strategy,
      url: matchedUrl,
      message: failureReason
        ? `${pattern.domain} 站内搜索未命中后，${humanizeSearchStrategy(strategy)} fallback 成功`
        : `${pattern.domain} 站内搜索之后，${humanizeSearchStrategy(strategy)} fallback 成功`,
    },
  ]
}

function findResultUrlForDomain(results: SearchResult[], domain: string): string | undefined {
  for (const result of results) {
    const hostname = extractHostname(result.url)
    if (!hostname) continue
    if (hostname === domain || hostname.endsWith(`.${domain}`) || domain.endsWith(`.${hostname}`)) {
      return result.url
    }
  }
  return undefined
}

function humanizeSearchStrategy(strategy: string): string {
  switch (strategy) {
    case 'google':
      return 'Google'
    case 'bing':
      return 'Bing'
    case 'google+bing':
      return 'Google/Bing'
    default:
      return strategy
  }
}

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Promise-based sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
