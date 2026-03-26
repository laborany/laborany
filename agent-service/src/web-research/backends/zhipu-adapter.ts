/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    智谱搜索适配器 (Zhipu Search Adapter)                  ║
 * ║                                                                        ║
 * ║  职责：通过智谱 API 提供搜索与页面阅读能力（可选后端，需 API Key）            ║
 * ║  设计：直接 HTTP POST 调用，不走 MCP 协议                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { SearchBackend, PageReader, SearchResult, SearchOptions, PageContent } from './types.js'
import { collectRequestedSites, filterSearchResultsBySites } from './search-utils.js'

const LOG_PREFIX = '[WebResearch:Zhipu]'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                        API 端点常量                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */

const ZHIPU_SEARCH_URL = 'https://open.bigmodel.cn/api/paas/v4/tools'
const ZHIPU_TIMEOUT_MS = 15_000

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                   智谱搜索响应类型（内部使用）                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */

interface ZhipuWebSearchItem {
  title?: string
  link?: string
  content?: string
  media?: string
}

interface ZhipuToolCallEntry {
  type: string
  function?: {
    name: string
    arguments: string
  }
  search_result?: ZhipuWebSearchItem[]
}

interface ZhipuChoice {
  message?: {
    tool_calls?: ZhipuToolCallEntry[]
    web_search?: ZhipuWebSearchItem[]
  }
}

interface ZhipuApiResponse {
  choices?: ZhipuChoice[]
  web_search?: ZhipuWebSearchItem[]
  search_result?: ZhipuWebSearchItem[]
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       ZhipuSearchAdapter                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export class ZhipuSearchAdapter implements SearchBackend, PageReader {
  readonly name = 'zhipu'
  private readonly apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  /* ── 可用性检查 ── */

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey
  }

  /* ── 搜索 ── */

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    if (!this.apiKey) {
      console.log(`${LOG_PREFIX} API key not configured, skipping`)
      return []
    }

    try {
      console.log(`${LOG_PREFIX} Searching: "${query}"`)

      const body: Record<string, unknown> = {
        model: 'web-search-pro',
        messages: [{ role: 'user', content: query }],
        tools: [
          {
            type: 'web_search',
            web_search: {
              enable: true,
              search_query: query,
              ...(options?.recency && options.recency !== 'any'
                ? { search_recency: options.recency }
                : {}),
            },
          },
        ],
        stream: false,
      }

      if (options?.language && options.language !== 'auto') {
        body.search_language = options.language
      }

      const response = await fetch(ZHIPU_SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(ZHIPU_TIMEOUT_MS),
      })

      if (!response.ok) {
        console.log(`${LOG_PREFIX} Search API returned ${response.status}: ${response.statusText}`)
        return []
      }

      const data = (await response.json()) as ZhipuApiResponse
      const results = this.extractSearchResults(data)
      const requestedSites = collectRequestedSites(query, options)
      const constrainedResults = filterSearchResultsBySites(results, requestedSites)

      const maxResults = options?.maxResults ?? 10
      const trimmed = constrainedResults.slice(0, maxResults)

      if (requestedSites.length > 0 && results.length > 0 && trimmed.length === 0) {
        console.log(
          `${LOG_PREFIX} Search ignored requested sites (${requestedSites.join(', ')}), forcing fallback`,
        )
      } else {
        console.log(`${LOG_PREFIX} Search returned ${trimmed.length} results`)
      }
      return trimmed
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        console.log(`${LOG_PREFIX} Search timed out after ${ZHIPU_TIMEOUT_MS}ms`)
      } else {
        console.log(`${LOG_PREFIX} Search failed:`, err)
      }
      return []
    }
  }

  /* ── 页面阅读 ── */

  async readPage(url: string, format?: 'text' | 'markdown' | 'html'): Promise<PageContent> {
    if (!this.apiKey) {
      return {
        url,
        title: '',
        content: '',
        format: format ?? 'text',
        fetchMethod: 'zhipu',
        error: 'API key not configured',
      }
    }

    try {
      console.log(`${LOG_PREFIX} Reading page: ${url}`)

      const body = {
        model: 'web-search-pro',
        messages: [
          { role: 'user', content: `请阅读以下网页并提取内容：${url}` },
        ],
        tools: [
          {
            type: 'web_search',
            web_search: {
              enable: true,
              search_query: url,
            },
          },
        ],
        stream: false,
      }

      const response = await fetch(ZHIPU_SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(ZHIPU_TIMEOUT_MS),
      })

      if (!response.ok) {
        return {
          url,
          title: '',
          content: '',
          format: format ?? 'text',
          fetchMethod: 'zhipu',
          error: `API returned ${response.status}`,
        }
      }

      const data = (await response.json()) as ZhipuApiResponse

      // 从搜索结果中找到匹配目标 URL 的条目
      const items = this.extractSearchResults(data)
      const matched = items.find((item) => item.url === url) ?? items[0]

      const title = matched?.title ?? ''
      const content = matched?.snippet ?? ''
      const outputFormat = format ?? 'text'

      console.log(
        `${LOG_PREFIX} Read page: title="${title.slice(0, 60)}", content=${content.length} chars`,
      )

      return { url, title, content, format: outputFormat, fetchMethod: 'zhipu' }
    } catch (err) {
      const errorMsg =
        err instanceof DOMException && err.name === 'TimeoutError'
          ? `Timed out after ${ZHIPU_TIMEOUT_MS}ms`
          : String(err)

      console.log(`${LOG_PREFIX} Read page failed:`, errorMsg)

      return {
        url,
        title: '',
        content: '',
        format: format ?? 'text',
        fetchMethod: 'zhipu',
        error: errorMsg,
      }
    }
  }

  /* ┌────────────────────────────────────────────────────────────────────────┐
   * │                    内部：提取搜索结果                                    │
   * └────────────────────────────────────────────────────────────────────────┘ */

  /**
   * 从智谱 API 响应中统一提取搜索结果
   *
   * 智谱返回格式多变，兼容以下路径：
   *   - choices[].message.tool_calls[].search_result[]
   *   - choices[].message.web_search[]
   *   - web_search[]  (顶层)
   *   - search_result[] (顶层)
   */
  private extractSearchResults(data: ZhipuApiResponse): SearchResult[] {
    const results: SearchResult[] = []
    const seen = new Set<string>()

    const push = (items: ZhipuWebSearchItem[]) => {
      for (const item of items) {
        if (item.title && item.link && !seen.has(item.link)) {
          seen.add(item.link)
          results.push({
            title: item.title,
            url: item.link,
            snippet: item.content ?? '',
            source: item.media ?? 'zhipu',
          })
        }
      }
    }

    // Path 1: choices[].message.tool_calls[].search_result[]
    for (const choice of data.choices ?? []) {
      for (const call of choice.message?.tool_calls ?? []) {
        if (call.search_result) push(call.search_result)
      }
      // Path 2: choices[].message.web_search[]
      if (choice.message?.web_search) push(choice.message.web_search)
    }

    // Path 3: 顶层 web_search
    if (data.web_search) push(data.web_search)

    // Path 4: 顶层 search_result
    if (data.search_result) push(data.search_result)

    return results
  }
}
