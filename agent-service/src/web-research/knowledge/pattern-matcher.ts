import type { SitePattern, SiteMatchResult } from './types.js'

/**
 * 从 URL 中提取域名（去掉 www. 前缀）
 */
export function extractDomain(url: string): string {
  try {
    let normalized = url.trim()
    // 补全协议
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = 'https://' + normalized
    }
    const parsed = new URL(normalized)
    return parsed.hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return ''
  }
}

/**
 * 从 URL 中提取域名，匹配已知站点的 patterns
 */
export function matchByUrl(
  url: string,
  patterns: SitePattern[],
): SiteMatchResult | null {
  const domain = extractDomain(url)
  if (!domain) return null

  for (const pattern of patterns) {
    // 精确匹配主域名
    if (domain === pattern.domain.toLowerCase()) {
      return { pattern, matchedBy: 'domain', matchedTerm: pattern.domain }
    }
    // 子域名匹配（如 m.weibo.com 匹配 weibo.com）
    if (domain.endsWith('.' + pattern.domain.toLowerCase())) {
      return { pattern, matchedBy: 'domain', matchedTerm: pattern.domain }
    }
  }

  return null
}

/**
 * 从查询文本中匹配域名或别名（不区分大小写）
 * 使用词边界检查避免误匹配（如 "Bing" 不应匹配 "debugging"）
 */
export function matchByQuery(
  query: string,
  patterns: SitePattern[],
): SiteMatchResult | null {
  if (!query || !query.trim()) return null

  const lowerQuery = query.toLowerCase()

  for (const pattern of patterns) {
    // 匹配域名（域名包含"."，不太会误匹配）
    if (lowerQuery.includes(pattern.domain.toLowerCase())) {
      return { pattern, matchedBy: 'domain', matchedTerm: pattern.domain }
    }

    // 匹配别名（使用词边界检查，避免子字符串误匹配）
    for (const alias of pattern.aliases) {
      if (matchWithWordBoundary(lowerQuery, alias.toLowerCase())) {
        return { pattern, matchedBy: 'alias', matchedTerm: alias }
      }
    }
  }

  return null
}

/**
 * 检查 text 中是否包含 word，并且 word 在词边界上
 * 对中文字符不要求词边界（中文没有空格分隔）
 */
function matchWithWordBoundary(text: string, word: string): boolean {
  if (!word || word.length < 2) return false // 忽略单字符别名

  const idx = text.indexOf(word)
  if (idx === -1) return false

  // 中文字符不需要词边界检查
  if (/[\u4e00-\u9fff]/.test(word)) return true

  // 英文需要检查前后是否是单词边界
  const charBefore = idx > 0 ? text[idx - 1] : ' '
  const charAfter = idx + word.length < text.length ? text[idx + word.length] : ' '

  const isBoundaryBefore = !/[a-z0-9]/i.test(charBefore)
  const isBoundaryAfter = !/[a-z0-9]/i.test(charAfter)

  return isBoundaryBefore && isBoundaryAfter
}
