/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                 静态 HTTP 抓取适配器 (Static Fetch Adapter)               ║
 * ║                                                                        ║
 * ║  职责：用原生 fetch 抓取网页 HTML 并转为纯文本                               ║
 * ║  设计：零外部依赖，简单正则清洗 HTML                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { PageReader, PageContent } from './types.js'

const LOG_PREFIX = '[WebResearch:Static]'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                          常量                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */

const STATIC_TIMEOUT_MS = 15_000
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      StaticFetchAdapter                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export class StaticFetchAdapter implements PageReader {
  readonly name = 'static'

  /* ── 可用性检查 ── */

  async isAvailable(): Promise<boolean> {
    return true
  }

  /* ── 页面阅读 ── */

  async readPage(url: string, format?: 'text' | 'markdown' | 'html'): Promise<PageContent> {
    try {
      console.log(`${LOG_PREFIX} Fetching page: ${url}`)

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(STATIC_TIMEOUT_MS),
      })

      if (!response.ok) {
        console.log(`${LOG_PREFIX} HTTP ${response.status}: ${response.statusText}`)
        return {
          url,
          title: '',
          content: '',
          format: format ?? 'text',
          fetchMethod: 'static',
          error: `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      const html = await response.text()

      // 提取标题
      const title = extractTitle(html)

      // 根据请求格式处理内容
      let content: string
      let outputFormat: 'text' | 'markdown' | 'html'

      if (format === 'html') {
        content = html
        outputFormat = 'html'
      } else {
        content = htmlToText(html)
        outputFormat = 'text'
      }

      console.log(
        `${LOG_PREFIX} Fetched page: title="${title.slice(0, 60)}", content=${content.length} chars`,
      )

      return {
        url,
        title,
        content,
        format: outputFormat,
        fetchMethod: 'static',
      }
    } catch (err) {
      const errorMsg =
        err instanceof DOMException && err.name === 'TimeoutError'
          ? `Timed out after ${STATIC_TIMEOUT_MS}ms`
          : String(err)

      console.log(`${LOG_PREFIX} Fetch failed: ${errorMsg}`)

      return {
        url,
        title: '',
        content: '',
        format: format ?? 'text',
        fetchMethod: 'static',
        error: errorMsg,
      }
    }
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                         辅助函数                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/**
 * 从 HTML 中提取 <title> 标签内容
 */
function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!match) return ''
  return decodeHtmlEntities(match[1].trim())
}

/**
 * 将 HTML 转为纯文本
 *
 * 策略：去除不需要的标签，保留文本内容和基本结构
 */
function htmlToText(html: string): string {
  let text = html

  // 1. 移除 <script> 和 <style> 标签及其内容
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')

  // 2. 移除 HTML 注释
  text = text.replace(/<!--[\s\S]*?-->/g, '')

  // 3. 移除 <head> 标签及其内容
  text = text.replace(/<head[\s\S]*?<\/head>/gi, '')

  // 4. 移除 <nav>、<footer> 等导航噪声
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '')
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '')

  // 5. 将块级标签替换为换行
  text = text.replace(
    /<\/?(?:div|p|br|hr|h[1-6]|li|tr|blockquote|section|article|main|aside)[^>]*>/gi,
    '\n',
  )

  // 6. 移除所有剩余 HTML 标签
  text = text.replace(/<[^>]+>/g, '')

  // 7. 解码 HTML 实体
  text = decodeHtmlEntities(text)

  // 8. 清理空白：将连续空行压缩为最多两个换行
  text = text.replace(/[ \t]+/g, ' ')
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n')

  // 9. 去除首尾空白
  text = text.trim()

  return text
}

/**
 * 解码常见 HTML 实体
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16)))
}
