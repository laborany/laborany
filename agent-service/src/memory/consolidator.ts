/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Memory Consolidator                                  ║
 * ║                                                                          ║
 * ║  职责：将每日记忆归纳为长期记忆                                            ║
 * ║  流程：分析 → 生成候选 → 用户确认 → 写入长期记忆                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { existsSync, readFileSync, readdirSync, appendFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { DATA_DIR } from '../paths.js'
import { memCellStorage, type MemCell } from './memcell/index.js'
import { episodeClusterer, episodeStorage, episodeLLMEnhancer } from './episode/index.js'
import { profileManager } from './profile/index.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           路径常量                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const MEMORY_DIR = join(DATA_DIR, 'memory')
const GLOBAL_MEMORY_DIR = join(MEMORY_DIR, 'global')
const SKILLS_MEMORY_DIR = join(MEMORY_DIR, 'skills')
const GLOBAL_MEMORY_MD_PATH = join(DATA_DIR, 'MEMORY.md')
const CANDIDATES_PATH = join(MEMORY_DIR, 'consolidation-candidates.json')

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface ConsolidationCandidate {
  id: string
  createdAt: string
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
 * │                     中英文停用词集合                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const STOPWORDS = new Set([
  // 中文停用词
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
  '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有',
  '看', '好', '自己', '这', '他', '她', '它', '们', '那', '些', '什么', '怎么',
  '如何', '可以', '需要', '使用', '进行', '通过', '问题', '方法', '这个', '那个',
  '已经', '还是', '或者', '但是', '因为', '所以', '如果', '虽然', '然后', '之后',
  // 英文停用词
  'the', 'is', 'at', 'which', 'on', 'and', 'or', 'but', 'in', 'with',
  'for', 'to', 'of', 'an', 'it', 'this', 'that', 'are', 'was', 'be',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'can',
  'could', 'should', 'may', 'might', 'not', 'no', 'so', 'if', 'then',
])

const CONSOLIDATE_NOISE_PATTERNS = [
  /复合\s*Skill\s*执行上下文/,
  /执行上下文/,
  /当前步骤[:：]/,
  /前序步骤结果/,
  /输入参数/,
  /\{\{\s*input\./,
  /尚未确认|尚未指定|未确认|待确认/,
  /LABORANY_ACTION|工具调用记录/,
  /老板好|让我(先|继续|开始)|采集完成|执行完成/,
  /(?:用户|我).{0,8}(?:称呼|叫|喊|称作|叫做).{0,8}(?:助手|你|AI|机器人).{0,6}(?:为|成|叫)?(?:老板|老大|哥|姐)/,
  /(?:助手|你).{0,8}(?:被|让).{0,8}(?:称呼|叫|喊|称作|叫做).{0,6}(?:老板|老大|哥|姐)/,
]

function isConsolidateNoise(text: string): boolean {
  return CONSOLIDATE_NOISE_PATTERNS.some(pattern => pattern.test(text))
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Memory Consolidator 类                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class MemoryConsolidator {
  private candidates: Map<string, ConsolidationCandidate> = new Map()

  constructor() {
    this.loadCandidates()
  }

  private loadCandidates(): void {
    try {
      if (!existsSync(CANDIDATES_PATH)) return
      const raw = readFileSync(CANDIDATES_PATH, 'utf-8').trim()
      if (!raw) return
      const parsed = JSON.parse(raw) as ConsolidationCandidate[]
      if (!Array.isArray(parsed)) return
      for (const item of parsed) {
        if (!item || !item.id || !item.scope || !item.content) continue
        this.candidates.set(item.id, item)
      }
    } catch {
      // 忽略候选加载失败
    }
  }

  private saveCandidates(): void {
    try {
      if (!existsSync(MEMORY_DIR)) {
        mkdirSync(MEMORY_DIR, { recursive: true })
      }
      const all = Array.from(this.candidates.values())
      writeFileSync(CANDIDATES_PATH, JSON.stringify(all, null, 2), 'utf-8')
    } catch {
      // 忽略候选持久化失败
    }
  }

  private normalizeContent(content: string): string {
    return content
      .toLowerCase()
      .replace(/[\s，。,.；;：:!?！？“”"'‘’（）()\[\]{}<>-]/g, '')
      .slice(0, 160)
  }

  private findDuplicateCandidate(params: {
    scope: 'global' | 'skill'
    skillId?: string
    category: string
    content: string
  }): ConsolidationCandidate | undefined {
    const { scope, skillId, category, content } = params
    const normalized = this.normalizeContent(content)

    for (const item of this.candidates.values()) {
      if (item.scope !== scope) continue
      if ((item.skillId || '') !== (skillId || '')) continue
      if (item.category !== category) continue
      if (this.normalizeContent(item.content) === normalized) {
        return item
      }
    }

    return undefined
  }

  enqueueCandidate(params: {
    scope: 'global' | 'skill'
    skillId?: string
    skillName?: string
    category: string
    content: string
    source: string[]
    confidence: number
  }): { candidate: ConsolidationCandidate; isNew: boolean } {
    const existing = this.findDuplicateCandidate(params)

    if (existing) {
      existing.confidence = Math.max(existing.confidence, params.confidence)
      existing.source = [...new Set([...existing.source, ...params.source])]
      this.saveCandidates()
      return { candidate: existing, isNew: false }
    }

    const candidate: ConsolidationCandidate = {
      id: this.generateId(),
      createdAt: new Date().toISOString(),
      scope: params.scope,
      skillId: params.skillId,
      skillName: params.skillName,
      category: params.category,
      content: params.content,
      source: [...new Set(params.source)],
      confidence: Math.max(0, Math.min(1, params.confidence)),
    }

    this.candidates.set(candidate.id, candidate)
    this.saveCandidates()
    return { candidate, isNew: true }
  }

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
          if (isConsolidateNoise(text)) continue
          entries.push({ date, time, content: text, filePath })
      }
      }
    }

    return entries
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  提取关键词（过滤停用词）
   * ──────────────────────────────────────────────────────────────────────── */
  private extractKeywords(text: string): string[] {
    const words = text
      .replace(/[^\u4e00-\u9fa5a-zA-Z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2 && !STOPWORDS.has(w.toLowerCase()))
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
      // 取最长的条目作为代表（信息量最大）
      const representative = relatedEntries.reduce((a, b) =>
        a.content.length >= b.content.length ? a : b
      )
      if (isConsolidateNoise(representative.content)) continue
      const sources = [...new Set(relatedEntries.map(e => `${e.date} ${e.time}`))]

      const candidate: ConsolidationCandidate = {
        id: this.generateId(),
        createdAt: new Date().toISOString(),
        scope,
        skillId,
        skillName,
        category: keyword,
        content: representative.content,
        source: sources,
        confidence: this.calcConfidence(relatedEntries, entries.length),
      }
      const enqueueResult = this.enqueueCandidate({
        scope,
        skillId,
        skillName,
        category: candidate.category,
        content: candidate.content,
        source: candidate.source,
        confidence: candidate.confidence,
      })
      candidates.push(enqueueResult.candidate)
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
      .sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
    if (!scope) return all
    return all.filter(c => c.scope === scope && (!skillId || c.skillId === skillId))
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  获取单个候选
   * ──────────────────────────────────────────────────────────────────────── */
  getCandidate(id: string): ConsolidationCandidate | undefined {
    return this.candidates.get(id)
  }

  consolidateCandidates(params: ConsolidateParams): { success: boolean; consolidated: number } {
    const { candidateIds, scope, skillId } = params
    let consolidated = 0
    const groupedByPath = new Map<string, ConsolidationCandidate[]>()

    for (const id of candidateIds) {
      const candidate = this.candidates.get(id)
      if (!candidate) continue
      if (candidate.scope !== scope) continue
      if (scope === 'skill' && skillId && candidate.skillId !== skillId) continue

      const memoryPath = candidate.scope === 'global'
        ? GLOBAL_MEMORY_MD_PATH
        : candidate.skillId
          ? join(SKILLS_MEMORY_DIR, candidate.skillId, 'MEMORY.md')
          : ''
      if (!memoryPath) continue

      const bucket = groupedByPath.get(memoryPath) || []
      bucket.push(candidate)
      groupedByPath.set(memoryPath, bucket)
    }

    for (const [memoryPath, group] of groupedByPath) {
      const parentDir = dirname(memoryPath)
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true })
      }
      if (!existsSync(memoryPath)) {
        const heading = memoryPath === GLOBAL_MEMORY_MD_PATH
          ? '# 全局长期记忆\n\n'
          : '# 技能长期记忆\n\n'
        writeFileSync(memoryPath, heading, 'utf-8')
      }

      for (const candidate of group) {
        const timestamp = new Date().toISOString().split('T')[0]
        const entry = `\n### ${candidate.category}\n\n${candidate.content}\n\n> 归档自: ${candidate.source.join(', ')} | 归档时间: ${timestamp}\n`
        appendFileSync(memoryPath, entry, 'utf-8')
        this.candidates.delete(candidate.id)
        consolidated++
      }
    }

    this.saveCandidates()

    return { success: true, consolidated }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  确认归纳：将候选写入长期记忆
   * ──────────────────────────────────────────────────────────────────────── */
  consolidate(params: ConsolidateParams): { success: boolean; consolidated: number } {
    return this.consolidateCandidates(params)
  }
  /* ────────────────────────────────────────────────────────────────────────
   *  拒绝候选（从列表中移除）
   * ──────────────────────────────────────────────────────────────────────── */
  rejectCandidates(candidateIds: string[]): number {
    let rejected = 0
    for (const id of candidateIds) {
      if (this.candidates.delete(id)) rejected++
    }
    if (rejected > 0) this.saveCandidates()
    return rejected
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  清空所有候选
   * ──────────────────────────────────────────────────────────────────────── */
  clearCandidates(): void {
    this.candidates.clear()
    this.saveCandidates()
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  计算置信度（近期条目加权）
   * ──────────────────────────────────────────────────────────────────────── */
  private calcConfidence(entries: DailyMemoryEntry[], total: number): number {
    const base = Math.min(entries.length / total, 1)
    const recentBoost = entries.some(e => this.isRecent(e.date)) ? 0.1 : 0
    return Math.min(base + recentBoost, 1)
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  判断日期是否为近 2 天内
   * ──────────────────────────────────────────────────────────────────────── */
  private isRecent(dateStr: string): boolean {
    const diff = Date.now() - new Date(dateStr).getTime()
    return diff < 2 * 24 * 60 * 60 * 1000
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出单例                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const memoryConsolidator = new MemoryConsolidator()

/* ── Memory Processor（Episode 聚类 + 统计） ── */

export class MemoryProcessor {
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

  getStats(): { cells: number; episodes: number; profileFields: number } {
    const cells = memCellStorage.listRecent(30).length
    const episodes = episodeStorage.listAll().length
    const profile = profileManager.get()
    const profileFields = profile.sections.reduce((sum, s) => sum + s.fields.length, 0)
    return { cells, episodes, profileFields }
  }
}

export const memoryProcessor = new MemoryProcessor()
