/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Episode 聚类器                                        ║
 * ║                                                                          ║
 * ║  职责：将相关的 MemCell 聚合为 Episode（情节记忆）                          ║
 * ║  算法：TF-IDF 相似度 + 时间窗口的增量聚类                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { TFIDFIndexer, TFIDFSearcher, tokenize } from '../tfidf.js'
import type { MemCell } from '../memcell/index.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface Episode {
  id: string
  subject: string
  cellIds: string[]
  centroid: string[]      // 质心词汇
  summary: string
  keyFacts: Array<{
    fact: string
    source: string        // cell_id
  }>
  createdAt: Date
  updatedAt: Date
}

interface Cluster {
  id: string
  cellIds: string[]
  centroid: Map<string, number>  // TF-IDF 向量
  centroidTokens: string[]
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     常量                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const SIMILARITY_THRESHOLD = 0.3   // 相似度阈值
const TIME_WINDOW_HOURS = 24       // 时间窗口（小时）

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     工具函数                                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function generateId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `ep_${ts}_${rand}`
}

function cellToText(cell: MemCell): string {
  const parts = [cell.summary]
  for (const msg of cell.messages) {
    parts.push(msg.content)
  }
  for (const fact of cell.facts) {
    parts.push(fact.content)
  }
  return parts.join(' ')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     Episode 聚类器类                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class EpisodeClusterer {
  private clusters: Map<string, Cluster> = new Map()

  /* ────────────────────────────────────────────────────────────────────────
   *  计算两个向量的余弦相似度
   * ──────────────────────────────────────────────────────────────────────── */
  private cosineSimilarity(
    v1: Map<string, number>,
    v2: Map<string, number>
  ): number {
    let dot = 0, mag1 = 0, mag2 = 0

    for (const [term, val] of v1) {
      mag1 += val * val
      const val2 = v2.get(term)
      if (val2) dot += val * val2
    }
    for (const val of v2.values()) {
      mag2 += val * val
    }

    const denom = Math.sqrt(mag1) * Math.sqrt(mag2)
    return denom > 0 ? dot / denom : 0
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  构建单个文档的 TF-IDF 向量
   * ──────────────────────────────────────────────────────────────────────── */
  private buildVector(text: string, idf: Map<string, number>): Map<string, number> {
    const tokens = tokenize(text)
    const tf = new Map<string, number>()
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1)
    }
    // 归一化
    for (const [term, count] of tf) {
      tf.set(term, count / tokens.length)
    }
    // TF-IDF
    const vector = new Map<string, number>()
    for (const [term, tfVal] of tf) {
      const idfVal = idf.get(term) || 0
      if (idfVal > 0) {
        vector.set(term, tfVal * idfVal)
      }
    }
    return vector
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  更新质心：new_centroid = (old * count + new) / (count + 1)
   * ──────────────────────────────────────────────────────────────────────── */
  private updateCentroid(
    oldCentroid: Map<string, number>,
    newVector: Map<string, number>,
    count: number
  ): Map<string, number> {
    const result = new Map<string, number>()

    // 合并所有词汇
    const allTerms = new Set([...oldCentroid.keys(), ...newVector.keys()])

    for (const term of allTerms) {
      const oldVal = oldCentroid.get(term) || 0
      const newVal = newVector.get(term) || 0
      result.set(term, (oldVal * count + newVal) / (count + 1))
    }

    return result
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  增量聚类：将新的 MemCell 分配到现有簇或创建新簇
   * ──────────────────────────────────────────────────────────────────────── */
  cluster(cells: MemCell[]): Episode[] {
    if (cells.length === 0) return []

    // 构建全局 IDF
    const indexer = new TFIDFIndexer()
    for (const cell of cells) {
      indexer.addDocument(cell.id, cellToText(cell))
    }
    const index = indexer.build()

    // 增量聚类
    for (const cell of cells) {
      const text = cellToText(cell)
      const vector = this.buildVector(text, index.idf)

      // 找最相似的簇
      let bestCluster: Cluster | null = null
      let bestSim = 0

      for (const cluster of this.clusters.values()) {
        const sim = this.cosineSimilarity(vector, cluster.centroid)
        if (sim > bestSim && sim >= SIMILARITY_THRESHOLD) {
          bestSim = sim
          bestCluster = cluster
        }
      }

      if (bestCluster) {
        // 加入现有簇
        bestCluster.cellIds.push(cell.id)
        bestCluster.centroid = this.updateCentroid(
          bestCluster.centroid,
          vector,
          bestCluster.cellIds.length - 1
        )
      } else {
        // 创建新簇
        const newCluster: Cluster = {
          id: generateId(),
          cellIds: [cell.id],
          centroid: vector,
          centroidTokens: tokenize(text),
        }
        this.clusters.set(newCluster.id, newCluster)
      }
    }

    // 转换为 Episode
    return this.toEpisodes(cells)
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  将簇转换为 Episode
   * ──────────────────────────────────────────────────────────────────────── */
  private toEpisodes(cells: MemCell[]): Episode[] {
    const cellMap = new Map(cells.map(c => [c.id, c]))
    const episodes: Episode[] = []

    for (const cluster of this.clusters.values()) {
      if (cluster.cellIds.length === 0) continue

      // 提取关键词作为主题
      const topTerms = Array.from(cluster.centroid.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([term]) => term)

      // 收集关键事实
      const keyFacts: Episode['keyFacts'] = []
      for (const cellId of cluster.cellIds) {
        const cell = cellMap.get(cellId)
        if (!cell) continue
        for (const fact of cell.facts) {
          keyFacts.push({ fact: fact.content, source: cellId })
        }
      }

      // 生成摘要（取第一个 cell 的摘要）
      const firstCell = cellMap.get(cluster.cellIds[0])
      const summary = firstCell?.summary || topTerms.join(' ')

      episodes.push({
        id: cluster.id,
        subject: topTerms.slice(0, 3).join(' '),
        cellIds: cluster.cellIds,
        centroid: topTerms,
        summary,
        keyFacts: keyFacts.slice(0, 10),
        createdAt: firstCell?.timestamp || new Date(),
        updatedAt: new Date(),
      })
    }

    return episodes
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  清空聚类状态
   * ──────────────────────────────────────────────────────────────────────── */
  clear(): void {
    this.clusters.clear()
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出单例                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const episodeClusterer = new EpisodeClusterer()
