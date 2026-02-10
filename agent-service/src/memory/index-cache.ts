/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     索引缓存管理器                                        ║
 * ║                                                                          ║
 * ║  职责：缓存 BM25 和 TF-IDF 索引，避免重复构建                              ║
 * ║  策略：基于文件修改时间判断是否需要重建                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { DATA_DIR } from '../paths.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface CacheMetadata {
  version: number
  buildTime: number
  fileHashes: Record<string, number>  // path -> mtime
}

interface IndexCache<T> {
  metadata: CacheMetadata
  data: T
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           常量                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const INDEX_DIR = join(DATA_DIR, 'memory', 'index')
const CACHE_VERSION = 2

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
    return {
      __type: 'Map',
      entries: Array.from(value.entries()),
    } as SerializedMap
  }
  return value
}

function cacheReviver(_key: string, value: unknown): unknown {
  if (isSerializedMap(value)) {
    return new Map(value.entries)
  }
  return value
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     索引缓存管理器                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class IndexCacheManager {
  private memoryCache: Map<string, IndexCache<unknown>> = new Map()

  constructor() {
    this.ensureIndexDir()
  }

  private ensureIndexDir(): void {
    if (!existsSync(INDEX_DIR)) {
      mkdirSync(INDEX_DIR, { recursive: true })
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  获取文件的修改时间哈希
   * ──────────────────────────────────────────────────────────────────────── */
  private getFileHashes(files: string[]): Record<string, number> {
    const hashes: Record<string, number> = {}
    for (const file of files) {
      if (existsSync(file)) {
        hashes[file] = statSync(file).mtimeMs
      }
    }
    return hashes
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  检查缓存是否有效
   * ──────────────────────────────────────────────────────────────────────── */
  private isCacheValid(
    cache: IndexCache<unknown> | null,
    currentFiles: string[]
  ): boolean {
    if (!cache) return false
    if (cache.metadata.version !== CACHE_VERSION) return false

    const currentHashes = this.getFileHashes(currentFiles)
    const cachedHashes = cache.metadata.fileHashes

    // 检查文件数量是否一致
    const currentKeys = Object.keys(currentHashes)
    const cachedKeys = Object.keys(cachedHashes)
    if (currentKeys.length !== cachedKeys.length) return false

    // 检查每个文件的修改时间
    for (const file of currentKeys) {
      if (cachedHashes[file] !== currentHashes[file]) return false
    }

    return true
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  从磁盘加载缓存
   * ──────────────────────────────────────────────────────────────────────── */
  private loadFromDisk<T>(cacheKey: string): IndexCache<T> | null {
    const cachePath = join(INDEX_DIR, `${cacheKey}.json`)
    if (!existsSync(cachePath)) return null

    try {
      const content = readFileSync(cachePath, 'utf-8')
      return JSON.parse(content, cacheReviver) as IndexCache<T>
    } catch {
      return null
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  保存缓存到磁盘
   * ──────────────────────────────────────────────────────────────────────── */
  private saveToDisk<T>(cacheKey: string, cache: IndexCache<T>): void {
    const cachePath = join(INDEX_DIR, `${cacheKey}.json`)
    try {
      writeFileSync(cachePath, JSON.stringify(cache, cacheReplacer), 'utf-8')
    } catch {
      // 忽略写入错误，缓存失败不影响功能
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  获取或构建索引
   *
   *  核心逻辑：
   *  1. 先检查内存缓存
   *  2. 再检查磁盘缓存
   *  3. 都无效则重新构建
   * ──────────────────────────────────────────────────────────────────────── */
  getOrBuild<T>(
    cacheKey: string,
    files: string[],
    builder: () => T
  ): T {
    // 1. 检查内存缓存
    const memCache = this.memoryCache.get(cacheKey) as IndexCache<T> | undefined
    if (memCache && this.isCacheValid(memCache, files)) {
      return memCache.data
    }

    // 2. 检查磁盘缓存
    const diskCache = this.loadFromDisk<T>(cacheKey)
    if (diskCache && this.isCacheValid(diskCache, files)) {
      this.memoryCache.set(cacheKey, diskCache)
      return diskCache.data
    }

    // 3. 重新构建
    const data = builder()
    const newCache: IndexCache<T> = {
      metadata: {
        version: CACHE_VERSION,
        buildTime: Date.now(),
        fileHashes: this.getFileHashes(files),
      },
      data,
    }

    this.memoryCache.set(cacheKey, newCache)
    this.saveToDisk(cacheKey, newCache)

    return data
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  清除指定缓存
   * ──────────────────────────────────────────────────────────────────────── */
  invalidate(cacheKey: string): void {
    this.memoryCache.delete(cacheKey)
    const cachePath = join(INDEX_DIR, `${cacheKey}.json`)
    if (existsSync(cachePath)) {
      try {
        const { unlinkSync } = require('fs')
        unlinkSync(cachePath)
      } catch { /* 忽略 */ }
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  清除所有缓存
   * ──────────────────────────────────────────────────────────────────────── */
  invalidateAll(): void {
    this.memoryCache.clear()
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出单例                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const indexCacheManager = new IndexCacheManager()
export { INDEX_DIR }
