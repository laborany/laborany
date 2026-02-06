/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     记忆处理器                                            ║
 * ║                                                                          ║
 * ║  职责：协调三级记忆结构的提取、聚类和更新                                   ║
 * ║  触发：对话结束时自动调用                                                  ║
 * ║  智能：全链路 LLM 增强（MemCell + Episode + Profile）                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { memCellExtractor, memCellStorage, type Message, type MemCell } from './memcell/index.js'
import { episodeClusterer, episodeStorage, episodeLLMEnhancer } from './episode/index.js'
import { profileManager, profileLLMClassifier } from './profile/index.js'
import { memoryFileManager } from './file-manager.js'
import { llmExtractor } from './llm-extractor.js'
import { memoryConsolidator } from './consolidator.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface ProcessParams {
  skillId: string
  userQuery: string
  assistantResponse: string
  timestamp?: Date
  useLLM?: boolean
}

interface ProcessResult {
  cellId: string | null
  episodeIds: string[]
  profileUpdated: boolean
  extractionMethod: 'llm' | 'regex'
  profileMethod: 'llm' | 'rule'
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     工具函数                                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function generateCellId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `cell_${ts}_${rand}`
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     记忆处理器类                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class MemoryProcessor {
  /* ────────────────────────────────────────────────────────────────────────
   *  处理单次对话（全链路 LLM 增强）
   *
   *  流程：
   *  1. LLM 提取 MemCell（摘要 + 事实）
   *  2. LLM 分类事实到 Profile
   *  3. 保存 MemCell + 更新 Profile
   *  4. 写入每日记忆
   * ──────────────────────────────────────────────────────────────────────── */
  async processConversationAsync(params: ProcessParams): Promise<ProcessResult> {
    const { skillId, userQuery, assistantResponse, timestamp = new Date(), useLLM = true } = params

    const result: ProcessResult = {
      cellId: null,
      episodeIds: [],
      profileUpdated: false,
      extractionMethod: 'regex',
      profileMethod: 'rule',
    }

    const messages: Message[] = [
      { role: 'user', content: userQuery, timestamp },
      { role: 'assistant', content: assistantResponse, timestamp },
    ]

    let cell: MemCell

    // MemCell 层：LLM 提取
    if (useLLM && llmExtractor.isAvailable()) {
      try {
        const llmResult = await llmExtractor.extract(messages)
        cell = {
          id: generateCellId(),
          timestamp,
          skillId,
          summary: llmResult.summary,
          messages,
          facts: llmResult.facts,
        }
        result.extractionMethod = 'llm'
        console.log(`[MemoryProcessor] MemCell LLM 提取: ${llmResult.facts.length} 个事实`)
      } catch (error) {
        console.warn('[MemoryProcessor] MemCell LLM 失败，降级:', error)
        cell = memCellExtractor.extract(messages, skillId)
      }
    } else {
      cell = memCellExtractor.extract(messages, skillId)
    }

    result.cellId = cell.id
    memCellStorage.save(cell)

    // Profile 层：LLM 智能分类
    if (useLLM && profileLLMClassifier.isAvailable() && cell.facts.length > 0) {
      await this.updateProfileWithLLM(cell)
      result.profileMethod = 'llm'
      result.profileUpdated = true
      console.log(`[MemoryProcessor] Profile LLM 分类完成`)
    } else {
      this.updateProfileWithRules(cell)
      result.profileUpdated = cell.facts.length > 0
    }

    this.writeToDaily(params, cell)

    // 异步触发自动归纳（fire-and-forget，不阻塞主流程）
    this.maybeAutoConsolidate().catch(err =>
      console.warn('[MemoryProcessor] 自动归纳失败:', err)
    )

    return result
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  使用 LLM 智能更新 Profile
   * ──────────────────────────────────────────────────────────────────────── */
  private async updateProfileWithLLM(cell: MemCell): Promise<void> {
    const evidence = `${cell.timestamp.toISOString().split('T')[0]}|${cell.id}`

    for (const fact of cell.facts) {
      try {
        const classification = await profileLLMClassifier.classify(fact)

        if (!classification.shouldUpdate) {
          console.log(`[MemoryProcessor] 跳过: ${classification.reason}`)
          continue
        }

        // 检查是否存在冲突
        const existingFields = profileManager.getSection(classification.section)
        const existing = existingFields.find(f => f.key === classification.key)

        if (existing && existing.description !== classification.description) {
          const conflict = await profileLLMClassifier.resolveConflict(
            existing.description,
            classification.description,
            existing.evidences,
            evidence
          )

          if (conflict.resolution === 'keep_old') {
            console.log(`[MemoryProcessor] 保留旧值: ${conflict.reason}`)
            continue
          }

          const finalDesc = conflict.resolution === 'merge'
            ? conflict.mergedValue || classification.description
            : classification.description

          profileManager.updateField(
            classification.section,
            classification.key,
            finalDesc,
            evidence,
            fact.confidence
          )
        } else {
          profileManager.updateField(
            classification.section,
            classification.key,
            classification.description,
            evidence,
            fact.confidence
          )
        }
      } catch (error) {
        console.warn('[MemoryProcessor] Profile LLM 分类失败，使用规则:', error)
        this.updateSingleFactWithRules(cell, fact)
      }
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  使用规则更新 Profile（降级方案）
   * ──────────────────────────────────────────────────────────────────────── */
  private updateProfileWithRules(cell: MemCell): void {
    for (const fact of cell.facts) {
      this.updateSingleFactWithRules(cell, fact)
    }
  }

  private updateSingleFactWithRules(cell: MemCell, fact: MemCell['facts'][0]): void {
    const evidence = `${cell.timestamp.toISOString().split('T')[0]}|${cell.id}`
    const sectionMap: Record<string, string> = {
      preference: '工作偏好',
      fact: '个人信息',
      correction: '沟通风格',
      context: '工作偏好',
    }
    const section = sectionMap[fact.type] || '工作偏好'
    const key = this.extractFactKey(fact.content)
    profileManager.updateField(section, key, fact.content, evidence, fact.confidence)
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  从事实内容中提取有意义的 key
   *
   *  策略：去掉常见前缀词，提取核心名词短语
   * ──────────────────────────────────────────────────────────────────────── */
  private extractFactKey(content: string): string {
    // 去掉常见的中文前缀（"我喜欢"、"我是"、"我在"等）
    const stripped = content
      .replace(/^我(喜欢|习惯|偏好|倾向|是|的|在|有|用|做)/, '')
      .trim()

    // 取前 30 字符中的核心短语
    const core = stripped.slice(0, 30)

    // 如果提取后为空，回退到原始内容截取
    return core || content.slice(0, 20)
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  自动归纳：当天 MemCell 积累足够时，触发长期记忆归纳
   *
   *  条件：当天 MemCell >= 5
   *  范围：最近 3 天的每日记忆
   *  阈值：confidence >= 0.6 的候选自动写入
   * ──────────────────────────────────────────────────────────────────────── */
  private async maybeAutoConsolidate(): Promise<void> {
    const todayCells = memCellStorage.listByDate(new Date())
    if (todayCells.length < 5) return

    const candidates = memoryConsolidator.analyzeRecentMemories({
      scope: 'global',
      days: 3,
    })

    const qualified = candidates.filter(c => c.confidence >= 0.6)
    if (qualified.length === 0) return

    const ids = qualified.map(c => c.id)
    const result = memoryConsolidator.consolidate({
      candidateIds: ids,
      scope: 'global',
    })

    console.log(`[MemoryProcessor] 自动归纳: ${result.consolidated} 条写入 MEMORY.md`)
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  写入每日记忆（结构化格式）
   * ──────────────────────────────────────────────────────────────────────── */
  private writeToDaily(params: ProcessParams, cell: MemCell): void {
    const { skillId, timestamp = new Date() } = params

    // 构建结构化内容
    const lines = [`**任务记录**`, `- 问题：${cell.messages[0]?.content || params.userQuery}`]
    lines.push(`- 摘要：${cell.summary}`)

    // 附加关键事实（如果有）
    if (cell.facts.length > 0) {
      const factList = cell.facts.map(f => `${f.content}`).join('；')
      lines.push(`- 关键事实：${factList}`)
    }

    const content = lines.join('\n')
    memoryFileManager.appendToDaily({ scope: 'skill', skillId, content, timestamp })
    memoryFileManager.appendToDaily({ scope: 'global', content, timestamp })
  }

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
      // LLM 增强 Episode
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
   *  同步版本（降级方案）
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
