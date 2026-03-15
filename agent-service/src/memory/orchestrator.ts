
import { memoryFileManager } from './file-manager.js'
import { memorySearch } from './search.js'
import { profileLLMClassifier, profileManager } from './profile/index.js'
import { memoryConsolidator } from './consolidator.js'
import { memCellStorage, type MemCell, type ExtractedFact } from './memcell/index.js'
import { episodeStorage } from './episode/index.js'
import { memoryCliExtractor, runClaudeCliPrompt } from './io.js'
import { addressingCliExtractor } from './addressing-extractor.js'
import {
  addressingManager,
  buildAddressingPolicySection,
  hasAddressingIntentCue,
  isAddressingDescription,
  isAddressingNoiseText,
} from './addressing-manager.js'
import { communicationPreferenceManager } from './communication-preferences.js'
import { normalizeCommunicationStylePreference } from './communication-style-normalizer.js'
import { memoryTraceLogger, readTrace } from './types.js'
import type { InjectedMemorySection, MemoryScene } from './types.js'

interface RetrieveParams {
  skillId: string
  query: string
  scene?: MemoryScene
  tokenBudget?: number
  maxResults?: number
  sessionId?: string
}

interface RetrieveResult {
  sections: InjectedMemorySection[]
  context: string
  usedTokens: number
}

export interface ExtractAndUpsertParams {
  sessionId: string
  skillId: string
  userQuery: string
  assistantResponse: string
}

interface MemoryPatch {
  target: 'profile' | 'global_memory' | 'skill_memory'
  op: 'upsert'
  section: string
  key: string
  value: string
  confidence: number
  evidence: string
  provisional: boolean
  source: ExtractedFact['source']
  intent?: ExtractedFact['intent']
}

export interface UpsertResult {
  written: {
    cells: number
    profile: number
    longTerm: number
    episodes: number
  }
  conflicts: Array<{
    target: string
    key: string
    strategy: 'keep_old' | 'use_new' | 'merge'
    oldValue: string
    newValue: string
    mergedValue?: string
    reason: string
  }>
  extractionMethod: 'cli' | 'regex'
}

interface LongTermUpsertStats {
  autoWritten: number
  candidateQueued: number
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2.5)
}

function sectionScore(category: InjectedMemorySection['category']): number {
  if (category === 'fixed') return 1
  if (category === 'high') return 0.8
  if (category === 'similar') return 0.6
  return 0.4
}

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeFactKey(content: string): string {
  return content
    .replace(/^(我(喜欢|习惯|偏好|倾向|是|在|用|需要|想|正在))/, '')
    .replace(/^(用户(喜欢|习惯|偏好|倾向|需要|希望))/, '')
    .replace(/^I\s+(prefer|like|enjoy|love|use|work with|work on|am using|am|have been|was)\s+/i, '')
    .trim()
    .slice(0, 30) || content.slice(0, 20)
}

const PIPELINE_NOISE_PATTERNS = [
  /执行上下文/,
  /当前步骤[:：]/,
  /前序步骤结果/,
  /输入参数/,
  /\{\{\s*input\./,
  /\*\*步骤\s*\d+\*\*/,
]

const TRANSIENT_FACT_PATTERNS = [
  /尚未确认|待确认|暂未明确/,
  /稍后再定|后续再说|先这样/,
  /需要先确认|需要等.*继续/,
  /请确认后|等待.*确认/,
]

const ASSISTANT_NOISE_PATTERNS = [
  /让我(继续|开始)/,
  /执行完成|已生成|采集完成/,
  /工具调用记录|LABORANY_ACTION/,
]

const SYSTEM_PATH_PATTERNS = [
  /[A-Za-z]:\\[^\s]+/,
  /\/(Users|home|var|tmp|etc)\//,
  /^(?:\$|>|PS>?)?\s*(?:cmd|powershell|bash|npm|pnpm|python|node|git)\b/i,
  /\b(?:origin\/master|origin\/main|feature\/[\w-]+)\b/i,
]

const ASSISTANT_TONE_PATTERNS = [
  /建议(你|先|可以)/,
  /让我(先|来|继续|处理)/,
  /我(可以|会|已|已经|正在)/,
  /工具(调用|执行|结果)/,
  /已(完成|处理|提交|修复)/,
]

const META_ADDRESSING_NOISE_PATTERNS = [
  /(?:用户|我).{0,8}(?:称呼|叫|喊|称作|叫做).{0,8}(?:助手|你|AI|机器人).{0,6}(?:为|成|叫)?(?:老板|老大|哥|姐)/,
  /(?:助手|你).{0,8}(?:被|让).{0,8}(?:称呼|叫|喊|称作|叫做).{0,6}(?:老板|老大|哥|姐)/,
  /(?:call|address).{0,12}(?:assistant|ai).{0,8}(?:boss|sir|bro)/i,
  /^\s*(?:老板好|老板您好|好的老板|收到老板)\s*$/,
]

const ADDRESSING_ONLY_PATTERNS = [
  /^\s*(?:\u8001\u677f(?:\u597d|\u60a8\u597d)?|(?:\u597d\u7684|\u6536\u5230)\u8001\u677f)\s*$/,
  /(?:\u79f0\u547c|\u53eb).{0,8}(?:\u8001\u677f|boss|sir|bro)/i,
  /(?:\u7528\u6237|user).{0,10}(?:\u79f0\u547c|\u53eb).{0,10}(?:\u8001\u677f|boss|sir|bro)/i,
  /^(?:hi|hello)\s*(?:boss|sir|bro)$/i,
]

const USER_CENTRIC_PATTERNS = [
  /用户(喜欢|偏好|习惯|希望|需要|常用|正在|是|要求|倾向)/,
  /我(喜欢|偏好|习惯|希望|需要|常用|正在|是|要求|倾向)/,
  /请叫我|称呼我|叫我|对我使用|回复风格|沟通风格|项目名称|工作目录|目标分支|提交的文件|技术栈/,
  /偏好|习惯|默认|长期|以后|后续|优先|尽量|常用|惯用|先给结论|简洁|详细|中文|英文/,
]

const GLOBAL_STABLE_PATTERNS = [
  /偏好|习惯|默认|必须|不要|请使用|沟通风格|称呼/,
]

const EPHEMERAL_TASK_PATTERNS = [
  /(?:请|帮我|需要|想要|希望|让我).{0,18}(?:调研|分析|生成|编写|写|制作|整理|修复|排查|对比|实现|测试|review|研究|设计|看看|看一下|汇总|总结)/,
  /(?:用户|我).{0,10}(?:需要|想要|希望).{0,18}(?:调研|分析|生成|编写|写|制作|整理|修复|排查|对比|实现|测试|review|研究|设计|汇总|总结)/,
  /(?:返回|输出).{0,10}(?:特定字符串|固定文本)/,
  /只回复/,
  /(?:source|参数).{0,8}测试/i,
  /(?:e2e|回归|联调|验收|冒烟)测试/i,
]

const STABLE_PREFERENCE_PATTERNS = [
  /以后|后续|默认|长期|一直|平时|通常|总是|尽量|优先|请叫我|称呼我|叫我/,
  /偏好|习惯|惯用|常用|沟通风格|回复风格|先给结论|简洁|详细|中文|英文/,
]

const STABLE_PERSONAL_INFO_PATTERNS = [
  /我叫|名字是|英文名|角色是|职业是|职位是|公司是|团队是/,
  /技术栈|常用(?:语言|框架|工具)|习惯用(?:语言|框架|工具)|主要使用/,
  /工作目录|默认目录|目标分支|默认分支|项目名称|仓库地址/,
]

const STRUCTURED_NOISE_PATTERNS = [
  /```/,
  /^\s*[\[{].*[\]}]\s*$/,
  /\{\{[^}]+\}\}/,
  /https?:\/\//i,
  /<\/?[a-z][^>]*>/i,
]

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripPipelineScaffold(text: string): string {
  let cleaned = normalizeWhitespace(text)
  if (!cleaned) return cleaned

  if (cleaned.includes('## 执行上下文')) {
    const segments = cleaned
      .split(/\n-{3,}\n/)
      .map(item => item.trim())
      .filter(Boolean)
    if (segments.length > 0) {
      cleaned = segments[segments.length - 1]
    }
  }

  const lines = cleaned
    .split('\n')
    .filter(line => {
      const normalized = line.trim()
      if (!normalized) return true
      return !PIPELINE_NOISE_PATTERNS.some(pattern => pattern.test(normalized))
    })

  return normalizeWhitespace(lines.join('\n'))
}

function stripNoiseLines(text: string): string {
  const lines = normalizeWhitespace(text)
    .split('\n')
    .map(line => line.trimEnd())

  const kept: string[] = []
  for (const line of lines) {
    const normalized = line.trim()
    if (!normalized) {
      kept.push('')
      continue
    }

    if (includesAny(normalized, SYSTEM_PATH_PATTERNS)) continue
    if (includesAny(normalized, PIPELINE_NOISE_PATTERNS)) continue
    if (includesAny(normalized, STRUCTURED_NOISE_PATTERNS)) continue
    kept.push(line)
  }

  return normalizeWhitespace(kept.join('\n'))
}

function clip(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}...`
}

function canonicalizeFact(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s，。,.!?！？“”"'‘’（）()\[\]{}<>-]/g, '')
    .slice(0, 120)
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text))
}

function tokenizeForSimilarity(text: string): string[] {
  const segments = text
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2)

  const tokens = new Set<string>()
  for (const segment of segments) {
    if (/^[\u4e00-\u9fa5]+$/.test(segment)) {
      if (segment.length === 2) {
        tokens.add(segment)
        continue
      }
      for (let index = 0; index < segment.length - 1; index += 1) {
        tokens.add(segment.slice(index, index + 2))
      }
      continue
    }
    tokens.add(segment)
  }

  return [...tokens]
}

function textSimilarity(a: string, b: string): number {
  const na = canonicalizeFact(a)
  const nb = canonicalizeFact(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.86

  const as = new Set(tokenizeForSimilarity(a))
  const bs = new Set(tokenizeForSimilarity(b))
  if (as.size === 0 || bs.size === 0) return 0

  let intersect = 0
  for (const token of as) {
    if (bs.has(token)) intersect += 1
  }
  return intersect / new Set([...as, ...bs]).size
}

function pickScene(_query: string, scene?: MemoryScene): MemoryScene {
  if (scene) return scene
  return 'general_qa'
}

export class MemoryOrchestrator {
  private readonly policyVersion = 'v5-longterm-index'

  private bumpReasonCount(reasonCounts: Record<string, number>, key: string): void {
    reasonCounts[key] = (reasonCounts[key] || 0) + 1
  }

  private buildNoDecisionReasonCounts(params: {
    extractionMethod: 'cli' | 'regex'
    rawFactCount: number
    filteredFactCount: number
    profilePatches: MemoryPatch[]
    longTermStats: LongTermUpsertStats
    summary: string
  }): Record<string, number> {
    const reasonCounts: Record<string, number> = {}

    if (params.extractionMethod === 'regex') {
      this.bumpReasonCount(reasonCounts, 'cli_fallback_regex')
    }
    if (params.rawFactCount === 0) {
      this.bumpReasonCount(reasonCounts, 'facts_empty_raw')
    }
    if (params.filteredFactCount === 0) {
      this.bumpReasonCount(reasonCounts, 'facts_empty_filtered')
    }
    if (!params.summary.trim()) {
      this.bumpReasonCount(reasonCounts, 'summary_empty')
    }
    if (params.filteredFactCount > 0 && params.profilePatches.length === 0) {
      this.bumpReasonCount(reasonCounts, 'profile_patch_empty')
    }

    const qualified = params.profilePatches.filter(item => !item.provisional && item.source === 'user')
    if (params.profilePatches.length > 0 && qualified.length === 0) {
      this.bumpReasonCount(reasonCounts, 'no_user_qualified_patch')
    }
    if (qualified.length > 0 && params.longTermStats.autoWritten === 0 && params.longTermStats.candidateQueued === 0) {
      this.bumpReasonCount(reasonCounts, 'longterm_score_or_evidence_insufficient')
    }

    if (Object.keys(reasonCounts).length === 0) {
      this.bumpReasonCount(reasonCounts, 'no_longterm_decision')
    }

    return reasonCounts
  }

  private sanitizeUserQueryForMemory(userQuery: string): string {
    const cleaned = stripNoiseLines(stripPipelineScaffold(userQuery))
    return clip(cleaned, 1200)
  }

  private sanitizeAssistantResponseForMemory(assistantResponse: string): string {
    const cleaned = stripNoiseLines(stripPipelineScaffold(assistantResponse))
    return clip(cleaned, 2400)
  }

  private sanitizeSummary(summary: string, fallback: string): string {
    const base = stripNoiseLines(stripPipelineScaffold(summary || fallback))
    return clip(base, 320)
  }

  private isAddressingPreferenceFact(content: string): boolean {
    if (isAddressingDescription(content)) return true
    if (!hasAddressingIntentCue(content)) return false
    return !this.isAddressingNoise(content)
  }

  private isUserCentricFact(content: string): boolean {
    if (this.isAddressingPreferenceFact(content)) return true
    return includesAny(content, USER_CENTRIC_PATTERNS)
  }

  private isAddressingNoise(content: string): boolean {
    if (isAddressingDescription(content)) return false
    return isAddressingNoiseText(content)
      || includesAny(content, META_ADDRESSING_NOISE_PATTERNS)
      || includesAny(content, ADDRESSING_ONLY_PATTERNS)
  }

  private isEphemeralTaskFact(content: string): boolean {
    if (this.isAddressingPreferenceFact(content)) return false
    return includesAny(content, EPHEMERAL_TASK_PATTERNS)
  }

  private isStablePreferenceFact(content: string): boolean {
    if (this.isAddressingPreferenceFact(content)) return true
    if (this.isEphemeralTaskFact(content)) return false
    return includesAny(content, STABLE_PREFERENCE_PATTERNS)
  }

  private isStablePersonalInfoFact(content: string): boolean {
    if (this.isEphemeralTaskFact(content)) return false
    return includesAny(content, STABLE_PERSONAL_INFO_PATTERNS)
  }

  private isStableFact(content: string): boolean {
    if (this.isAddressingPreferenceFact(content)) return true
    if (includesAny(content, PIPELINE_NOISE_PATTERNS)) return false
    if (includesAny(content, TRANSIENT_FACT_PATTERNS)) return false
    if (includesAny(content, ASSISTANT_NOISE_PATTERNS)) return false
    if (this.isAddressingNoise(content)) return false
    if (includesAny(content, STRUCTURED_NOISE_PATTERNS)) return false
    if (includesAny(content, SYSTEM_PATH_PATTERNS)) return false
    if (content.length < 4) return false
    return true
  }

  private normalizeFactSource(fact: ExtractedFact): ExtractedFact['source'] {
    if (this.isAddressingPreferenceFact(fact.content)) return 'user'
    if (this.isAddressingNoise(fact.content)) return 'assistant'
    if (includesAny(fact.content, ASSISTANT_TONE_PATTERNS)) return 'assistant'
    if (this.isUserCentricFact(fact.content)) return 'user'
    return fact.source || 'user'
  }

  private shouldCreateProfilePatch(fact: ExtractedFact): boolean {
    const content = normalizeWhitespace(fact.content)
    if (!content) return false
    if (fact.source !== 'user') return false
    if (!this.isStableFact(content)) return false
    if (!this.isUserCentricFact(content)) return false
    if (this.isEphemeralTaskFact(content)) return false

    if (this.isAddressingPreferenceFact(content)) return true
    if (fact.intent === 'response_style') return true
    if (fact.type === 'preference' || fact.type === 'correction') return true
    if (fact.type === 'fact') return this.isStablePersonalInfoFact(content) || this.isStablePreferenceFact(content)
    if (fact.type === 'context') return this.isStablePreferenceFact(content) || this.isStablePersonalInfoFact(content)
    return false
  }

  private findSimilarProfileField<T extends { key: string; description: string }>(
    fields: T[],
    value: string,
  ): T | undefined {
    const normalizedValue = normalizeWhitespace(value)
    if (!normalizedValue) return undefined

    let best: T | undefined
    let bestScore = 0

    for (const field of fields) {
      const score = textSimilarity(field.description, normalizedValue)
      if (score > bestScore) {
        bestScore = score
        best = field
      }
    }

    return bestScore >= 0.78 ? best : undefined
  }

  private filterFacts(facts: ExtractedFact[]): ExtractedFact[] {
    const cleaned: ExtractedFact[] = []

    for (const fact of facts) {
      const content = normalizeWhitespace(fact.content)
      if (!content) continue
      if (!this.isStableFact(content)) continue

      if ((fact.type === 'fact' || fact.type === 'context') && !this.isUserCentricFact(content)) {
        continue
      }

      cleaned.push({
        ...fact,
        content: clip(content, 260),
        confidence: Math.max(0.5, Math.min(1, fact.confidence)),
        source: this.normalizeFactSource(fact),
        intent: fact.intent || fact.type,
      })
    }

    const dedup = new Map<string, ExtractedFact>()
    for (const fact of cleaned) {
      const key = canonicalizeFact(fact.content)
      const existing = dedup.get(key)
      if (!existing || fact.confidence > existing.confidence) {
        dedup.set(key, fact)
      }
    }

    return Array.from(dedup.values()).sort((a, b) => b.confidence - a.confidence)
  }

  private classifyProfileSection(fact: ExtractedFact): string {
    const content = fact.content

    if (this.isAddressingPreferenceFact(content)) {
      return '沟通风格'
    }

    if (/(回复|语气|沟通表达|中文|英文|称呼|简洁|详细)/.test(content)) {
      return '沟通风格'
    }

    if (/(python|typescript|javascript|java|go|rust|react|vue|node|docker|sql|postgres|mysql|技术栈|框架|工具链)/i.test(content)) {
      return '技术栈'
    }

    if (/(身份|职业|项目名称|工作目录|目标分支|仓库|提交|文件)/.test(content)) {
      return '个人信息'
    }

    return '工作偏好'
  }

  private shouldUseLLMProfileClassifier(fact: ExtractedFact, section: string): boolean {
    if (!profileLLMClassifier.isAvailable()) return false
    if (this.isAddressingPreferenceFact(fact.content)) return false
    if (this.isEphemeralTaskFact(fact.content)) return true
    if (!this.isUserCentricFact(fact.content)) return false
    if (section === '工作偏好' || section === '技术栈' || section === '个人信息') {
      return fact.content.trim().length >= 6
    }
    return fact.content.trim().length >= 10
  }

  private shouldAppendGlobalDaily(facts: ExtractedFact[]): boolean {
    return facts.some(fact =>
      fact.confidence >= 0.9
      && (fact.type === 'preference' || fact.type === 'correction')
      && this.isUserCentricFact(fact.content)
      && this.isStableFact(fact.content)
    )
  }

  private shouldPromoteToLongTerm(description: string): boolean {
    if (!this.isStableFact(description)) return false
    if (this.isEphemeralTaskFact(description)) return false
    if (/今天|今日|本次|当前|刚刚|稍后|202\d-\d{2}-\d{2}/.test(description)) return false
    return true
  }

  private shouldPromoteToGlobal(section: string, description: string): boolean {
    if (!this.shouldPromoteToLongTerm(description)) return false
    if (section !== '工作偏好' && section !== '沟通风格') return false
    return includesAny(description, GLOBAL_STABLE_PATTERNS)
  }

  private shouldAutoWriteSkillLongTerm(description: string, confidence: number, evidenceCount: number, factType?: string): boolean {
    if (!this.shouldPromoteToLongTerm(description)) return false
    // Fast-track preferences: lower threshold
    if (factType === 'preference' && confidence >= 0.75 && evidenceCount >= 1) return true
    if (confidence < 0.88) return false
    if (evidenceCount < 2) return false
    if (description.length > 220) return false
    return true
  }

  private shouldQueueSkillLongTerm(description: string, confidence: number, evidenceCount: number, factType?: string): boolean {
    if (!this.shouldPromoteToLongTerm(description)) return false
    // Fast-track preferences: lower threshold
    if (factType === 'preference' && confidence >= 0.65) return true
    if (confidence < 0.72 && evidenceCount < 2) return false
    if (description.length > 220) return false
    return true
  }

  private shouldAutoWriteGlobalLongTerm(
    section: string,
    description: string,
    confidence: number,
    evidenceCount: number,
  ): boolean {
    if (!this.shouldPromoteToGlobal(section, description)) return false
    if (confidence < 0.9) return false
    if (evidenceCount < 3) return false
    if (description.length > 200) return false
    return true
  }

  private shouldFastTrackGlobalLongTerm(
    patch: MemoryPatch,
    description: string,
    confidence: number,
    evidenceCount: number,
    skillLongTermWritten: boolean,
  ): boolean {
    if (!skillLongTermWritten) return false
    if (!this.shouldPromoteToGlobal(patch.section, description)) return false
    if (patch.section !== '沟通风格') return false
    if (patch.intent !== 'response_style' && !this.isAddressingPreferenceFact(description)) return false
    if (confidence < 0.9) return false
    if (evidenceCount < 2) return false
    if (description.length > 200) return false
    return true
  }

  private shouldQueueGlobalLongTerm(
    section: string,
    description: string,
    confidence: number,
    evidenceCount: number,
  ): boolean {
    if (!this.shouldPromoteToGlobal(section, description)) return false
    if (confidence < 0.78 && evidenceCount < 2) return false
    if (description.length > 200) return false
    return true
  }

  private isFactSeenAcrossSkills(description: string): boolean {
    const recentCells = memCellStorage.listRecent(7)
    const skillIds = new Set<string>()
    const normalized = description.toLowerCase().slice(0, 50)
    for (const cell of recentCells) {
      if (cell.summary?.toLowerCase().includes(normalized) ||
          cell.facts?.some(f => f.content.toLowerCase().includes(normalized))) {
        skillIds.add(cell.skillId)
      }
    }
    return skillIds.size >= 2
  }

  private computeLongTermScore(params: {
    section: string
    description: string
    confidence: number
    evidenceCount: number
    isGlobal: boolean
  }): number {
    const { section, description, confidence, evidenceCount, isGlobal } = params

    let score = 0
    score += Math.min(1, confidence) * 0.45
    score += Math.min(1, evidenceCount / (isGlobal ? 4 : 3)) * 0.25
    if (this.isStableFact(description)) score += 0.15
    if (this.isUserCentricFact(description)) score += 0.10
    if (this.shouldPromoteToLongTerm(description)) score += 0.05

    if (this.isAddressingNoise(description)) score -= 0.5
    if (includesAny(description, TRANSIENT_FACT_PATTERNS)) score -= 0.2
    if (section === '工作偏好' || section === '沟通风格') score += 0.05
    if (description.length < 10) score -= 0.08
    if (this.isFactSeenAcrossSkills(description)) score += 0.12

    return Math.max(0, Math.min(1, score))
  }

  private buildFixedSections(skillId: string): InjectedMemorySection[] {
    const sections: InjectedMemorySection[] = []

    const addressingPolicy = buildAddressingPolicySection()
    sections.push({
      title: addressingPolicy.title,
      content: addressingPolicy.content,
      source: 'memory/policy/addressing',
      category: 'fixed',
      score: sectionScore('fixed'),
      tokens: estimateTokens(addressingPolicy.content),
    })

    const addressing = addressingManager.buildPromptSection()
    if (addressing) {
      sections.push({
        title: addressing.title,
        content: addressing.content,
        source: 'memory/profiles/addressing.json',
        category: 'fixed',
        score: sectionScore('fixed'),
        tokens: estimateTokens(addressing.content),
      })
    }

    const communicationPreferences = communicationPreferenceManager.buildPromptSection()
    if (communicationPreferences) {
      sections.push({
        title: communicationPreferences.title,
        content: communicationPreferences.content,
        source: 'memory/profiles/communication-preferences.json',
        category: 'fixed',
        score: sectionScore('fixed'),
        tokens: estimateTokens(communicationPreferences.content),
      })
    }

    const bossMd = memoryFileManager.readBossMd()
    if (bossMd) {
      sections.push({
        title: '老板工作手册',
        content: bossMd,
        source: 'BOSS.md',
        category: 'fixed',
        score: sectionScore('fixed'),
        tokens: estimateTokens(bossMd),
      })
    }

    const profile = profileManager.getSummary()
    if (profile.trim()) {
      sections.push({
        title: '用户画像',
        content: profile,
        source: 'memory/profiles/PROFILE.md',
        category: 'fixed',
        score: sectionScore('fixed'),
        tokens: estimateTokens(profile),
      })
    }

    const globalMemory = memoryFileManager.readGlobalMemory()
    if (globalMemory) {
      sections.push({
        title: '全局长期记忆',
        content: globalMemory,
        source: 'MEMORY.md',
        category: 'high',
        score: sectionScore('high'),
        tokens: estimateTokens(globalMemory),
      })
    }

    const skillMemory = memoryFileManager.readSkillMemory(skillId)
    if (skillMemory) {
      sections.push({
        title: '当前技能长期记忆',
        content: skillMemory,
        source: `memory/skills/${skillId}/MEMORY.md`,
        category: 'high',
        score: sectionScore('high'),
        tokens: estimateTokens(skillMemory),
      })
    }

    const skillEvolution = memoryFileManager.readSkillEvolution(skillId)
    if (skillEvolution?.trim()) {
      sections.push({
        title: '技能进化记忆',
        content: skillEvolution,
        source: `memory/skills/${skillId}/evolution.md`,
        category: 'high',
        score: sectionScore('high'),
        tokens: estimateTokens(skillEvolution),
      })
    }

    return sections
  }

  private buildRecentSections(skillId: string): InjectedMemorySection[] {
    const sections: InjectedMemorySection[] = []

    const recentGlobal = memoryFileManager.readRecentDaily({ scope: 'global', days: 2 })
    if (recentGlobal.trim()) {
      sections.push({
        title: '最近全局记忆',
        content: recentGlobal,
        source: 'memory/global',
        category: 'recent',
        score: sectionScore('recent'),
        tokens: estimateTokens(recentGlobal),
      })
    }

    const recentSkill = memoryFileManager.readRecentDaily({ scope: 'skill', skillId, days: 2 })
    if (recentSkill.trim()) {
      sections.push({
        title: '当前技能最近记忆',
        content: recentSkill,
        source: `memory/skills/${skillId}`,
        category: 'recent',
        score: sectionScore('recent'),
        tokens: estimateTokens(recentSkill),
      })
    }

    const todayEvolution = memoryFileManager.readSkillEvolutionRecent(skillId, 1)
    if (todayEvolution?.trim()) {
      sections.push({
        title: '今日技能新洞察',
        content: todayEvolution,
        source: `memory/skills/${skillId}/evolution-daily`,
        category: 'recent',
        score: sectionScore('recent') + 0.05,
        tokens: estimateTokens(todayEvolution),
      })
    }

    return sections
  }

  private buildSimilarSections(skillId: string, query: string, maxResults: number): InjectedMemorySection[] {
    if (!query.trim()) return []
    const results = memorySearch.search({
      query,
      scope: 'all',
      skillId,
      maxResults,
      strategy: 'hybrid',
    })

    return results.map((item, index) => {
      const recencyBoost = item.path.includes(new Date().toISOString().split('T')[0]) ? 0.15 : 0
      const scopeWeight = item.path.includes(`memory${process.platform === 'win32' ? '\\' : '/'}skills${process.platform === 'win32' ? '\\' : '/'}${skillId}`)
        ? 0.85
        : 0.7
      const score = 0.45 * item.score + 0.25 * recencyBoost + 0.20 * scopeWeight + 0.10 * 0.75

      return {
        title: `相关记忆 #${index + 1}`,
        content: item.snippet,
        source: item.path,
        category: 'similar' as const,
        score,
        tokens: estimateTokens(item.snippet),
      }
    })
  }

  private trimSection(section: InjectedMemorySection, maxTokens: number): InjectedMemorySection {
    if (section.tokens <= maxTokens) return section
    const maxChars = Math.max(100, Math.floor(maxTokens * 2.5))
    const content = section.content.slice(0, maxChars)
    return {
      ...section,
      content,
      tokens: estimateTokens(content),
    }
  }

  private allocateSections(
    fixedAndHigh: InjectedMemorySection[],
    similar: InjectedMemorySection[],
    recent: InjectedMemorySection[],
    tokenBudget: number
  ): RetrieveResult {
    const buckets = {
      fixed: Math.floor(tokenBudget * 0.3),
      high: Math.floor(tokenBudget * 0.4),
      similar: Math.floor(tokenBudget * 0.2),
      recent: Math.floor(tokenBudget * 0.1),
    }

    const fixed = fixedAndHigh.filter(item => item.category === 'fixed')
    const high = fixedAndHigh.filter(item => item.category === 'high')

    const selected: InjectedMemorySection[] = []
    let fixedUsed = 0
    for (const item of fixed) {
      const available = Math.max(60, buckets.fixed - fixedUsed)
      const trimmed = this.trimSection(item, available)
      selected.push(trimmed)
      fixedUsed += trimmed.tokens
    }

    let highUsed = 0
    for (const item of high) {
      if (highUsed >= buckets.high) break
      const available = Math.max(60, buckets.high - highUsed)
      const trimmed = this.trimSection(item, available)
      selected.push(trimmed)
      highUsed += trimmed.tokens
    }

    let similarUsed = 0
    for (const item of similar.sort((a, b) => b.score - a.score)) {
      if (similarUsed >= buckets.similar) break
      if (selected.some(existing => existing.content.slice(0, 80) === item.content.slice(0, 80))) {
        continue
      }
      const available = Math.max(50, buckets.similar - similarUsed)
      const trimmed = this.trimSection(item, available)
      selected.push(trimmed)
      similarUsed += trimmed.tokens
    }

    let recentUsed = 0
    for (const item of recent) {
      if (recentUsed >= buckets.recent) break
      const available = Math.max(50, buckets.recent - recentUsed)
      const trimmed = this.trimSection(item, available)
      selected.push(trimmed)
      recentUsed += trimmed.tokens
    }

    const context = selected
      .map(item => `## ${item.title}\n\n${item.content}`)
      .join('\n\n---\n\n')
    const usedTokens = selected.reduce((sum, item) => sum + item.tokens, 0)

    return { sections: selected, context, usedTokens }
  }

  retrieve(params: RetrieveParams): RetrieveResult {
    const {
      skillId,
      query,
      scene,
      tokenBudget = 4000,
      maxResults = 8,
      sessionId = 'adhoc',
    } = params
    const resolvedScene = pickScene(query, scene)

    const fixedAndHigh = this.buildFixedSections(skillId)
    const similar = this.buildSimilarSections(skillId, query, maxResults)
    const recent = this.buildRecentSections(skillId)

    const result = this.allocateSections(fixedAndHigh, similar, recent, tokenBudget)

    memoryTraceLogger.log({
      at: nowIso(),
      stage: 'retrieve',
      sessionId,
      payload: {
        scene: resolvedScene,
        query,
        tokenBudget,
        usedTokens: result.usedTokens,
        sections: result.sections.map(item => ({
          title: item.title,
          source: item.source,
          category: item.category,
          score: item.score,
          tokens: item.tokens,
        })),
      },
    })

    return result
  }

  private async classifyFactPatch(fact: ExtractedFact, evidence: string): Promise<MemoryPatch> {
    let section = this.classifyProfileSection(fact)
    let key = normalizeFactKey(fact.content)
    let value = fact.content
    let confidence = fact.confidence

    if (this.shouldUseLLMProfileClassifier(fact, section)) {
      try {
        const classified = await profileLLMClassifier.classify(fact)
        section = classified.section || section
        key = classified.key || key
        value = classified.description || value
        if (!classified.shouldUpdate) {
          confidence = Math.min(confidence, 0.59)
        }
      } catch (error) {
        console.warn('[Memory] Profile classify failed, using fallback', error)
      }
    }

    const normalizedCommunicationStyle = normalizeCommunicationStylePreference(fact.content)
      || normalizeCommunicationStylePreference(value)
    if (normalizedCommunicationStyle) {
      section = '沟通风格'
      key = normalizedCommunicationStyle.key
      value = normalizedCommunicationStyle.description
      confidence = Math.max(confidence, Math.min(0.96, fact.confidence))
    }

    return {
      target: 'profile',
      op: 'upsert',
      section,
      key,
      value,
      confidence,
      evidence,
      provisional: confidence < 0.8,
      source: fact.source,
      intent: fact.intent,
    }
  }

  private scoreProfileConflict(oldField: { evidences: string[] }, confidence: number): number {
    const evidenceCount = oldField.evidences.length
    return Math.min(1, 0.3 * Math.min(1, evidenceCount / 3) + 0.7 * confidence)
  }

  private async upsertProfilePatches(patches: MemoryPatch[]): Promise<UpsertResult['conflicts']> {
    const conflicts: UpsertResult['conflicts'] = []

    for (const patch of patches) {
      const section = patch.section || '工作偏好'
      const managedResult = communicationPreferenceManager.applyProfilePatch({
        section,
        key: patch.key,
        value: patch.value,
        evidence: patch.evidence,
        confidence: patch.confidence,
      })
      if (managedResult.handled) {
        if (managedResult.conflict) {
          conflicts.push({
            target: 'profile',
            key: patch.key,
            strategy: managedResult.conflict.strategy,
            oldValue: managedResult.conflict.oldValue,
            newValue: managedResult.conflict.newValue,
            reason: managedResult.conflict.reason,
          })
        }
        continue
      }

      const existingFields = profileManager.getSection(section)
      const matchedField = existingFields.find(field => field.key === patch.key)
        || this.findSimilarProfileField(existingFields, patch.value)
      const resolvedKey = matchedField?.key || patch.key
      const existing = matchedField

      if (!existing) {
        profileManager.updateField(section, resolvedKey, patch.value, patch.evidence, patch.confidence)
        continue
      }

      if (existing.description === patch.value) {
        profileManager.updateField(section, resolvedKey, patch.value, patch.evidence, patch.confidence)
        continue
      }

      if (profileLLMClassifier.isAvailable()) {
        try {
          const resolved = await profileLLMClassifier.resolveConflict(
            existing.description,
            patch.value,
            existing.evidences,
            patch.evidence,
          )

          if (resolved.resolution === 'keep_old') {
            profileManager.updateField(section, resolvedKey, existing.description, patch.evidence, patch.confidence)
            conflicts.push({
              target: 'profile',
              key: resolvedKey,
              strategy: 'keep_old',
              oldValue: existing.description,
              newValue: patch.value,
              reason: resolved.reason,
            })
            continue
          }

          if (resolved.resolution === 'merge') {
            const mergedValue = (resolved.mergedValue || `${existing.description} / ${patch.value}`).trim()
            profileManager.updateField(section, resolvedKey, mergedValue, patch.evidence, patch.confidence)
            conflicts.push({
              target: 'profile',
              key: resolvedKey,
              strategy: 'merge',
              oldValue: existing.description,
              newValue: patch.value,
              mergedValue,
              reason: resolved.reason,
            })
            continue
          }

          profileManager.updateField(section, resolvedKey, patch.value, patch.evidence, patch.confidence)
          conflicts.push({
            target: 'profile',
            key: resolvedKey,
            strategy: 'use_new',
            oldValue: existing.description,
            newValue: patch.value,
            reason: resolved.reason,
          })
          continue
        } catch (error) {
          console.warn('[Memory] Profile conflict resolution fallback', error)
        }
      }

      const oldScore = this.scoreProfileConflict(existing, 0.75)
      const newScore = this.scoreProfileConflict(existing, patch.confidence)

      if (newScore > oldScore + 0.08) {
        profileManager.updateField(section, resolvedKey, patch.value, patch.evidence, patch.confidence)
        conflicts.push({
          target: 'profile',
          key: resolvedKey,
          strategy: 'use_new',
          oldValue: existing.description,
          newValue: patch.value,
          reason: '新证据评分更高',
        })
      } else if (Math.abs(newScore - oldScore) <= 0.08) {
        const merged = `${existing.description} / ${patch.value}`
        profileManager.updateField(section, resolvedKey, merged, patch.evidence, patch.confidence)
        conflicts.push({
          target: 'profile',
          key: resolvedKey,
          strategy: 'merge',
          oldValue: existing.description,
          newValue: patch.value,
          mergedValue: merged,
          reason: '新旧证据评分接近，执行合并',
        })
      } else {
        profileManager.updateField(section, resolvedKey, existing.description, patch.evidence, patch.confidence)
        conflicts.push({
          target: 'profile',
          key: resolvedKey,
          strategy: 'keep_old',
          oldValue: existing.description,
          newValue: patch.value,
          reason: '旧证据评分更高',
        })
      }
    }

    return conflicts
  }

  private logLongTermCandidateError(params: {
    sessionId: string
    skillId: string
    scope: 'global' | 'skill'
    category: string
    statement: string
    error: unknown
  }): void {
    const message = params.error instanceof Error ? params.error.message : String(params.error)
    console.error(
      `[MemoryLongTerm] enqueue candidate failed: session=${params.sessionId} skill=${params.skillId} scope=${params.scope} category=${params.category}`,
      params.error,
    )
    memoryTraceLogger.log({
      at: nowIso(),
      stage: 'longterm_error',
      sessionId: params.sessionId,
      payload: {
        skillId: params.skillId,
        scope: params.scope,
        category: params.category,
        statement: clip(params.statement, 240),
        reason: message,
      },
    })
  }

  private upsertLongTermMemory(sessionId: string, skillId: string, patches: MemoryPatch[]): LongTermUpsertStats {
    const qualified = patches.filter(item => !item.provisional && item.source === 'user')
    if (qualified.length === 0) return { autoWritten: 0, candidateQueued: 0 }

    let autoWritten = 0
    let candidateQueued = 0

    for (const patch of qualified) {
      const sectionFields = profileManager.getSection(patch.section)
      const latestField = sectionFields.find(field => field.key === patch.key)
        || this.findSimilarProfileField(sectionFields, patch.value)
      if (!latestField) continue
      if (!this.shouldPromoteToLongTerm(latestField.description)) continue

      const evidenceCount = latestField.evidences.length
      let skillLongTermWritten = false
      const skillScore = this.computeLongTermScore({
        section: patch.section,
        description: latestField.description,
        confidence: patch.confidence,
        evidenceCount,
        isGlobal: false,
      })

      if (skillScore >= 0.82 && this.shouldAutoWriteSkillLongTerm(
        latestField.description,
        patch.confidence,
        evidenceCount,
        patch.intent,
      )) {
        const writeResult = memoryConsolidator.autoUpsertLongTerm({
          scope: 'skill',
          skillId,
          category: patch.section,
          statement: latestField.description,
          confidence: Math.max(patch.confidence, skillScore),
          evidenceCount,
          sourceRefs: latestField.evidences,
          policyVersion: this.policyVersion,
        })
        if (writeResult.written) {
          autoWritten += 1
          skillLongTermWritten = true
        }
      } else if (skillScore >= 0.68 && this.shouldQueueSkillLongTerm(
        latestField.description,
        patch.confidence,
        evidenceCount,
        patch.intent,
      )) {
        try {
          const skillCandidate = memoryConsolidator.enqueueCandidate({
            scope: 'skill',
            skillId,
            category: patch.section,
            content: latestField.description,
            source: latestField.evidences,
            confidence: Math.max(patch.confidence, skillScore),
          })
          if (skillCandidate.isNew) candidateQueued++
        } catch (error) {
          this.logLongTermCandidateError({
            sessionId,
            skillId,
            scope: 'skill',
            category: patch.section,
            statement: latestField.description,
            error,
          })
        }
      }

      if (this.shouldPromoteToGlobal(patch.section, latestField.description)) {
        const globalScore = this.computeLongTermScore({
          section: patch.section,
          description: latestField.description,
          confidence: patch.confidence,
          evidenceCount,
          isGlobal: true,
        })

        const shouldFastTrackGlobal = this.shouldFastTrackGlobalLongTerm(
          patch,
          latestField.description,
          patch.confidence,
          evidenceCount,
          skillLongTermWritten,
        )

        if ((globalScore >= 0.88 && this.shouldAutoWriteGlobalLongTerm(
          patch.section,
          latestField.description,
          patch.confidence,
          evidenceCount,
        )) || (shouldFastTrackGlobal && globalScore >= 0.82)) {
          const writeResult = memoryConsolidator.autoUpsertLongTerm({
            scope: 'global',
            category: patch.section,
            statement: latestField.description,
            confidence: Math.max(patch.confidence, globalScore),
            evidenceCount,
            sourceRefs: latestField.evidences,
            policyVersion: this.policyVersion,
          })
          if (writeResult.written) autoWritten += 1
        } else if (globalScore >= 0.76 && this.shouldQueueGlobalLongTerm(
          patch.section,
          latestField.description,
          patch.confidence,
          evidenceCount,
        )) {
          try {
            const globalCandidate = memoryConsolidator.enqueueCandidate({
              scope: 'global',
              category: patch.section,
              content: latestField.description,
              source: latestField.evidences,
              confidence: Math.max(patch.confidence, globalScore),
            })
            if (globalCandidate.isNew) candidateQueued++
          } catch (error) {
            this.logLongTermCandidateError({
              sessionId,
              skillId,
              scope: 'global',
              category: patch.section,
              statement: latestField.description,
              error,
            })
          }
        }
      }
    }

    return { autoWritten, candidateQueued }
  }

  async extractAndUpsert(params: ExtractAndUpsertParams): Promise<UpsertResult> {
    const { sessionId, skillId, userQuery, assistantResponse } = params
    const memoryUserQuery = this.sanitizeUserQueryForMemory(userQuery)
    const memoryAssistantResponse = this.sanitizeAssistantResponseForMemory(assistantResponse)

    communicationPreferenceManager.applyFromUserText(memoryUserQuery, memoryUserQuery)

    const extraction = await memoryCliExtractor.extract({
      userQuery: memoryUserQuery,
      assistantResponse: memoryAssistantResponse,
    })
    const addressingUpdate = (
      extraction.extractionMethod === 'regex'
      && hasAddressingIntentCue(memoryUserQuery)
    )
      ? await addressingCliExtractor.extract({
          userText: memoryUserQuery,
          currentPreferredName: addressingManager.get().preferredName,
        })
      : extraction.addressingUpdate

    const timestamp = new Date()
    const evidence = `${timestamp.toISOString()}|${sessionId}`
    let addressingApplied = false
    if (addressingUpdate.shouldUpdate && addressingUpdate.preferredName) {
      try {
        addressingManager.setPreferredName(
          addressingUpdate.preferredName,
          'auto',
          `${memoryUserQuery.slice(0, 100)} | ${addressingUpdate.reason}`
        )
        addressingApplied = true
      } catch (error) {
        console.warn('[Memory] Skip invalid addressing update', error)
      }
    }

    const filteredFacts = this.filterFacts(extraction.facts)
    const summary = this.sanitizeSummary(extraction.summary, memoryUserQuery) || clip(memoryUserQuery, 260)

    // Skill Evolution: 提取 skill_insight facts（独立通道，不经过 user-centric 过滤）
    const skillInsights = extraction.facts.filter(f =>
      f.type === 'skill_insight'
      && f.confidence >= 0.6
      && (f.persistence === 'long_term' || f.persistence === 'session')
      && f.content.trim().length >= 10
      && f.content.trim().length <= 300
    )
    if (skillInsights.length > 0) {
      const evolutionContent = skillInsights
        .slice(0, 5)
        .map(f => `- ${f.content.trim()}`)
        .join('\n')
      memoryFileManager.appendSkillEvolutionDaily(skillId, evolutionContent, timestamp)
    }

    // Cross-skill knowledge sharing: detect global-scope insights
    const globalInsights = extraction.facts.filter(f =>
      f.type === 'skill_insight'
      && f.scope === 'global'
      && f.confidence >= 0.7
      && f.persistence === 'long_term'
      && f.content.trim().length >= 10
      && f.content.trim().length <= 300
    )
    if (globalInsights.length > 0) {
      const globalContent = globalInsights
        .slice(0, 3)
        .map(f => `- [来自 ${skillId}] ${f.content.trim()}`)
        .join('\n')
      memoryFileManager.appendToDaily({ scope: 'global', content: `**跨技能洞察**\n${globalContent}` })
    }

    if (!summary && filteredFacts.length === 0) {
      memoryConsolidator.recordNoDecisionSummary({
        scope: 'skill',
        skillId,
        sessionId,
        category: 'no_decision',
        statement: `本轮对话未抽取到可写入长期记忆的信息（session=${sessionId}）`,
        reasonSummary: '摘要与事实均为空，未触发长期记忆决策',
        extractionMethod: extraction.extractionMethod,
        factCount: 0,
        profilePatchCount: 0,
        candidateQueued: 0,
        reasonCounts: {
          summary_and_facts_empty: 1,
          ...(extraction.extractionMethod === 'regex' ? { cli_fallback_regex: 1 } : {}),
        },
        policyVersion: this.policyVersion,
      })
      return {
        written: { cells: 0, profile: 0, longTerm: 0, episodes: 0 },
        conflicts: [],
        extractionMethod: extraction.extractionMethod,
      }
    }

    const cell: MemCell = {
      id: `cell_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp,
      skillId,
      summary,
      messages: [
        { role: 'user', content: memoryUserQuery, timestamp },
        { role: 'assistant', content: memoryAssistantResponse, timestamp },
      ],
      facts: filteredFacts,
    }
    memCellStorage.save(cell)

    const profilePatches: MemoryPatch[] = []
    for (const item of filteredFacts) {
      if (item.confidence < 0.65 || item.source !== 'user') continue
      if (!this.shouldCreateProfilePatch(item)) continue
      if (addressingApplied && this.isAddressingPreferenceFact(item.content)) continue
      const patch = await this.classifyFactPatch(item, evidence)
      if (patch.confidence < 0.6) continue
      if (this.isAddressingNoise(patch.value)) continue
      if (this.isEphemeralTaskFact(patch.value)) continue
      profilePatches.push(patch)
    }

    const conflicts = await this.upsertProfilePatches(profilePatches)

    const userFacts = filteredFacts.filter(item => item.source === 'user')
    const assistantFacts = filteredFacts.filter(item => item.source === 'assistant')
    const eventFacts = filteredFacts.filter(item => item.source === 'event')

    const dailyLines = [
      `**任务记录**`,
      `- 问题：${clip(memoryUserQuery, 260)}`,
      `- 摘要：${summary}`,
    ]
    if (userFacts.length > 0) {
      dailyLines.push(`- 用户事实：${userFacts.map(item => item.content).join('；')}`)
    }
    if (assistantFacts.length > 0) {
      dailyLines.push(`- 助手补充：${assistantFacts.map(item => item.content).join('；')}`)
    }
    if (eventFacts.length > 0) {
      dailyLines.push(`- 事件摘要：${eventFacts.map(item => item.content).join('；')}`)
    }
    const dailyContent = dailyLines.join('\n')
    memoryFileManager.appendToDaily({ scope: 'skill', skillId, content: dailyContent, timestamp })
    if (this.shouldAppendGlobalDaily(filteredFacts)) {
      memoryFileManager.appendToDaily({ scope: 'global', content: dailyContent, timestamp })
    }

    const longTermStats = this.upsertLongTermMemory(sessionId, skillId, profilePatches)

    const episodes = episodeStorage.findByCellId(cell.id)

    const result: UpsertResult = {
      written: {
        cells: 1,
        profile: profilePatches.length,
        longTerm: longTermStats.autoWritten,
        episodes: episodes.length,
      },
      conflicts,
      extractionMethod: extraction.extractionMethod,
    }

    if (longTermStats.autoWritten === 0 && longTermStats.candidateQueued === 0) {
      memoryConsolidator.recordNoDecisionSummary({
        scope: 'skill',
        skillId,
        sessionId,
        category: 'no_decision',
        statement: clip(summary || memoryUserQuery, 220),
        reasonSummary: '本轮已抽取记忆，但未达到长期记忆写入或候选入队条件',
        extractionMethod: extraction.extractionMethod,
        factCount: filteredFacts.length,
        profilePatchCount: profilePatches.length,
        candidateQueued: longTermStats.candidateQueued,
        reasonCounts: this.buildNoDecisionReasonCounts({
          extractionMethod: extraction.extractionMethod,
          rawFactCount: extraction.facts.length,
          filteredFactCount: filteredFacts.length,
          profilePatches,
          longTermStats,
          summary,
        }),
        policyVersion: this.policyVersion,
      })
    }

    memoryTraceLogger.log({
      at: nowIso(),
      stage: 'extract',
      sessionId,
      payload: {
        extractionMethod: extraction.extractionMethod,
        facts: filteredFacts,
        summary,
      },
    })

    memoryTraceLogger.log({
      at: nowIso(),
      stage: 'upsert',
      sessionId,
      payload: {
        policyVersion: this.policyVersion,
        written: result.written,
        candidateQueued: longTermStats.candidateQueued,
        conflicts,
      },
    })

    return result
  }

  async selfIterateSkill(skillId: string): Promise<{ updated: boolean; reason?: string }> {
    const evolution = memoryFileManager.readSkillEvolution(skillId)
    if (!evolution?.trim()) return { updated: false, reason: 'no_evolution' }

    const currentSkill = memoryFileManager.readSkillDefinition(skillId)
    if (!currentSkill) return { updated: false, reason: 'skill_not_found' }

    const prompt = `你是一个 Skill 定义优化器。根据积累的进化记忆，更新 Skill 的定义文件。

规则：
1. 保持 YAML frontmatter 格式不变（name, description, icon, category）
2. 可以优化对话策略、增加新的指导原则、调整工作流程
3. 不要删除核心功能，只做增量优化
4. 如果进化记忆中有明确的方法论改进，融入到工作流程中
5. 如果进化记忆中有用户偏好相关的洞察，融入到对话原则中
6. 保持文件总长度合理（不超过原文的 1.5 倍）
7. 输出完整的 SKILL.md 内容（包含 frontmatter）

当前 SKILL.md：
${currentSkill}

积累的进化记忆：
${evolution}

请输出更新后的完整 SKILL.md 内容：`

    const result = await runClaudeCliPrompt(prompt, 60_000)

    if (!result?.trim()) return { updated: false, reason: 'llm_failed' }
    if (result.length > 15_000) return { updated: false, reason: 'output_too_long' }
    if (!result.includes('---')) return { updated: false, reason: 'invalid_format' }

    memoryFileManager.backupSkillDefinition(skillId)
    memoryFileManager.writeSkillDefinition(skillId, result)
    return { updated: true }
  }

  async compressSkillEvolution(skillId: string): Promise<{ compressed: boolean; reason?: string }> {
    const recentEntries = memoryFileManager.readSkillEvolutionRecent(skillId, 14)
    if (!recentEntries?.trim()) {
      return { compressed: false, reason: 'no_recent_entries' }
    }

    const existingEvolution = memoryFileManager.readSkillEvolution(skillId) || ''

    const prompt = `你是一个记忆管理器。将短期观察压缩为长期认知。

规则：
1. 保留有价值的、可复用的洞察和方法论
2. 删除一次性的、过时的、重复的内容
3. 如果新观察和旧记忆矛盾，用新的替代旧的
4. 多条相似观察压缩为一条更抽象的认知
5. 按主题分组（方法论、领域知识、对话技巧等）
6. 总输出不超过 3000 字符
7. 输出纯 markdown，不要代码块包裹

当前长期记忆：
${existingEvolution || '（空）'}

新增短期观察：
${recentEntries}

请输出更新后的完整长期记忆内容：`

    const result = await runClaudeCliPrompt(prompt, 30_000)

    if (result && result.length <= 3000) {
      memoryFileManager.writeSkillEvolution(skillId, result)
      memoryFileManager.cleanupOldEvolutionDaily(skillId, 14)
      return { compressed: true }
    }

    return { compressed: false, reason: 'compression_failed_or_too_long' }
  }

  readTrace(sessionId: string): string[] {
    return readTrace(sessionId)
  }
}

export const memoryOrchestrator = new MemoryOrchestrator()
