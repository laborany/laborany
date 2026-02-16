import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { DATA_DIR } from '../paths.js'
import { memCellStorage, type MemCell } from './memcell/index.js'
import { episodeClusterer, episodeStorage, episodeLLMEnhancer } from './episode/index.js'
import { profileManager } from './profile/index.js'

const MEMORY_DIR = join(DATA_DIR, 'memory')
const GLOBAL_MEMORY_DIR = join(MEMORY_DIR, 'global')
const SKILLS_MEMORY_DIR = join(MEMORY_DIR, 'skills')
const GLOBAL_MEMORY_MD_PATH = join(DATA_DIR, 'MEMORY.md')
const CANDIDATES_PATH = join(MEMORY_DIR, 'consolidation-candidates.json')

const INDEX_DIR = join(MEMORY_DIR, 'index')
const LONGTERM_GLOBAL_INDEX_PATH = join(INDEX_DIR, 'longterm-global.json')
const LONGTERM_SKILLS_INDEX_DIR = join(INDEX_DIR, 'longterm-skills')
const LONGTERM_AUDIT_PATH = join(INDEX_DIR, 'longterm-audit.jsonl')
const AUTO_MEMORY_MARKER = '<!-- laborany-longterm-managed -->'

const STOPWORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很',
  'the', 'is', 'at', 'which', 'on', 'and', 'or', 'but', 'in', 'with', 'for', 'to', 'of', 'an',
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

function nowIso(): string {
  return new Date().toISOString()
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value))
}

function safeReadText(path: string): string {
  try {
    if (!existsSync(path)) return ''
    return readFileSync(path, 'utf-8')
  } catch {
    return ''
  }
}

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
}

export type LongTermStatus = 'active' | 'stale' | 'superseded'
export interface LongTermEntry {
  id: string
  scope: 'global' | 'skill'
  skillId?: string
  skillName?: string
  category: string
  statement: string
  confidence: number
  evidenceCount: number
  sourceRefs: string[]
  lastConfirmedAt: string
  writeCount: number
  status: LongTermStatus
  supersedes?: string
  createdAt: string
  updatedAt: string
}

export interface LongTermIndex {
  version: number
  updatedAt: string
  entries: LongTermEntry[]
}

export interface LongTermDecisionLog {
  id: string
  at: string
  scope: 'global' | 'skill'
  skillId?: string
  action: 'inserted' | 'updated' | 'superseded' | 'skipped'
  reason: string
  category: string
  statement: string
  confidence: number
  evidenceCount: number
  entryId?: string
  replacedEntryId?: string
  policyVersion?: string
}

export interface AutoUpsertLongTermParams {
  scope: 'global' | 'skill'
  skillId?: string
  skillName?: string
  category: string
  statement: string
  confidence: number
  evidenceCount: number
  sourceRefs: string[]
  policyVersion?: string
}

export interface AutoUpsertLongTermResult {
  written: boolean
  action: LongTermDecisionLog['action']
  reason: string
  entryId?: string
  replacedEntryId?: string
}

export interface LongTermStats {
  days: number
  accepted: number
  rejected: number
  superseded: number
  total: number
  lastActionAt?: string
}

export class MemoryConsolidator {
  private candidates: Map<string, ConsolidationCandidate> = new Map()

  constructor() {
    this.ensureStorage()
    this.loadCandidates()
  }

  private ensureStorage(): void {
    if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true })
    if (!existsSync(INDEX_DIR)) mkdirSync(INDEX_DIR, { recursive: true })
    if (!existsSync(LONGTERM_SKILLS_INDEX_DIR)) mkdirSync(LONGTERM_SKILLS_INDEX_DIR, { recursive: true })
  }

  private normalizeText(content: string): string {
    return content.toLowerCase().replace(/[\s，。,.；;：:!?！？“”"'‘’（）()\[\]{}<>-]/g, '').slice(0, 200)
  }

  private findDuplicateCandidate(params: {
    scope: 'global' | 'skill'
    skillId?: string
    category: string
    content: string
  }): ConsolidationCandidate | undefined {
    const { scope, skillId, category, content } = params
    const normalized = this.normalizeText(content)
    for (const item of this.candidates.values()) {
      if (item.scope !== scope) continue
      if ((item.skillId || '') !== (skillId || '')) continue
      if (item.category !== category) continue
      if (this.normalizeText(item.content) === normalized) return item
    }
    return undefined
  }

  private normalizeStatement(statement: string): string {
    return statement.replace(/\r/g, '').replace(/\s+/g, ' ').trim().slice(0, 280)
  }

  private tokenize(text: string): string[] {
    const words = text
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .map(word => word.trim())
      .filter(word => word.length >= 2 && !STOPWORDS.has(word))
    return [...new Set(words)]
  }

  private similarity(a: string, b: string): number {
    const na = this.normalizeText(a)
    const nb = this.normalizeText(b)
    if (!na || !nb) return 0
    if (na === nb) return 1
    const at = this.tokenize(a)
    const bt = this.tokenize(b)
    if (at.length === 0 || bt.length === 0) return na.slice(0, 60) === nb.slice(0, 60) ? 0.75 : 0
    const as = new Set(at)
    const bs = new Set(bt)
    let intersect = 0
    for (const token of as) {
      if (bs.has(token)) intersect += 1
    }
    return intersect / new Set([...as, ...bs]).size
  }

  private getIndexPath(scope: 'global' | 'skill', skillId?: string): string {
    return scope === 'global' ? LONGTERM_GLOBAL_INDEX_PATH : join(LONGTERM_SKILLS_INDEX_DIR, `${skillId || 'unknown'}.json`)
  }

  private getMemoryPath(scope: 'global' | 'skill', skillId?: string): string {
    return scope === 'global' ? GLOBAL_MEMORY_MD_PATH : join(SKILLS_MEMORY_DIR, skillId || 'unknown', 'MEMORY.md')
  }

  private loadIndex(scope: 'global' | 'skill', skillId?: string): LongTermIndex {
    const path = this.getIndexPath(scope, skillId)
    const raw = safeReadText(path).trim()
    if (!raw) return { version: 1, updatedAt: nowIso(), entries: [] }
    try {
      const parsed = JSON.parse(raw) as LongTermIndex
      if (!parsed || !Array.isArray(parsed.entries)) return { version: 1, updatedAt: nowIso(), entries: [] }
      return { version: parsed.version || 1, updatedAt: parsed.updatedAt || nowIso(), entries: parsed.entries.filter(Boolean) }
    } catch {
      return { version: 1, updatedAt: nowIso(), entries: [] }
    }
  }

  private saveIndex(scope: 'global' | 'skill', skillId: string | undefined, index: LongTermIndex): void {
    const path = this.getIndexPath(scope, skillId)
    if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true })
    const payload: LongTermIndex = {
      version: (index.version || 1) + 1,
      updatedAt: nowIso(),
      entries: index.entries,
    }
    writeFileSync(path, JSON.stringify(payload, null, 2), 'utf-8')
  }

  private renderMarkdown(scope: 'global' | 'skill', skillId?: string): void {
    const index = this.loadIndex(scope, skillId)
    const active = index.entries
      .filter(entry => entry.status === 'active')
      .sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category, 'zh-Hans-CN')
        if (b.confidence !== a.confidence) return b.confidence - a.confidence
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
    const path = this.getMemoryPath(scope, skillId)
    if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true })
    const existingContent = safeReadText(path).trim()
    const shouldPreserveLegacy = !!existingContent
      && !existingContent.includes(AUTO_MEMORY_MARKER)
      && !existingContent.includes('## 历史手工内容（自动保留）')
      && !existingContent.includes('<!-- mid:')

    const title = scope === 'global' ? '# 全局长期记忆' : `# 技能长期记忆${skillId ? `（${skillId}）` : ''}`
    const lines = [title, '', AUTO_MEMORY_MARKER, '', '> 由 LaborAny 自动维护的高置信长期记忆。', '', `> 最后重建：${nowIso()}`, '', '---', '']
    if (active.length === 0) {
      lines.push('## 学习记录', '', '<!-- 暂无长期记忆条目 -->', '')
      writeFileSync(path, lines.join('\n'), 'utf-8')
      return
    }
    let currentCategory = ''
    for (const entry of active) {
      if (entry.category !== currentCategory) {
        currentCategory = entry.category
        lines.push(`## ${currentCategory}`, '')
      }
      lines.push(`<!-- mid:${entry.id} conf:${entry.confidence.toFixed(2)} evidences:${entry.evidenceCount} updated:${entry.updatedAt} -->`)
      lines.push(`- ${entry.statement}`)
    }

    if (shouldPreserveLegacy) {
      lines.push('')
      lines.push('## 历史手工内容（自动保留）')
      lines.push('')
      lines.push('```markdown')
      lines.push(existingContent.slice(0, 6000))
      lines.push('```')
    }

    lines.push('')
    writeFileSync(path, lines.join('\n'), 'utf-8')
  }

  private appendAudit(log: LongTermDecisionLog): void {
    if (!existsSync(dirname(LONGTERM_AUDIT_PATH))) mkdirSync(dirname(LONGTERM_AUDIT_PATH), { recursive: true })
    appendFileSync(LONGTERM_AUDIT_PATH, `${JSON.stringify(log)}\n`, 'utf-8')
  }

  private writeDecision(params: Omit<LongTermDecisionLog, 'id' | 'at'>): void {
    this.appendAudit({
      id: `ltlog_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      at: nowIso(),
      ...params,
    })
  }

  private getConflictEntry(index: LongTermIndex, category: string, statement: string): LongTermEntry | null {
    const active = index.entries.filter(entry => entry.status === 'active' && entry.category === category)
    let best: LongTermEntry | null = null
    let bestScore = 0
    for (const entry of active) {
      const score = this.similarity(entry.statement, statement)
      if (score > bestScore) {
        bestScore = score
        best = entry
      }
    }
    return bestScore >= 0.72 ? best : null
  }

  autoUpsertLongTerm(params: AutoUpsertLongTermParams): AutoUpsertLongTermResult {
    const scope = params.scope
    const skillId = scope === 'skill' ? (params.skillId || 'unknown') : undefined
    const statement = this.normalizeStatement(params.statement)
    const category = (params.category || '工作偏好').trim()
    const confidence = clamp(params.confidence)
    const evidenceCount = Math.max(1, params.evidenceCount || 1)
    const sourceRefs = [...new Set((params.sourceRefs || []).filter(Boolean))]

    if (!statement) {
      this.writeDecision({ scope, skillId, action: 'skipped', reason: 'empty_statement', category, statement: '', confidence, evidenceCount, policyVersion: params.policyVersion })
      return { written: false, action: 'skipped', reason: 'empty_statement' }
    }
    if (isConsolidateNoise(statement)) {
      this.writeDecision({ scope, skillId, action: 'skipped', reason: 'noise_statement', category, statement, confidence, evidenceCount, policyVersion: params.policyVersion })
      return { written: false, action: 'skipped', reason: 'noise_statement' }
    }

    const index = this.loadIndex(scope, skillId)
    const duplicate = index.entries.find(entry =>
      entry.status === 'active'
      && entry.category === category
      && this.normalizeText(entry.statement) === this.normalizeText(statement),
    )
    if (duplicate) {
      duplicate.confidence = Math.max(duplicate.confidence, confidence)
      duplicate.evidenceCount = Math.max(duplicate.evidenceCount, evidenceCount)
      duplicate.sourceRefs = [...new Set([...duplicate.sourceRefs, ...sourceRefs])]
      duplicate.writeCount += 1
      duplicate.lastConfirmedAt = nowIso()
      duplicate.updatedAt = nowIso()
      this.saveIndex(scope, skillId, index)
      this.renderMarkdown(scope, skillId)
      this.writeDecision({
        scope,
        skillId,
        action: 'updated',
        reason: 'duplicate_refresh',
        category,
        statement,
        confidence,
        evidenceCount,
        entryId: duplicate.id,
        policyVersion: params.policyVersion,
      })
      return { written: true, action: 'updated', reason: 'duplicate_refresh', entryId: duplicate.id }
    }

    const conflict = this.getConflictEntry(index, category, statement)
    if (conflict) {
      const newIsBetter = confidence >= conflict.confidence + 0.06 || evidenceCount >= conflict.evidenceCount + 1
      if (!newIsBetter) {
        this.writeDecision({
          scope,
          skillId,
          action: 'skipped',
          reason: 'existing_stronger_conflict',
          category,
          statement,
          confidence,
          evidenceCount,
          entryId: conflict.id,
          policyVersion: params.policyVersion,
        })
        return { written: false, action: 'skipped', reason: 'existing_stronger_conflict', entryId: conflict.id }
      }
      conflict.status = 'superseded'
      conflict.updatedAt = nowIso()
      const entry: LongTermEntry = {
        id: `lt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        scope,
        skillId,
        skillName: params.skillName,
        category,
        statement,
        confidence,
        evidenceCount,
        sourceRefs,
        lastConfirmedAt: nowIso(),
        writeCount: 1,
        status: 'active',
        supersedes: conflict.id,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      index.entries.push(entry)
      this.saveIndex(scope, skillId, index)
      this.renderMarkdown(scope, skillId)
      this.writeDecision({
        scope,
        skillId,
        action: 'superseded',
        reason: 'replace_conflict_entry',
        category,
        statement,
        confidence,
        evidenceCount,
        entryId: entry.id,
        replacedEntryId: conflict.id,
        policyVersion: params.policyVersion,
      })
      return { written: true, action: 'superseded', reason: 'replace_conflict_entry', entryId: entry.id, replacedEntryId: conflict.id }
    }

    const entry: LongTermEntry = {
      id: `lt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      scope,
      skillId,
      skillName: params.skillName,
      category,
      statement,
      confidence,
      evidenceCount,
      sourceRefs,
      lastConfirmedAt: nowIso(),
      writeCount: 1,
      status: 'active',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    index.entries.push(entry)
    this.saveIndex(scope, skillId, index)
    this.renderMarkdown(scope, skillId)
    this.writeDecision({
      scope,
      skillId,
      action: 'inserted',
      reason: 'new_entry',
      category,
      statement,
      confidence,
      evidenceCount,
      entryId: entry.id,
      policyVersion: params.policyVersion,
    })
    return { written: true, action: 'inserted', reason: 'new_entry', entryId: entry.id }
  }

  rebuildLongTermMarkdown(params?: { scope?: 'global' | 'skill'; skillId?: string }): { rebuilt: number; scopes: string[] } {
    const scope = params?.scope
    const skillId = params?.skillId
    const scopes: string[] = []
    if (!scope || scope === 'global') {
      this.renderMarkdown('global')
      scopes.push('global')
    }
    if (!scope || scope === 'skill') {
      if (skillId) {
        this.renderMarkdown('skill', skillId)
        scopes.push(`skill:${skillId}`)
      } else if (existsSync(LONGTERM_SKILLS_INDEX_DIR)) {
        const files = readdirSync(LONGTERM_SKILLS_INDEX_DIR).filter(name => name.endsWith('.json'))
        for (const file of files) {
          const currentSkillId = file.replace(/\.json$/, '')
          this.renderMarkdown('skill', currentSkillId)
          scopes.push(`skill:${currentSkillId}`)
        }
      }
    }
    return { rebuilt: scopes.length, scopes }
  }

  getLongTermAudit(params?: { scope?: 'global' | 'skill'; skillId?: string; limit?: number }): LongTermDecisionLog[] {
    const scope = params?.scope
    const skillId = params?.skillId
    const limit = Math.max(1, params?.limit || 50)
    const raw = safeReadText(LONGTERM_AUDIT_PATH).trim()
    if (!raw) return []
    const logs: LongTermDecisionLog[] = []
    const lines = raw.split('\n').filter(Boolean)
    for (let index = lines.length - 1; index >= 0; index--) {
      try {
        const item = JSON.parse(lines[index]) as LongTermDecisionLog
        if (scope && item.scope !== scope) continue
        if (scope === 'skill' && skillId && item.skillId !== skillId) continue
        logs.push(item)
        if (logs.length >= limit) break
      } catch {
        continue
      }
    }
    return logs
  }

  getLongTermStats(days = 7): LongTermStats {
    const logs = this.getLongTermAudit({ limit: 5000 })
    const cutoff = Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000
    let accepted = 0
    let rejected = 0
    let superseded = 0
    let total = 0
    let lastActionAt: string | undefined
    for (const item of logs) {
      const at = Date.parse(item.at)
      if (!Number.isFinite(at) || at < cutoff) continue
      total += 1
      if (!lastActionAt || at > Date.parse(lastActionAt)) lastActionAt = item.at
      if (item.action === 'inserted' || item.action === 'updated') accepted += 1
      else if (item.action === 'superseded') superseded += 1
      else rejected += 1
    }
    return { days: Math.max(1, days), accepted, rejected, superseded, total, lastActionAt }
  }

  private loadCandidates(): void {
    const raw = safeReadText(CANDIDATES_PATH).trim()
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as ConsolidationCandidate[]
      if (!Array.isArray(parsed)) return
      for (const item of parsed) {
        if (!item || !item.id || !item.scope || !item.content) continue
        this.candidates.set(item.id, item)
      }
    } catch {
      // ignore
    }
  }

  private saveCandidates(): void {
    if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true })
    writeFileSync(CANDIDATES_PATH, JSON.stringify(Array.from(this.candidates.values()), null, 2), 'utf-8')
  }

  private readDailyMemories(dir: string, days = 7): DailyMemoryEntry[] {
    if (!existsSync(dir)) return []
    const files = readdirSync(dir)
      .filter(file => file.endsWith('.md') && file !== 'MEMORY.md')
      .sort()
      .reverse()
      .slice(0, days)
    const entries: DailyMemoryEntry[] = []
    for (const file of files) {
      const date = file.replace('.md', '')
      const sections = safeReadText(join(dir, file)).split(/\n## (\d{2}:\d{2})\n/)
      for (let index = 1; index < sections.length; index += 2) {
        const time = sections[index]
        const content = sections[index + 1]?.trim()
        if (!time || !content || isConsolidateNoise(content)) continue
        entries.push({ date, time, content })
      }
    }
    return entries
  }

  private analyzePatterns(entries: DailyMemoryEntry[]): Map<string, DailyMemoryEntry[]> {
    const patterns = new Map<string, DailyMemoryEntry[]>()
    for (const entry of entries) {
      const words = entry.content
        .replace(/[^\u4e00-\u9fa5a-zA-Z\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length >= 2 && !STOPWORDS.has(word.toLowerCase()))
      for (const word of new Set(words)) {
        const list = patterns.get(word) || []
        list.push(entry)
        patterns.set(word, list)
      }
    }
    const filtered = new Map<string, DailyMemoryEntry[]>()
    for (const [word, list] of patterns) {
      if (list.length >= 2) filtered.set(word, list)
    }
    return filtered
  }

  private generateCandidateId(): string {
    return `cand_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  private calcConfidence(entries: DailyMemoryEntry[], total: number): number {
    const base = Math.min(entries.length / Math.max(1, total), 1)
    const recentBoost = entries.some(entry => Date.now() - new Date(entry.date).getTime() < 2 * 24 * 60 * 60 * 1000) ? 0.1 : 0
    return Math.min(base + recentBoost, 1)
  }

  analyzeRecentMemories(params: { scope: 'global' | 'skill'; skillId?: string; skillName?: string; days?: number }): ConsolidationCandidate[] {
    const scope = params.scope
    const skillId = params.skillId
    const skillName = params.skillName
    const days = params.days || 7
    const dir = scope === 'global' ? GLOBAL_MEMORY_DIR : join(SKILLS_MEMORY_DIR, skillId || '')
    const entries = this.readDailyMemories(dir, days)
    if (entries.length === 0) return []
    const patterns = this.analyzePatterns(entries)
    const candidates: ConsolidationCandidate[] = []
    for (const [keyword, relatedEntries] of patterns) {
      const representative = relatedEntries.reduce((a, b) => (a.content.length >= b.content.length ? a : b))
      if (isConsolidateNoise(representative.content)) continue
      const source = [...new Set(relatedEntries.map(item => `${item.date} ${item.time}`))]
      const existing = this.findDuplicateCandidate({
        scope,
        skillId,
        category: keyword,
        content: representative.content,
      })
      if (existing) {
        existing.confidence = Math.max(existing.confidence, this.calcConfidence(relatedEntries, entries.length))
        existing.source = [...new Set([...existing.source, ...source])]
        candidates.push(existing)
      } else {
        const candidate: ConsolidationCandidate = {
          id: this.generateCandidateId(),
          createdAt: nowIso(),
          scope,
          skillId,
          skillName,
          category: keyword,
          content: representative.content,
          source,
          confidence: this.calcConfidence(relatedEntries, entries.length),
        }
        this.candidates.set(candidate.id, candidate)
        candidates.push(candidate)
      }
    }
    this.saveCandidates()
    return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, 5)
  }

  getCandidates(scope?: 'global' | 'skill', skillId?: string): ConsolidationCandidate[] {
    const all = Array.from(this.candidates.values()).sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    if (!scope) return all
    return all.filter(item => item.scope === scope && (!skillId || item.skillId === skillId))
  }

  getCandidate(id: string): ConsolidationCandidate | undefined {
    return this.candidates.get(id)
  }

  consolidateCandidates(params: ConsolidateParams): { success: boolean; consolidated: number } {
    const candidateIds = params.candidateIds
    const scope = params.scope
    const skillId = params.skillId
    let consolidated = 0
    for (const id of candidateIds) {
      const candidate = this.candidates.get(id)
      if (!candidate || candidate.scope !== scope) continue
      if (scope === 'skill' && skillId && candidate.skillId !== skillId) continue
      const result = this.autoUpsertLongTerm({
        scope: candidate.scope,
        skillId: candidate.skillId,
        skillName: candidate.skillName,
        category: candidate.category,
        statement: candidate.content,
        confidence: candidate.confidence,
        evidenceCount: Math.max(1, candidate.source.length),
        sourceRefs: candidate.source,
        policyVersion: 'manual-consolidate',
      })
      this.candidates.delete(id)
      if (result.written) consolidated += 1
    }
    this.saveCandidates()
    return { success: true, consolidated }
  }

  consolidate(params: ConsolidateParams): { success: boolean; consolidated: number } {
    return this.consolidateCandidates(params)
  }

  rejectCandidates(candidateIds: string[]): number {
    let rejected = 0
    for (const id of candidateIds) {
      if (this.candidates.delete(id)) rejected += 1
    }
    if (rejected > 0) this.saveCandidates()
    return rejected
  }

  clearCandidates(): void {
    this.candidates.clear()
    this.saveCandidates()
  }
}

export const memoryConsolidator = new MemoryConsolidator()

export class MemoryProcessor {
  async clusterRecentCellsAsync(days = 7): Promise<string[]> {
    const cells = memCellStorage.listRecent(days)
    if (cells.length === 0) return []
    episodeClusterer.clear()
    const episodes = episodeClusterer.cluster(cells)
    const cellMap = new Map(cells.map(cell => [cell.id, cell]))
    const saved: string[] = []
    for (const episode of episodes) {
      if (episodeLLMEnhancer.isAvailable()) {
        try {
          const episodeCells = episode.cellIds.map(id => cellMap.get(id)).filter(Boolean) as MemCell[]
          const enhanced = await episodeLLMEnhancer.enhance(episode, episodeCells)
          episode.subject = enhanced.subject
          episode.summary = enhanced.summary
        } catch (error) {
          console.warn('[MemoryProcessor] Episode LLM 增强失败:', error)
        }
      }
      episodeStorage.save(episode)
      saved.push(episode.id)
    }
    return saved
  }

  clusterRecentCells(days = 7): string[] {
    const cells = memCellStorage.listRecent(days)
    if (cells.length === 0) return []
    episodeClusterer.clear()
    const episodes = episodeClusterer.cluster(cells)
    const saved: string[] = []
    for (const episode of episodes) {
      episodeStorage.save(episode)
      saved.push(episode.id)
    }
    return saved
  }

  getStats(): { cells: number; episodes: number; profileFields: number } {
    const cells = memCellStorage.listRecent(30).length
    const episodes = episodeStorage.listAll().length
    const profile = profileManager.get()
    const profileFields = profile.sections.reduce((sum, section) => sum + section.fields.length, 0)
    return { cells, episodes, profileFields }
  }
}

export const memoryProcessor = new MemoryProcessor()
