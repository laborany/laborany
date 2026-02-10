/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     记忆处理器                                            ║
 * ║                                                                          ║
 * ║  职责：Episode 聚类 + 统计查询                                            ║
 * ║  说明：记忆提取已统一由 cli-extractor → orchestrator 链路完成              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { memCellStorage, type MemCell } from './memcell/index.js'
import { episodeClusterer, episodeStorage, episodeLLMEnhancer } from './episode/index.js'
import { profileManager } from './profile/index.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     记忆处理器类                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class MemoryProcessor {
  /* ────────────────────────────────────────────────────────────────────────
   *  批量聚类（LLM 增强 Episode）
   * ──────────────────────────────────────────────────────────────────────── */
  async clusterRecentCellsAsync(days = 7): Promise<string[]> {
    const cells = memCellStorage.listRecent(days)
    if (cells.length === 0) return []

    episodeClusterer.clear()
    const episodes = episodeClusterer.cluster(cells)
    const cellMap = new Map(cells.map(c => [c.id, c]))
    const savedIds: string[] = []

    for (const ep of episodes) {
      if (episodeLLMEnhancer.isAvailable()) {
        try {
          const epCells = ep.cellIds.map(id => cellMap.get(id)).filter(Boolean) as MemCell[]
          const enhanced = await episodeLLMEnhancer.enhance(ep, epCells)
          ep.subject = enhanced.subject
          ep.summary = enhanced.summary
          console.log(`[MemoryProcessor] Episode LLM 增强: ${ep.id}`)
        } catch (error) {
          console.warn('[MemoryProcessor] Episode LLM 增强失败:', error)
        }
      }
      episodeStorage.save(ep)
      savedIds.push(ep.id)
    }

    return savedIds
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  同步版本（无 LLM 增强）
   * ──────────────────────────────────────────────────────────────────────── */
  clusterRecentCells(days = 7): string[] {
    const cells = memCellStorage.listRecent(days)
    if (cells.length === 0) return []

    episodeClusterer.clear()
    const episodes = episodeClusterer.cluster(cells)
    const savedIds: string[] = []

    for (const ep of episodes) {
      episodeStorage.save(ep)
      savedIds.push(ep.id)
    }
    return savedIds
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  获取处理统计
   * ──────────────────────────────────────────────────────────────────────── */
  getStats(): { cells: number; episodes: number; profileFields: number } {
    const cells = memCellStorage.listRecent(30).length
    const episodes = episodeStorage.listAll().length
    const profile = profileManager.get()
    const profileFields = profile.sections.reduce((sum, s) => sum + s.fields.length, 0)
    return { cells, episodes, profileFields }
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出单例                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const memoryProcessor = new MemoryProcessor()
