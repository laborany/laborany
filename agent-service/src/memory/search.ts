/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Memory Search (混合检索引擎)                        ║
 * ║                                                                        ║
 * ║  包含：TF-IDF 引擎 + 索引缓存 + BM25 + RRF 融合                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import { MEMORY_DIR, SKILLS_MEMORY_DIR } from './file-manager.js'
import { DATA_DIR } from '../paths.js'

/* ══════════════════════════════════════════════════════════════════════════
 *  TF-IDF 语义检索引擎
 * ══════════════════════════════════════════════════════════════════════════ */

export interface TFIDFDocument {
  id: string
  tokens: string[]
  vector: Map<string, number>
  magnitude: number
}

export interface TFIDFIndex {
  documents: Map<string, TFIDFDocument>
  idf: Map<string, number>
  vocabulary: Set<string>
  docCount: number
}

export function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1)
}

function calcTF(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>()
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1)
  }
  const len = tokens.length
  for (const [term, count] of freq) {
    freq.set(term, count / len)
  }
  return freq
}

function calcMagnitude(vector: Map<string, number>): number {
  let sum = 0
  for (const val of vector.values()) {
    sum += val * val
  }
  return Math.sqrt(sum)
}

export class TFIDFIndexer {
  private index: TFIDFIndex = {
    documents: new Map(),
    idf: new Map(),
    vocabulary: new Set(),
    docCount: 0,
  }

  addDocument(id: string, content: string): void {
    const tokens = tokenize(content)
    for (const token of tokens) {
      this.index.vocabulary.add(token)
    }
    this.index.documents.set(id, { id, tokens, vector: new Map(), magnitude: 0 })
    this.index.docCount++
  }

  build(): TFIDFIndex {
    const N = this.index.docCount
    if (N === 0) return this.index

    const docFreq = new Map<string, number>()
    for (const doc of this.index.documents.values()) {
      const seen = new Set<string>()
      for (const token of doc.tokens) {
        if (!seen.has(token)) {
          docFreq.set(token, (docFreq.get(token) || 0) + 1)
          seen.add(token)
        }
      }
    }

    for (const [term, df] of docFreq) {
      this.index.idf.set(term, Math.log(N / df))
    }

    for (const doc of this.index.documents.values()) {
      const tf = calcTF(doc.tokens)
      for (const [term, tfVal] of tf) {
        const idf = this.index.idf.get(term) || 0
        doc.vector.set(term, tfVal * idf)
      }
      doc.magnitude = calcMagnitude(doc.vector)
    }

    return this.index
  }

  getIndex(): TFIDFIndex { return this.index }

  clear(): void {
    this.index = { documents: new Map(), idf: new Map(), vocabulary: new Set(), docCount: 0 }
  }
}

export class TFIDFSearcher {
  constructor(private index: TFIDFIndex) {}

  private queryToVector(queryTokens: string[]): Map<string, number> {
    const tf = calcTF(queryTokens)
    const vector = new Map<string, number>()
    for (const [term, tfVal] of tf) {
      const idf = this.index.idf.get(term) || 0
      if (idf > 0) vector.set(term, tfVal * idf)
    }
    return vector
  }

  private cosineSimilarity(
    v1: Map<string, number>, m1: number,
    v2: Map<string, number>, m2: number,
  ): number {
    if (m1 === 0 || m2 === 0) return 0
    let dot = 0
    for (const [term, val] of v1) {
      const val2 = v2.get(term)
      if (val2) dot += val * val2
    }
    return dot / (m1 * m2)
  }

  search(query: string, maxResults = 10): Array<{ id: string; score: number }> {
    const queryTokens = tokenize(query)
    if (queryTokens.length === 0) return []

    const queryVector = this.queryToVector(queryTokens)
    const queryMagnitude = calcMagnitude(queryVector)
    if (queryMagnitude === 0) return []

    const results: Array<{ id: string; score: number }> = []
    for (const doc of this.index.documents.values()) {
      const score = this.cosineSimilarity(queryVector, queryMagnitude, doc.vector, doc.magnitude)
      if (score > 0) results.push({ id: doc.id, score })
    }

    return results.sort((a, b) => b.score - a.score).slice(0, maxResults)
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 *  索引缓存管理器
 * ══════════════════════════════════════════════════════════════════════════ */

export const INDEX_DIR = join(DATA_DIR, 'memory', 'index')
const CACHE_VERSION = 2

interface CacheMetadata {
  version: number
  buildTime: number
  fileHashes: Record<string, number>
}

interface IndexCache<T> {
  metadata: CacheMetadata
  data: T
}

interface SerializedMap {
  __type: 'Map'
  entries: Array<[unknown, unknown]>
}

function isSerializedMap(value: unknown): value is SerializedMap {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SerializedMap>
  return candidate.__type === 'Map' && Array.isArray(candidate.entries)
}

function cacheReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return { __type: 'Map', entries: Array.from(value.entries()) } as SerializedMap
  }
  return value
}

function cacheReviver(_key: string, value: unknown): unknown {
  if (isSerializedMap(value)) return new Map(value.entries)
  return value
}

export class IndexCacheManager {
  private memoryCache: Map<string, IndexCache<unknown>> = new Map()

  constructor() {
    if (!existsSync(INDEX_DIR)) mkdirSync(INDEX_DIR, { recursive: true })
  }

  private getFileHashes(files: string[]): Record<string, number> {
    const hashes: Record<string, number> = {}
    for (const file of files) {
      if (existsSync(file)) hashes[file] = statSync(file).mtimeMs
    }
    return hashes
  }

  private isCacheValid(cache: IndexCache<unknown> | null, currentFiles: string[]): boolean {
    if (!cache) return false
    if (cache.metadata.version !== CACHE_VERSION) return false
    const currentHashes = this.getFileHashes(currentFiles)
    const cachedHashes = cache.metadata.fileHashes
    const currentKeys = Object.keys(currentHashes)
    if (currentKeys.length !== Object.keys(cachedHashes).length) return false
    for (const file of currentKeys) {
      if (cachedHashes[file] !== currentHashes[file]) return false
    }
    return true
  }

  private loadFromDisk<T>(cacheKey: string): IndexCache<T> | null {
    const cachePath = join(INDEX_DIR, `${cacheKey}.json`)
    if (!existsSync(cachePath)) return null
    try {
      return JSON.parse(readFileSync(cachePath, 'utf-8'), cacheReviver) as IndexCache<T>
    } catch { return null }
  }

  private saveToDisk<T>(cacheKey: string, cache: IndexCache<T>): void {
    try {
      writeFileSync(join(INDEX_DIR, `${cacheKey}.json`), JSON.stringify(cache, cacheReplacer), 'utf-8')
    } catch { /* 缓存失败不影响功能 */ }
  }

  getOrBuild<T>(cacheKey: string, files: string[], builder: () => T): T {
    const memCache = this.memoryCache.get(cacheKey) as IndexCache<T> | undefined
    if (memCache && this.isCacheValid(memCache, files)) return memCache.data

    const diskCache = this.loadFromDisk<T>(cacheKey)
    if (diskCache && this.isCacheValid(diskCache, files)) {
      this.memoryCache.set(cacheKey, diskCache)
      return diskCache.data
    }

    const data = builder()
    const newCache: IndexCache<T> = {
      metadata: { version: CACHE_VERSION, buildTime: Date.now(), fileHashes: this.getFileHashes(files) },
      data,
    }
    this.memoryCache.set(cacheKey, newCache)
    this.saveToDisk(cacheKey, newCache)
    return data
  }

  invalidate(cacheKey: string): void {
    this.memoryCache.delete(cacheKey)
    const cachePath = join(INDEX_DIR, `${cacheKey}.json`)
    if (existsSync(cachePath)) {
      try { const { unlinkSync } = require('fs'); unlinkSync(cachePath) } catch { /* 忽略 */ }
    }
  }

  invalidateAll(): void { this.memoryCache.clear() }
}

export const indexCacheManager = new IndexCacheManager()

/* ══════════════════════════════════════════════════════════════════════════
 *  混合检索引擎（BM25 + TF-IDF + RRF）
 * ══════════════════════════════════════════════════════════════════════════ */

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

const K1 = 1.2
const B = 0.75
const RRF_K = 60

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

export class MemorySearch {
  private collectFiles(scope: 'global' | 'skill' | 'all', skillId?: string): string[] {
    const files: string[] = []
    const globalDir = join(MEMORY_DIR, 'global')

    if (scope === 'global' || scope === 'all') {
      if (existsSync(globalDir)) {
        for (const f of readdirSync(globalDir)) {
          if (f.endsWith('.md')) files.push(join(globalDir, f))
        }
      }
      const globalMd = join(DATA_DIR, 'MEMORY.md')
      if (existsSync(globalMd)) files.push(globalMd)
    }

    if ((scope === 'skill' || scope === 'all') && skillId) {
      const skillDir = join(SKILLS_MEMORY_DIR, skillId)
      if (existsSync(skillDir)) {
        for (const f of readdirSync(skillDir)) {
          if (f.endsWith('.md')) files.push(join(skillDir, f))
        }
      }
    }

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
        indexer.addDocument(file, readFileSync(file, 'utf-8'))
      }
      return indexer.build()
    })
  }

  private searchBM25(index: BM25Index, queryTokens: string[], maxResults: number): Array<{ path: string; score: number }> {
    const results: Array<{ path: string; score: number }> = []
    for (const [path, doc] of index.documents) {
      const docLen = doc.tokens.length
      const tf = getTermFrequency(doc.tokens)
      let score = 0
      for (const term of queryTokens) {
        const termFreq = tf.get(term) || 0
        if (termFreq === 0) continue
        const idf = index.idf.get(term) || 0
        const tfNorm = (termFreq * (K1 + 1)) / (termFreq + K1 * (1 - B + B * docLen / index.avgDocLen))
        score += idf * tfNorm
      }
      if (score > 0) results.push({ path, score })
    }
    return results.sort((a, b) => b.score - a.score).slice(0, maxResults)
  }

  private searchTFIDF(files: string[], query: string, maxResults: number): Array<{ path: string; score: number }> {
    const tfidfIndex = this.buildTFIDFIndex(files)
    const searcher = new TFIDFSearcher(tfidfIndex)
    return searcher.search(query, maxResults).map(r => ({ path: r.id, score: r.score }))
  }

  private fuseRRF(...rankings: Array<Array<{ path: string; score: number }>>): Array<{ path: string; score: number }> {
    const scores = new Map<string, number>()
    for (const ranking of rankings) {
      for (let i = 0; i < ranking.length; i++) {
        const { path } = ranking[i]
        scores.set(path, (scores.get(path) || 0) + 1 / (RRF_K + i + 1))
      }
    }
    return Array.from(scores.entries())
      .map(([path, score]) => ({ path, score }))
      .sort((a, b) => b.score - a.score)
  }

  search(params: SearchParams): SearchResult[] {
    const { query, scope = 'all', skillId, maxResults = 10, strategy = 'hybrid' } = params
    const queryTokens = tokenize(query)
    if (queryTokens.length === 0) return []

    const files = this.collectFiles(scope, skillId)
    if (files.length === 0) return []

    let rankedPaths: Array<{ path: string; score: number }>

    if (strategy === 'keyword') {
      rankedPaths = this.searchBM25(this.buildBM25Index(files), queryTokens, maxResults * 2)
    } else if (strategy === 'semantic') {
      rankedPaths = this.searchTFIDF(files, query, maxResults * 2)
    } else {
      const bm25Results = this.searchBM25(this.buildBM25Index(files), queryTokens, maxResults * 2)
      const tfidfResults = this.searchTFIDF(files, query, maxResults * 2)
      rankedPaths = this.fuseRRF(bm25Results, tfidfResults)
    }

    const bm25Index = this.buildBM25Index(files)
    return rankedPaths.slice(0, maxResults).map(({ path, score }) => {
      const doc = bm25Index.documents.get(path)
      return { path, snippet: doc ? extractSnippet(doc.content, queryTokens) : '', score }
    })
  }
}

export const memorySearch = new MemorySearch()
