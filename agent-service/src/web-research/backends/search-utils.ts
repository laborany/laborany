import type { SearchOptions, SearchResult } from './types.js'

function normalizeSiteToken(site: string | undefined): string | null {
  if (!site) return null

  const trimmed = site.trim().toLowerCase()
  if (!trimmed) return null

  const withoutPrefix = trimmed.replace(/^site:/, '')
  const withProtocol = /^https?:\/\//.test(withoutPrefix)
    ? withoutPrefix
    : `https://${withoutPrefix}`

  try {
    const parsed = new URL(withProtocol)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return withoutPrefix
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .trim() || null
  }
}

export function collectRequestedSites(query: string, options?: SearchOptions): string[] {
  const fromQuery = Array.from(query.matchAll(/(?:^|\s)site:([^\s]+)/gi))
    .map(match => normalizeSiteToken(match[1]))
  const fromOptions = [options?.site, ...(options?.sites || [])]
    .map(site => normalizeSiteToken(site))

  return Array.from(new Set([...fromQuery, ...fromOptions].filter((site): site is string => Boolean(site))))
}

export function hasExplicitSiteConstraint(query: string, options?: SearchOptions): boolean {
  if (typeof options?.site === 'string' && options.site.trim()) return true
  if (Array.isArray(options?.sites) && options.sites.some(site => typeof site === 'string' && site.trim())) {
    return true
  }
  return /(?:^|\s)site:[^\s]+/i.test(query)
}

export function doesUrlMatchAnySite(url: string, sites: string[]): boolean {
  if (sites.length === 0) return true

  let hostname = ''
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return false
  }

  return sites.some(site => hostname === site || hostname.endsWith(`.${site}`))
}

export function filterSearchResultsBySites(
  results: SearchResult[],
  sites: string[],
): SearchResult[] {
  if (sites.length === 0) return results
  return results.filter(result => doesUrlMatchAnySite(result.url, sites))
}

function extractQueryTerms(query: string): string[] {
  const stripped = query
    .replace(/(?:^|\s)site:[^\s]+/gi, ' ')
    .trim()
    .toLowerCase()

  if (!stripped) return []

  const rawTerms = stripped
    .split(/[\s,.;:!?()[\]{}"'/\\|]+/)
    .map(term => term.trim())
    .filter(term => term.length >= 2)

  return Array.from(new Set(rawTerms))
}

function hasQueryOverlap(result: SearchResult, terms: string[]): boolean {
  if (terms.length === 0) return true

  const haystack = `${result.title}\n${result.snippet}\n${result.url}`.toLowerCase()
  return terms.some(term => haystack.includes(term))
}

function isGenericSnippet(snippet: string): boolean {
  const normalized = snippet.trim().toLowerCase()
  if (!normalized) return true

  return [
    '没有此网页的信息',
    'no information is available for this page',
    'no info is available for this page',
    'no cached page is available',
  ].some(marker => normalized.includes(marker))
}

export function scoreSearchResults(
  results: SearchResult[],
  query: string,
  requestedSites: string[],
): number {
  if (results.length === 0) return 0

  const queryTerms = extractQueryTerms(query)

  return results.reduce((score, result) => {
    let next = score + 20
    if (!isGenericSnippet(result.snippet)) next += 6
    if (hasQueryOverlap(result, queryTerms)) next += 8
    if (doesUrlMatchAnySite(result.url, requestedSites)) next += 10
    else if (requestedSites.length > 0) next -= 25
    return next
  }, 0)
}

export function shouldTryAlternateSearchEngine(
  results: SearchResult[],
  query: string,
  requestedSites: string[],
): boolean {
  if (results.length === 0) return true

  const score = scoreSearchResults(results, query, requestedSites)
  if (score < 20) return true

  if (results.length < 2 && score < 35) return true

  return false
}
