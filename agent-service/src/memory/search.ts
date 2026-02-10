/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Memory Search (混合检索引擎)                          ║
 * ║                                                                          ║
 * ║  职责：BM25 + TF-IDF + RRF 融合的混合检索                                 ║
 * ║  设计：索引缓存 + 多策略检索 + 排名融合                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { existsSync, readdirSync, readFileSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import { MEMORY_DIR, SKILLS_MEMORY_DIR } from './file-manager.js'
import { DATA_DIR } from '../paths.js'
import {
  TFIDFIndexer,
  TFIDFSearcher,
  tokenize,
  type TFIDFIndex,
} from './tfidf.js'
import { indexCacheManager } from './index-cache.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export type SearchStrategy = 'keyword' | 'semantic' | 'hybrid'

interface SearchParams {
  query: string
  scope?: 'global' | 'skill' | 'all'
  skillId?: string
  maxResults?: number
  strategy?: SearchStrategy
}

export interface SearchResult {
  path: string
  snippet: string
  score: number
}

interface BM25Index {
  documents: Map<string, { content: string; tokens: string[] }>
  avgDocLen: number
  idf: Map<string, number>
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     BM25 参数                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const K1 = 1.2
const B = 0.75
const RRF_K = 60  // RRF 融合常数

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     工具函数                                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
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

function getFilesCacheKey(prefix: string, files: string[]): string {
  const normalized = [...files].sort().join('\n')
  const hash = createHash('sha1').update(normalized).digest('hex').slice(0, 12)
  return `${prefix}_${files.length}_${hash}`
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     Memory Search 类                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class MemorySearch {
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
   *  构建 BM25 索引（带缓存）
   * ──────────────────────────────────────────────────────────────────────── */
  private buildBM25Index(files: string[]): BM25Index {
    const cacheKey = getFilesCacheKey('bm25', files)

    return indexCacheManager.getOrBuild(cacheKey, files, () => {
      const documents = new Map<string, { content: string; tokens: string[] }>()
      let totalLen = 0

      for (const file of files) {
        const content = readFileSync(file, 'utf-8')
        const tokens = tokenize(content)
        documents.set(file, { content, tokens })
        totalLen += tokens.length
      }

      const avgDocLen = documents.size > 0 ? totalLen / documents.size : 0

      // 预计算 IDF
      const idf = new Map<string, number>()
      const N = documents.size
      const docFreq = new Map<string, number>()

      for (const doc of documents.values()) {
        const seen = new Set<string>()
        for (const token of doc.tokens) {
          if (!seen.has(token)) {
            docFreq.set(token, (docFreq.get(token) || 0) + 1)
            seen.add(token)
          }
        }
      }

      for (const [term, df] of docFreq) {
        idf.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1))
      }

      return { documents, avgDocLen, idf }
    })
  }

  private buildTFIDFIndex(files: string[]): TFIDFIndex {
    const cacheKey = getFilesCacheKey('tfidf', files)

    return indexCacheManager.getOrBuild(cacheKey, files, () => {
      const indexer = new TFIDFIndexer()
      for (const file of files) {
        const content = readFileSync(file, 'utf-8')
        indexer.addDocument(file, content)
      }
      return indexer.build()
    })
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  BM25 搜索
   * ──────────────────────────────────────────────────────────────────────── */
  private searchBM25(
    index: BM25Index,
    queryTokens: string[],
    maxResults: number
  ): Array<{ path: string; score: number }> {
    const results: Array<{ path: string; score: number }> = []

    for (const [path, doc] of index.documents) {
      const docLen = doc.tokens.length
      const tf = getTermFrequency(doc.tokens)
      let score = 0

      for (const term of queryTokens) {
        const termFreq = tf.get(term) || 0
        if (termFreq === 0) continue

        const idf = index.idf.get(term) || 0
        const tfNorm = (termFreq * (K1 + 1)) /
          (termFreq + K1 * (1 - B + B * docLen / index.avgDocLen))
        score += idf * tfNorm
      }

      if (score > 0) {
        results.push({ path, score })
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, maxResults)
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  TF-IDF 搜索
   * ──────────────────────────────────────────────────────────────────────── */
  private searchTFIDF(
    files: string[],
    query: string,
    maxResults: number
  ): Array<{ path: string; score: number }> {
    const tfidfIndex = this.buildTFIDFIndex(files)

    // TF-IDF 索引已由 buildTFIDFIndex 缓存构建
    

    // 搜索
    const searcher = new TFIDFSearcher(tfidfIndex)
    return searcher.search(query, maxResults).map(r => ({
      path: r.id,
      score: r.score,
    }))
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  RRF 融合算法
   *
   *  RRF(d) = Σ 1/(k + rank_r(d))
   *  融合多个排名列表，k=60 是经验值
   * ──────────────────────────────────────────────────────────────────────── */
  private fuseRRF(
    ...rankings: Array<Array<{ path: string; score: number }>>
  ): Array<{ path: string; score: number }> {
    const scores = new Map<string, number>()

    for (const ranking of rankings) {
      for (let i = 0; i < ranking.length; i++) {
        const { path } = ranking[i]
        const rrfScore = 1 / (RRF_K + i + 1)
        scores.set(path, (scores.get(path) || 0) + rrfScore)
      }
    }

    return Array.from(scores.entries())
      .map(([path, score]) => ({ path, score }))
      .sort((a, b) => b.score - a.score)
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  主搜索方法
   * ──────────────────────────────────────────────────────────────────────── */
  search(params: SearchParams): SearchResult[] {
    const {
      query,
      scope = 'all',
      skillId,
      maxResults = 10,
      strategy = 'hybrid',
    } = params

    const queryTokens = tokenize(query)
    if (queryTokens.length === 0) return []

    const files = this.collectFiles(scope, skillId)
    if (files.length === 0) return []

    let rankedPaths: Array<{ path: string; score: number }>

    // 根据策略选择检索方式
    if (strategy === 'keyword') {
      const bm25Index = this.buildBM25Index(files)
      rankedPaths = this.searchBM25(bm25Index, queryTokens, maxResults * 2)
    } else if (strategy === 'semantic') {
      rankedPaths = this.searchTFIDF(files, query, maxResults * 2)
    } else {
      // hybrid: RRF 融合 BM25 和 TF-IDF
      const bm25Index = this.buildBM25Index(files)
      const bm25Results = this.searchBM25(bm25Index, queryTokens, maxResults * 2)
      const tfidfResults = this.searchTFIDF(files, query, maxResults * 2)
      rankedPaths = this.fuseRRF(bm25Results, tfidfResults)
    }

    // 构建最终结果
    const bm25Index = this.buildBM25Index(files)
    return rankedPaths.slice(0, maxResults).map(({ path, score }) => {
      const doc = bm25Index.documents.get(path)
      return {
        path,
        snippet: doc ? extractSnippet(doc.content, queryTokens) : '',
        score,
      }
    })
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出单例                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const memorySearch = new MemorySearch()
