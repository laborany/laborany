/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                   Jina Reader 适配器 (Jina Reader Adapter)               ║
 * ║                                                                        ║
 * ║  职责：通过 r.jina.ai 将网页转换为 Markdown（免费，20 RPM）                 ║
 * ║  设计：仅实现 PageReader，不支持搜索                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { PageReader, PageContent } from './types.js'

const LOG_PREFIX = '[WebResearch:Jina]'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                          常量                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */

const JINA_BASE_URL = 'https://r.jina.ai/'
const JINA_TIMEOUT_MS = 10_000

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       JinaReaderAdapter                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export class JinaReaderAdapter implements PageReader {
  readonly name = 'jina'

  /* ── 可用性检查 ── */

  async isAvailable(): Promise<boolean> {
    return true
  }

  /* ── 页面阅读 ── */

  async readPage(url: string, format?: 'text' | 'markdown' | 'html'): Promise<PageContent> {
    try {
      console.log(`${LOG_PREFIX} Reading page: ${url}`)

      // Jina Reader URL 格式：https://r.jina.ai/{完整url}
      const jinaUrl = `${JINA_BASE_URL}${url}`

      const acceptHeader =
        format === 'html'
          ? 'text/html'
          : format === 'text'
            ? 'text/plain'
            : 'text/markdown'

      const response = await fetch(jinaUrl, {
        method: 'GET',
        headers: {
          Accept: acceptHeader,
          'User-Agent': 'LaborAny-WebResearch/1.0',
        },
        signal: AbortSignal.timeout(JINA_TIMEOUT_MS),
      })

      // 处理 429 限频错误
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After')
        console.log(
          `${LOG_PREFIX} Rate limited (429).${retryAfter ? ` Retry-After: ${retryAfter}s` : ''}`,
        )
        return {
          url,
          title: '',
          content: '',
          format: format ?? 'markdown',
          fetchMethod: 'jina',
          error: `Rate limited (429). ${retryAfter ? `Retry after ${retryAfter}s` : 'Try again later.'}`,
        }
      }

      if (!response.ok) {
        console.log(`${LOG_PREFIX} HTTP ${response.status}: ${response.statusText}`)
        return {
          url,
          title: '',
          content: '',
          format: format ?? 'markdown',
          fetchMethod: 'jina',
          error: `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      const content = await response.text()

      // 从 Jina 返回的 Markdown 中提取标题
      const title = extractTitleFromMarkdown(content)
      const outputFormat = format ?? 'markdown'

      console.log(
        `${LOG_PREFIX} Read page: title="${title.slice(0, 60)}", content=${content.length} chars`,
      )

      return {
        url,
        title,
        content,
        format: outputFormat,
        fetchMethod: 'jina',
      }
    } catch (err) {
      const errorMsg =
        err instanceof DOMException && err.name === 'TimeoutError'
          ? `Timed out after ${JINA_TIMEOUT_MS}ms`
          : String(err)

      console.log(`${LOG_PREFIX} Read page failed: ${errorMsg}`)

      return {
        url,
        title: '',
        content: '',
        format: format ?? 'markdown',
        fetchMethod: 'jina',
        error: errorMsg,
      }
    }
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                         辅助函数                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/**
 * 从 Markdown 内容中提取标题
 *
 * 查找第一个 `# ` 或 `Title: ` 开头的行
 */
function extractTitleFromMarkdown(markdown: string): string {
  const lines = markdown.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()

    // Jina 有时返回 `Title: xxx` 格式
    if (trimmed.startsWith('Title: ')) {
      return trimmed.slice(7).trim()
    }

    // 标准 Markdown 标题
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim()
    }
  }
  return ''
}
