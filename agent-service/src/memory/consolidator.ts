/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Memory Consolidator                                  ║
 * ║                                                                          ║
 * ║  职责：将每日记忆归纳为长期记忆                                            ║
 * ║  流程：分析 → 生成候选 → 用户确认 → 写入长期记忆                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { existsSync, readFileSync, readdirSync, appendFileSync } from 'fs'
import { join } from 'path'
import { DATA_DIR } from '../paths.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           路径常量                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const MEMORY_DIR = join(DATA_DIR, 'memory')
const GLOBAL_MEMORY_DIR = join(MEMORY_DIR, 'global')
const SKILLS_MEMORY_DIR = join(MEMORY_DIR, 'skills')
const GLOBAL_MEMORY_MD_PATH = join(DATA_DIR, 'MEMORY.md')

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface ConsolidationCandidate {
  id: string
  scope: 'global' | 'skill'
  skillId?: string
  skillName?: string
  category: string
  content: string
  source: string[]
  confidence: number
}

export interface ConsolidateParams {
  candidateIds: string[]
  scope: 'global' | 'skill'
  skillId?: string
}

interface DailyMemoryEntry {
  date: string
  time: string
  content: string
  filePath: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Memory Consolidator 类                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class MemoryConsolidator {
  private candidates: Map<string, ConsolidationCandidate> = new Map()

  /* ────────────────────────────────────────────────────────────────────────
   *  读取指定目录下的所有每日记忆
   * ──────────────────────────────────────────────────────────────────────── */
  private readDailyMemories(dir: string, days: number = 7): DailyMemoryEntry[] {
    if (!existsSync(dir)) return []

    const entries: DailyMemoryEntry[] = []
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.md') && f !== 'MEMORY.md')
      .sort()
      .reverse()
      .slice(0, days)

    for (const file of files) {
      const filePath = join(dir, file)
      const content = readFileSync(filePath, 'utf-8')
      const date = file.replace('.md', '')

      // 解析每日记忆中的各个条目（按 ## HH:MM 分割）
      const sections = content.split(/\n## (\d{2}:\d{2})\n/)
      for (let i = 1; i < sections.length; i += 2) {
        const time = sections[i]
        const text = sections[i + 1]?.trim()
        if (time && text) {
          entries.push({ date, time, content: text, filePath })
        }
      }
    }

    return entries
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  提取关键词（简单实现：提取中文词汇和英文单词）
   * ──────────────────────────────────────────────────────────────────────── */
  private extractKeywords(text: string): string[] {
    const words = text
      .replace(/[^\u4e00-\u9fa5a-zA-Z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2)
    return [...new Set(words)]
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  分析记忆条目，识别重复出现的模式
   * ──────────────────────────────────────────────────────────────────────── */
  private analyzePatterns(entries: DailyMemoryEntry[]): Map<string, DailyMemoryEntry[]> {
    const patterns = new Map<string, DailyMemoryEntry[]>()

    // 按关键词聚类
    for (const entry of entries) {
      const keywords = this.extractKeywords(entry.content)
      for (const keyword of keywords) {
        if (!patterns.has(keyword)) {
          patterns.set(keyword, [])
        }
        patterns.get(keyword)!.push(entry)
      }
    }

    // 过滤：只保留出现 2 次以上的模式
    const filtered = new Map<string, DailyMemoryEntry[]>()
    for (const [keyword, relatedEntries] of patterns) {
      if (relatedEntries.length >= 2) {
        filtered.set(keyword, relatedEntries)
      }
    }

    return filtered
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  生成候选条目 ID
   * ──────────────────────────────────────────────────────────────────────── */
  private generateId(): string {
    return `cand_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  分析最近的每日记忆，生成归纳候选
   * ──────────────────────────────────────────────────────────────────────── */
  analyzeRecentMemories(params: {
    scope: 'global' | 'skill'
    skillId?: string
    skillName?: string
    days?: number
  }): ConsolidationCandidate[] {
    const { scope, skillId, skillName, days = 7 } = params
    const dir = scope === 'global' ? GLOBAL_MEMORY_DIR : join(SKILLS_MEMORY_DIR, skillId!)

    const entries = this.readDailyMemories(dir, days)
    if (entries.length === 0) return []

    const patterns = this.analyzePatterns(entries)
    const candidates: ConsolidationCandidate[] = []

    // 为每个高频模式生成候选
    for (const [keyword, relatedEntries] of patterns) {
      // 取最具代表性的条目作为候选内容
      const representative = relatedEntries[0]
      const sources = [...new Set(relatedEntries.map(e => `${e.date} ${e.time}`))]

      const candidate: ConsolidationCandidate = {
        id: this.generateId(),
        scope,
        skillId,
        skillName,
        category: keyword,
        content: representative.content,
        source: sources,
        confidence: Math.min(relatedEntries.length / entries.length, 1),
      }

      this.candidates.set(candidate.id, candidate)
      candidates.push(candidate)
    }

    // 按置信度排序，取前 5 个
    return candidates
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  获取所有待确认的候选
   * ──────────────────────────────────────────────────────────────────────── */
  getCandidates(scope?: 'global' | 'skill', skillId?: string): ConsolidationCandidate[] {
    const all = Array.from(this.candidates.values())
    if (!scope) return all
    return all.filter(c => c.scope === scope && (!skillId || c.skillId === skillId))
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  获取单个候选
   * ──────────────────────────────────────────────────────────────────────── */
  getCandidate(id: string): ConsolidationCandidate | undefined {
    return this.candidates.get(id)
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  确认归纳：将候选写入长期记忆
   * ──────────────────────────────────────────────────────────────────────── */
  consolidate(params: ConsolidateParams): { success: boolean; consolidated: number } {
    const { candidateIds, scope, skillId } = params
    let consolidated = 0

    const memoryPath = scope === 'global'
      ? GLOBAL_MEMORY_MD_PATH
      : join(SKILLS_MEMORY_DIR, skillId!, 'MEMORY.md')

    for (const id of candidateIds) {
      const candidate = this.candidates.get(id)
      if (!candidate) continue

      // 构建要追加的内容
      const timestamp = new Date().toISOString().split('T')[0]
      const entry = `\n### ${candidate.category}\n\n${candidate.content}\n\n> 归纳自: ${candidate.source.join(', ')} | 归纳时间: ${timestamp}\n`

      // 追加到长期记忆
      appendFileSync(memoryPath, entry, 'utf-8')

      // 从候选列表中移除
      this.candidates.delete(id)
      consolidated++
    }

    return { success: true, consolidated }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  拒绝候选（从列表中移除）
   * ──────────────────────────────────────────────────────────────────────── */
  rejectCandidates(candidateIds: string[]): number {
    let rejected = 0
    for (const id of candidateIds) {
      if (this.candidates.delete(id)) rejected++
    }
    return rejected
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  清空所有候选
   * ──────────────────────────────────────────────────────────────────────── */
  clearCandidates(): void {
    this.candidates.clear()
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出单例                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const memoryConsolidator = new MemoryConsolidator()
