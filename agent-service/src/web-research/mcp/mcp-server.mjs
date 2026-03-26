#!/usr/bin/env node
/**
 * laborany-web — MCP Server
 *
 * Stdio MCP server that provides web research tools (search, read_page,
 * screenshot, get_site_info) to Claude Code CLI via --mcp-config injection.
 *
 * This is a thin bridge: every tool call is forwarded to agent-service
 * internal routes via loopback HTTP. The runtime intelligence (backend
 * selection, site knowledge, degradation) lives in WebResearchRuntime.
 *
 * Uses @modelcontextprotocol/sdk for protocol compliance.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

// ── Config ──

const AGENT_PORT = process.env.LABORANY_AGENT_PORT || '3002'
const AGENT_BASE_URL = (process.env.LABORANY_AGENT_BASE_URL || '').trim().replace(/\/+$/, '')
const BASE_URL = AGENT_BASE_URL || `http://127.0.0.1:${AGENT_PORT}`
const TIMEOUT_MS = 30_000
const MODEL_PROFILE_ID = (process.env.LABORANY_MODEL_PROFILE_ID || '').trim()
const TASK_DIR = (process.env.LABORANY_TASK_DIR || '').trim()

// ── HTTP helper ──

/**
 * Call an agent-service internal route.
 * @param {'GET'|'POST'} method
 * @param {string} path   e.g. '/_internal/web-research/search'
 * @param {object} [body] JSON body for POST
 * @returns {Promise<any>} parsed JSON response
 */
async function callInternal(method, path, body) {
  const url = `${BASE_URL}${path}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const headers = { 'Content-Type': 'application/json' }

  if (MODEL_PROFILE_ID) {
    headers['X-LaborAny-Model-Profile-Id'] = MODEL_PROFILE_ID
  }
  if (TASK_DIR) {
    headers['X-LaborAny-Task-Dir'] = TASK_DIR
  }

  try {
    const options = {
      method,
      signal: controller.signal,
      headers,
    }
    if (body !== undefined) {
      options.body = JSON.stringify(body)
    }

    const res = await fetch(url, options)

    if (!res.ok) {
      let detail = ''
      try {
        const errBody = await res.json()
        detail = errBody.error || errBody.message || JSON.stringify(errBody)
      } catch {
        detail = await res.text().catch(() => `HTTP ${res.status}`)
      }
      throw new Error(`Agent service returned ${res.status}: ${detail}`)
    }

    return await res.json()
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request to ${path} timed out after ${TIMEOUT_MS / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// ── Result formatters ──

/**
 * Format SearchResult[] into readable text.
 */
function formatSearchResults(data, siteKnowledgeText = '') {
  const results = data.results || []
  if (results.length === 0) {
    const reason = data.reason || 'No results found.'
    const degraded = data.degraded ? ' (degraded mode)' : ''
    let out = `No search results found${degraded}.\n${reason}`
    if (siteKnowledgeText) {
      out += `\n\n${siteKnowledgeText}`
    }
    return out
  }

  const lines = [`Found ${results.length} result(s):\n`]
  results.forEach((r, i) => {
    const domain = extractDomain(r.url)
    lines.push(`${i + 1}. [${r.title || 'Untitled'}](${r.url})`)
    if (r.snippet) {
      lines.push(`   ${r.snippet}`)
    }
    lines.push(`   Source: ${domain}`)
    lines.push('')
  })

  if (data.backend) {
    lines.push(`Search backend: ${data.backend}`)
  }
  if (data.strategy) {
    lines.push(`Search strategy: ${data.strategy}`)
  }
  if (Array.isArray(data.observations) && data.observations.length > 0) {
    lines.push(`Observed signals: ${data.observations.map(item => item.message || item.kind).join('；')}`)
  }
  if (data.degraded) {
    lines.push(`Note: Results may be limited (degraded mode).`)
  }

  lines.push('')
  lines.push('Important:')
  lines.push('- Search results are discovery leads, not proof.')
  lines.push('- Before answering with facts, sources, or official links, call read_page on at least one URL you plan to cite.')
  lines.push('- Do not cite any URL that is not listed above or that you have not read.')
  lines.push('- If these results are mostly news/blog mirrors and you need primary sources, refine with site/sites and search again.')

  if (siteKnowledgeText) {
    lines.push(`\n${siteKnowledgeText}`)
  }

  return lines.join('\n')
}

/**
 * Format page content response.
 */
function formatPageContent(data) {
  if (!data.content && !data.text) {
    const reason = data.reason || 'Could not extract content from the page.'
    const degraded = data.degraded ? ' (degraded mode)' : ''
    return `Failed to read page${degraded}.\n${reason}`
  }

  const parts = []
  if (data.title) {
    parts.push(`# ${data.title}\n`)
  }
  if (data.url) {
    parts.push(`Source: ${data.url}\n`)
  }
  parts.push(data.content || data.text)

  if (data.backend) {
    parts.push(`\n---\nExtracted via: ${data.backend}`)
  }
  if (data.fetchMethod) {
    parts.push(`\n---\nFetch method: ${data.fetchMethod}`)
  }
  if (data.strategy) {
    parts.push(`Extraction strategy: ${data.strategy}`)
  }
  if (Array.isArray(data.observations) && data.observations.length > 0) {
    parts.push(`Observed signals: ${data.observations.map(item => item.message || item.kind).join('；')}`)
  }
  if (data.degraded) {
    parts.push('Note: Content extraction was limited (degraded mode).')
  }

  return parts.join('\n')
}

/**
 * Format screenshot response.
 */
function formatScreenshot(data) {
  if (data.error) {
    return `Screenshot failed: ${data.error}`
  }
  const parts = [`Screenshot saved to: ${data.file_path}`]
  if (data.url) {
    parts.push(`URL: ${data.url}`)
  }
  return parts.join('\n')
}

/**
 * Format site info response.
 */
function formatSiteInfo(data) {
  if (!data || (!data.domain && !data.patterns)) {
    return 'No site information available for this domain.'
  }

  const parts = []
  parts.push(`## Site Info: ${data.domain || 'Unknown'}\n`)

  if (data.access_strategy) {
    parts.push(`Access strategy: ${data.access_strategy}`)
  }
  if (data.source) {
    parts.push(`Source: ${data.source}`)
  }
  if (data.aliases && data.aliases.length > 0) {
    parts.push(`Aliases: ${data.aliases.join(', ')}`)
  }
  if (data.verified_at) {
    parts.push(`Last verified: ${data.verified_at}`)
  }
  if (data.evidence_count !== undefined) {
    parts.push(`Evidence count: ${data.evidence_count}`)
  }

  if (data.characteristics) {
    parts.push(`\n### Platform Characteristics\n${data.characteristics}`)
  }
  if (data.patterns) {
    parts.push(`\n### Effective Patterns\n${data.patterns}`)
  }
  if (data.pitfalls) {
    parts.push(`\n### Known Pitfalls\n${data.pitfalls}`)
  }
  if (data.markdown) {
    parts.push(`\n### Pattern Markdown\n${data.markdown}`)
  }
  if (data.raw) {
    parts.push(`\n${data.raw}`)
  }

  return parts.join('\n')
}

/**
 * Format verify result response.
 */
function formatVerifyResult(data) {
  const parts = []
  parts.push(`## Verification Result\n`)
  parts.push(data.summary || '')
  parts.push('')

  if (data.sources && data.sources.length > 0) {
    parts.push(`### Sources (${data.sources.length})\n`)
    data.sources.forEach((s, i) => {
      parts.push(`${i + 1}. [${s.title || 'Untitled'}](${s.url})`)
      if (s.relevance) {
        parts.push(`   ${s.relevance}`)
      }
      if (s.pageContent) {
        parts.push(`\n   **Page content (excerpt):**`)
        parts.push(`   ${s.pageContent.slice(0, 2000)}`)
      }
      parts.push('')
    })
  } else {
    parts.push('No relevant sources found.')
  }

  if (data.method) {
    parts.push(`Search method: ${data.method}`)
  }

  if (data.verified === true) {
    parts.push('\nStatus: ✅ Verified by primary sources')
  } else if (data.verified === false) {
    parts.push('\nStatus: ❌ Contradicted by primary sources')
  } else {
    parts.push('\nStatus: ⚠️ Unable to determine — review the sources above to assess the claim')
  }

  return parts.join('\n')
}

/**
 * Extract domain from URL for display.
 */
function extractDomain(url) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

// ── MCP Server ──

const server = new McpServer({
  name: 'laborany_web',
  version: '0.1.0',
})

// ── Tool: search ──

server.tool(
  'search',
  'Search the web for information. Returns results with titles, URLs, and snippets. ' +
    'Use for finding information, discovering sources, and answering factual questions. ' +
    'The system automatically chooses the best search method available. ' +
    'When restricting to a specific website, prefer the structured site/sites parameters.',
  {
    query: z.string().describe('Search query in any language'),
    language: z
      .enum(['zh', 'en', 'auto'])
      .optional()
      .describe('Preferred result language. Default: auto'),
    recency: z
      .enum(['day', 'week', 'month', 'year', 'any'])
      .optional()
      .describe('Time filter for results. Default: any'),
    site: z
      .string()
      .optional()
      .describe('Restrict results to a single domain, e.g. "openai.com".'),
    engine: z
      .enum(['auto', 'google', 'bing'])
      .optional()
      .describe('Preferred browser search engine. Default: auto (Google first, then Bing fallback).'),
    sites: z
      .array(z.string())
      .max(5)
      .optional()
      .describe('Restrict results to multiple domains. Use only when a small fixed set is needed.'),
  },
  async ({ query, language, recency, site, sites, engine }) => {
    try {
      const data = await callInternal('POST', '/_internal/web-research/search', {
        query,
        language,
        recency,
        site,
        sites,
        engine,
      })

      // Fetch site info for discovered domains to provide automatic experience awareness
      const domainsToLookUp = new Set()
      if (site) domainsToLookUp.add(site)
      if (sites) sites.forEach((s) => domainsToLookUp.add(s))
      if (data.results) {
        data.results.forEach((r) => {
          const d = extractDomain(r.url)
          if (d) domainsToLookUp.add(d)
        })
      }

      let siteKnowledgeText = ''
      if (domainsToLookUp.size > 0) {
        const patternsFound = []
        for (const domain of Array.from(domainsToLookUp).slice(0, 5)) { // Limit lookups
          try {
            const siteInfo = await callInternal('GET', `/_internal/web-research/site-info?domain=${encodeURIComponent(domain)}`)
            if (siteInfo && (siteInfo.access_strategy !== 'static_ok' || siteInfo.characteristics || siteInfo.pitfalls || siteInfo.patterns)) {
               const patternParts = [`- ${domain}:`]
               if (siteInfo.access_strategy) patternParts.push(`  Strategy: ${siteInfo.access_strategy}`)
               if (siteInfo.pitfalls) patternParts.push(`  Pitfalls: ${siteInfo.pitfalls.replace(/\n/g, ' ')}`)
               if (siteInfo.patterns) patternParts.push(`  Patterns: ${siteInfo.patterns.replace(/\n/g, ' ')}`)
               if (siteInfo.characteristics) patternParts.push(`  Characteristics: ${siteInfo.characteristics.replace(/\n/g, ' ')}`)
               patternsFound.push(patternParts.join('\n'))
            }
          } catch (e) {
            // Ignore lookup errors
          }
        }
        if (patternsFound.length > 0) {
           siteKnowledgeText = `\n---\nSystem Note: Known experiences for these domains:\n${patternsFound.join('\n')}\n(Use get_site_info for more details before interacting with tricky sites.)`
        }
      }

      // Fetch global notes
      try {
        const globalNotesData = await callInternal('GET', '/_internal/web-research/global-notes')
        if (globalNotesData?.notes) {
          const prefix = siteKnowledgeText ? '\n\n' : '\n---\n'
          siteKnowledgeText += `${prefix}System Note: Global Research Strategies:\n${globalNotesData.notes}`
        }
      } catch (e) {
        // Ignore global notes error
      }

      return { content: [{ type: 'text', text: formatSearchResults(data, siteKnowledgeText) }] }
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `Search failed: ${err.message}\n\nPlease try again or rephrase your query.`,
          },
        ],
        isError: true,
      }
    }
  },
)

// ── Tool: read_page ──

server.tool(
  'read_page',
  'Read and extract content from a web page URL. Returns the page text content. ' +
    'The system automatically chooses the best extraction method (static fetch, Jina, or browser). ' +
    'Use after search to read full article content from discovered URLs.',
  {
    url: z.string().describe('The URL to read'),
    extract_mode: z
      .enum(['text', 'markdown', 'html'])
      .optional()
      .describe('Output format. Default: markdown'),
  },
  async ({ url, extract_mode }) => {
    try {
      const data = await callInternal('POST', '/_internal/web-research/read-page', {
        url,
        extract_mode,
      })
      return { content: [{ type: 'text', text: formatPageContent(data) }] }
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to read page: ${err.message}\n\nThe page may be inaccessible or require browser capabilities.`,
          },
        ],
        isError: true,
      }
    }
  },
)

// ── Tool: screenshot ──

server.tool(
  'screenshot',
  'Take a screenshot of a web page. Requires browser capability to be configured. ' +
    'Returns the screenshot file path. Use when visual inspection of a page is needed.',
  {
    url: z.string().describe('The URL to screenshot'),
    file_path: z
      .string()
      .optional()
      .describe('Save path for the screenshot. Auto-generated if not specified.'),
  },
  async ({ url, file_path }) => {
    try {
      const data = await callInternal('POST', '/_internal/web-research/screenshot', {
        url,
        file_path,
      })
      return { content: [{ type: 'text', text: formatScreenshot(data) }] }
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `Screenshot failed: ${err.message}\n\nThis feature requires browser capability (Chrome with remote debugging).`,
          },
        ],
        isError: true,
      }
    }
  },
)

// ── Tool: get_site_info ──

server.tool(
  'get_site_info',
  'Get known access patterns and platform characteristics for a website. ' +
    'Use before accessing unfamiliar or known-tricky platforms (like Xiaohongshu, WeChat) ' +
    'to understand access requirements and avoid common pitfalls.',
  {
    domain: z.string().describe('Website domain, e.g. "xiaohongshu.com"'),
  },
  async ({ domain }) => {
    try {
      const encoded = encodeURIComponent(domain)
      const data = await callInternal(
        'GET',
        `/_internal/web-research/site-info?domain=${encoded}`,
      )
      return { content: [{ type: 'text', text: formatSiteInfo(data) }] }
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get site info: ${err.message}\n\nSite knowledge may not be available for this domain.`,
          },
        ],
        isError: true,
      }
    }
  },
)

server.tool(
  'save_site_pattern',
  'Save or import a site pattern Markdown document into the local knowledge base. ' +
    'Patterns are saved directly and take effect immediately. ' +
    'Use for persisting discovered access rules, pitfalls, and selectors for future sessions. ' +
    'CRITICAL: If a pattern already exists for the domain, you MUST retrieve it using get_site_info first, ' +
    'then incrementally update its content (add new points, remove obsolete ones) before saving. ' +
    'Keep each section (characteristics, effective patterns, pitfalls) concise (max 8-10 points).',
  {
    content: z
      .string()
      .describe('A Markdown document with frontmatter, compatible with the site pattern format.'),
    filename: z
      .string()
      .optional()
      .describe('Optional filename, e.g. "xiaohongshu.com.md".'),
  },
  async ({ content, filename }) => {
    try {
      const data = await callInternal('POST', '/_internal/web-research/site-patterns/import', {
        content,
        filename,
      })
      return {
        content: [
          {
            type: 'text',
            text: `Saved site pattern for ${data.pattern?.domain || filename || 'unknown domain'}. Pattern is now active.`,
          },
        ],
      }
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to save site pattern: ${err.message}`,
          },
        ],
        isError: true,
      }
    }
  },
)

// ── Tool: save_global_note ──

server.tool(
  'save_global_note',
  'Save a generic/global research strategy or tip that applies across multiple sites. ' +
    'Do not use this for site-specific details (use save_site_pattern for those). ' +
    'Examples of global notes: "For academic papers, search Google Scholar first", "Use English queries for broader results".',
  {
    category: z.string().describe('Category of the note, e.g. "调研技巧" or "搜索策略"'),
    note: z.string().describe('The note content (one sentence).'),
  },
  async ({ category, note }) => {
    try {
      const data = await callInternal('POST', '/_internal/web-research/global-notes', { category, note })
      if (!data.added) {
        return { content: [{ type: 'text', text: `Note skipped: ${data.reason}` }] }
      }
      return { content: [{ type: 'text', text: `Saved global note to category "${category}".` }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Failed to save global note: ${err.message}` }], isError: true }
    }
  },
)

// ── Tool: verify ──

server.tool(
  'verify',
  'Verify a factual claim by searching for primary sources. ' +
    'Automatically searches, identifies authoritative sources (official sites, .gov, .edu), ' +
    'and reads their content. Returns source materials for you to assess. ' +
    'Use when you need to fact-check specific claims, statistics, or statements.',
  {
    claim: z.string().describe('The factual claim or statement to verify'),
  },
  async ({ claim }) => {
    try {
      const data = await callInternal('POST', '/_internal/web-research/verify', {
        claim,
      })
      return { content: [{ type: 'text', text: formatVerifyResult(data) }] }
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `Verification failed: ${err.message}\n\nPlease try rephrasing the claim or verify manually using search + read_page.`,
          },
        ],
        isError: true,
      }
    }
  },
)

// ── Browser Automation Tools (conditional) ──
// Only enabled when LABORANY_BROWSER_AUTOMATION=true is set in the MCP config env.
// These tools provide low-level browser control for automation skills.

const enableBrowserAutomation = process.env.LABORANY_BROWSER_AUTOMATION === 'true'

if (enableBrowserAutomation) {
  server.tool(
    'browser_open',
    'Open a URL in a new browser tab. Returns a target_id for subsequent operations. ' +
      'The tab is managed by the runtime and will be auto-closed after a timeout, ' +
      'but you should still call browser_close as soon as the information collection is finished.',
    {
      url: z.string().describe('The URL to open'),
    },
    async ({ url }) => {
      try {
        const data = await callInternal('POST', '/_internal/web-research/browser/open', { url })
        if (data.error) {
          return { content: [{ type: 'text', text: `browser_open failed: ${data.error}` }], isError: true }
        }
        return { content: [{ type: 'text', text: `Opened tab: ${data.target_id}\nURL: ${data.url}` }] }
      } catch (err) {
        return { content: [{ type: 'text', text: `browser_open failed: ${err.message}` }], isError: true }
      }
    },
  )

  server.tool(
    'browser_navigate',
    'Navigate an existing browser tab to a new URL.',
    {
      target_id: z.string().describe('The tab target ID from browser_open'),
      url: z.string().describe('The URL to navigate to'),
    },
    async ({ target_id, url }) => {
      try {
        const data = await callInternal('POST', '/_internal/web-research/browser/navigate', { target_id, url })
        if (data.error) {
          return { content: [{ type: 'text', text: `browser_navigate failed: ${data.error}` }], isError: true }
        }
        return { content: [{ type: 'text', text: `Navigated tab ${data.target_id} to: ${data.url}` }] }
      } catch (err) {
        return { content: [{ type: 'text', text: `browser_navigate failed: ${err.message}` }], isError: true }
      }
    },
  )

  server.tool(
    'browser_eval',
    'Evaluate a JavaScript expression in a browser tab and return the result. ' +
      'Use for extracting data, checking page state, or performing custom interactions.',
    {
      target_id: z.string().describe('The tab target ID from browser_open'),
      expression: z.string().describe('JavaScript expression to evaluate in the page context'),
    },
    async ({ target_id, expression }) => {
      try {
        const data = await callInternal('POST', '/_internal/web-research/browser/eval', { target_id, expression })
        if (data.error) {
          return { content: [{ type: 'text', text: `browser_eval failed: ${data.error}` }], isError: true }
        }
        const resultStr = typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2)
        return { content: [{ type: 'text', text: `Result:\n${resultStr}` }] }
      } catch (err) {
        return { content: [{ type: 'text', text: `browser_eval failed: ${err.message}` }], isError: true }
      }
    },
  )

  server.tool(
    'browser_click',
    'Click an element in a browser tab by CSS selector.',
    {
      target_id: z.string().describe('The tab target ID from browser_open'),
      selector: z.string().describe('CSS selector for the element to click'),
    },
    async ({ target_id, selector }) => {
      try {
        const data = await callInternal('POST', '/_internal/web-research/browser/click', { target_id, selector })
        if (data.error) {
          return { content: [{ type: 'text', text: `browser_click failed: ${data.error}` }], isError: true }
        }
        return { content: [{ type: 'text', text: `Clicked element: ${selector} (tab ${data.target_id})` }] }
      } catch (err) {
        return { content: [{ type: 'text', text: `browser_click failed: ${err.message}` }], isError: true }
      }
    },
  )

  server.tool(
    'browser_scroll',
    'Scroll a browser tab in the given direction.',
    {
      target_id: z.string().describe('The tab target ID from browser_open'),
      direction: z
        .enum(['up', 'down', 'top', 'bottom'])
        .optional()
        .describe('Scroll direction. Default: down'),
    },
    async ({ target_id, direction }) => {
      try {
        const data = await callInternal('POST', '/_internal/web-research/browser/scroll', { target_id, direction })
        if (data.error) {
          return { content: [{ type: 'text', text: `browser_scroll failed: ${data.error}` }], isError: true }
        }
        return { content: [{ type: 'text', text: `Scrolled ${direction || 'down'} in tab ${data.target_id}` }] }
      } catch (err) {
        return { content: [{ type: 'text', text: `browser_scroll failed: ${err.message}` }], isError: true }
      }
    },
  )

  server.tool(
    'browser_screenshot',
    'Take a screenshot of a specific browser tab (by target_id). ' +
      'Unlike the top-level screenshot tool which opens a new tab, this captures an existing tab.',
    {
      target_id: z.string().describe('The tab target ID from browser_open'),
      file_path: z.string().optional().describe('Save path. Auto-generated if not specified.'),
    },
    async ({ target_id, file_path }) => {
      try {
        const data = await callInternal('POST', '/_internal/web-research/browser/screenshot', { target_id, file_path })
        if (data.error) {
          return { content: [{ type: 'text', text: `browser_screenshot failed: ${data.error}` }], isError: true }
        }
        return { content: [{ type: 'text', text: `Screenshot saved to: ${data.file_path}` }] }
      } catch (err) {
        return { content: [{ type: 'text', text: `browser_screenshot failed: ${err.message}` }], isError: true }
      }
    },
  )

  server.tool(
    'browser_close',
    'Close a browser tab opened via browser_open.',
    {
      target_id: z.string().describe('The tab target ID to close'),
    },
    async ({ target_id }) => {
      try {
        const data = await callInternal('POST', '/_internal/web-research/browser/close', { target_id })
        if (data.error) {
          return { content: [{ type: 'text', text: `browser_close failed: ${data.error}` }], isError: true }
        }
        return { content: [{ type: 'text', text: `Closed tab ${data.target_id}` }] }
      } catch (err) {
        return { content: [{ type: 'text', text: `browser_close failed: ${err.message}` }], isError: true }
      }
    },
  )
}

// ── Start ──

const transport = new StdioServerTransport()
await server.connect(transport)
