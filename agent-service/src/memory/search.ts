/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Memory Search (BM25)                                  ║
 * ║                                                                          ║
 * ║  职责：基于 BM25 算法的全文搜索                                            ║
 * ║  设计：简化版实现，不依赖外部搜索引擎                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, basename } from 'path'
import { MEMORY_DIR, SKILLS_MEMORY_DIR } from './file-manager.js'
import { DATA_DIR } from '../paths.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface SearchParams {
  query: string
  scope?: 'global' | 'skill' | 'all'
  skillId?: string
  maxResults?: number
}

export interface SearchResult {
  path: string
  snippet: string
  score: number
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     BM25 参数                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const K1 = 1.2
const B = 0.75

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     工具函数                                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1)
}

function getTermFrequency(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>()
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1)
  }
  return freq
}

function extractSnippet(content: string, queryTokens: string[], maxLen = 200): string {
  const lines = content.split('\n')
  for (const line of lines) {
    const lower = line.toLowerCase()
    if (queryTokens.some(t => lower.includes(t))) {
      return line.slice(0, maxLen) + (line.length > maxLen ? '...' : '')
    }
  }
  return content.slice(0, maxLen) + (content.length > maxLen ? '...' : '')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     Memory Search 类                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class MemorySearch {
  private documents: Map<string, { content: string; tokens: string[] }> = new Map()
  private avgDocLen = 0

  /* ────────────────────────────────────────────────────────────────────────
   *  收集所有记忆文件
   * ──────────────────────────────────────────────────────────────────────── */
  private collectFiles(scope: 'global' | 'skill' | 'all', skillId?: string): string[] {
    const files: string[] = []
    const globalDir = join(MEMORY_DIR, 'global')

    // 全局记忆
    if (scope === 'global' || scope === 'all') {
      if (existsSync(globalDir)) {
        for (const f of readdirSync(globalDir)) {
          if (f.endsWith('.md')) files.push(join(globalDir, f))
        }
      }
      const globalMd = join(DATA_DIR, 'MEMORY.md')
      if (existsSync(globalMd)) files.push(globalMd)
    }

    // Skill 记忆
    if ((scope === 'skill' || scope === 'all') && skillId) {
      const skillDir = join(SKILLS_MEMORY_DIR, skillId)
      if (existsSync(skillDir)) {
        for (const f of readdirSync(skillDir)) {
          if (f.endsWith('.md')) files.push(join(skillDir, f))
        }
      }
    }

    // 如果是 all，收集所有 Skill 的记忆
    if (scope === 'all' && existsSync(SKILLS_MEMORY_DIR)) {
      for (const skill of readdirSync(SKILLS_MEMORY_DIR)) {
        const skillDir = join(SKILLS_MEMORY_DIR, skill)
        try {
          for (const f of readdirSync(skillDir)) {
            if (f.endsWith('.md')) files.push(join(skillDir, f))
          }
        } catch { /* 忽略非目录 */ }
      }
    }

    return files
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  构建索引
   * ──────────────────────────────────────────────────────────────────────── */
  private buildIndex(files: string[]): void {
    this.documents.clear()
    let totalLen = 0

    for (const file of files) {
      const content = readFileSync(file, 'utf-8')
      const tokens = tokenize(content)
      this.documents.set(file, { content, tokens })
      totalLen += tokens.length
    }

    this.avgDocLen = this.documents.size > 0 ? totalLen / this.documents.size : 0
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  计算 BM25 分数
   * ──────────────────────────────────────────────────────────────────────── */
  private calcBM25(queryTokens: string[], docTokens: string[]): number {
    const docLen = docTokens.length
    const tf = getTermFrequency(docTokens)
    const N = this.documents.size
    let score = 0

    for (const term of queryTokens) {
      const termFreq = tf.get(term) || 0
      if (termFreq === 0) continue

      // 计算 IDF
      let docCount = 0
      for (const [, doc] of this.documents) {
        if (doc.tokens.includes(term)) docCount++
      }
      const idf = Math.log((N - docCount + 0.5) / (docCount + 0.5) + 1)

      // 计算 TF 部分
      const tfNorm = (termFreq * (K1 + 1)) /
        (termFreq + K1 * (1 - B + B * docLen / this.avgDocLen))

      score += idf * tfNorm
    }

    return score
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  搜索
   * ──────────────────────────────────────────────────────────────────────── */
  search(params: SearchParams): SearchResult[] {
    const { query, scope = 'all', skillId, maxResults = 10 } = params
    const queryTokens = tokenize(query)
    if (queryTokens.length === 0) return []

    const files = this.collectFiles(scope, skillId)
    this.buildIndex(files)

    const results: SearchResult[] = []

    for (const [path, doc] of this.documents) {
      const score = this.calcBM25(queryTokens, doc.tokens)
      if (score > 0) {
        results.push({
          path,
          snippet: extractSnippet(doc.content, queryTokens),
          score,
        })
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出单例                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const memorySearch = new MemorySearch()
