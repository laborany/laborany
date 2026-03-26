/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                 Web Research Backend — 统一接口定义                       ║
 * ║                                                                        ║
 * ║  职责：定义搜索后端与页面读取器的统一协议                                    ║
 * ║  设计：纯类型，零运行时开销                                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                          搜索结果                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export interface SearchResult {
  title: string
  url: string
  snippet: string
  source?: string       // 来源平台名
  publishedAt?: string  // 发布时间
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                          搜索选项                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export interface SearchOptions {
  language?: 'zh' | 'en' | 'auto'
  recency?: 'day' | 'week' | 'month' | 'year' | 'any'
  maxResults?: number
  site?: string
  sites?: string[]
  engine?: 'auto' | 'google' | 'bing'
}

export interface ResearchRequestContext {
  apiKey?: string
  baseUrl?: string
  interfaceType?: string
  model?: string
  taskDir?: string
}

export interface ResearchObservation {
  kind: 'site_search_success' | 'site_search_fallback' | 'structured_read' | 'browser_fallback'
  domain?: string
  url?: string
  strategy?: string
  message?: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                          页面内容                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export interface PageContent {
  url: string
  title: string
  content: string       // markdown 或纯文本
  format: 'markdown' | 'text' | 'html'
  fetchMethod: string   // 记录使用的方法：'jina' | 'static' | 'cdp' | 'zhipu'
  strategy?: string
  observations?: ResearchObservation[]
  error?: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                         搜索后端接口                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export interface SearchBackend {
  name: string
  isAvailable(): Promise<boolean>
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                         页面读取器接口                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export interface PageReader {
  name: string
  isAvailable(): Promise<boolean>
  readPage(url: string, format?: 'text' | 'markdown' | 'html'): Promise<PageContent>
}
