/* 鈺斺晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晽
 * 鈺?                    Memory I/O                                         鈺?
 * 鈺?                                                                       鈺?
 * 鈺? 鍖呭惈锛歁emoryInjector锛堟敞鍏ヤ笂涓嬫枃锛? MemoryCliExtractor锛堟彁鍙栬蹇嗭級     鈺?
 * 鈺氣晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨暆 */

import { spawn } from 'child_process'
import { memoryFileManager } from './file-manager.js'
import { memorySearch } from './search.js'
import { profileManager } from './profile/index.js'
import {
  addressingManager,
  buildAddressingPolicySection,
  extractStrongPreferredName,
  isAddressingNoiseText,
} from './addressing-manager.js'
import {
  communicationPreferenceManager,
  extractStrongCommunicationPreferencePatches,
} from './communication-preferences.js'
import { normalizeCommunicationStylePreference } from './communication-style-normalizer.js'
import { isClaudeCliAvailable } from './cli-runner.js'
import { buildClaudeCliPromptDelivery, buildClaudeEnvConfig, resolveClaudeCliLaunch } from '../claude-cli.js'
import type { ExtractedFact } from './memcell/index.js'
import { refreshRuntimeConfig } from '../runtime-config.js'

/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲
 *  Memory Injector锛堟敞鍏ヨ蹇嗕笂涓嬫枃鍒?prompt锛?
 * 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 */

interface BuildContextParams {
  skillId: string
  userQuery: string
  tokenBudget?: number
}

interface MemorySection {
  title: string
  content: string
  priority: number
  tokens: number
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2.5)
}

export class MemoryInjector {
  private collectSections(skillId: string): MemorySection[] {
    const sections: MemorySection[] = []

    const addressingPolicy = buildAddressingPolicySection()
    sections.push({
      title: addressingPolicy.title,
      content: addressingPolicy.content,
      priority: 0,
      tokens: estimateTokens(addressingPolicy.content),
    })

    const addressing = addressingManager.buildPromptSection()
    if (addressing) {
      sections.push({ title: addressing.title, content: addressing.content, priority: 0, tokens: estimateTokens(addressing.content) })
    }

    const communicationPreferences = communicationPreferenceManager.buildPromptSection()
    if (communicationPreferences) {
      sections.push({
        title: communicationPreferences.title,
        content: communicationPreferences.content,
        priority: 0,
        tokens: estimateTokens(communicationPreferences.content),
      })
    }

    const bossMd = memoryFileManager.readBossMd()
    if (bossMd) {
      sections.push({ title: '老板偏好手册', content: bossMd, priority: 1, tokens: estimateTokens(bossMd) })
    }

    const profileSummary = profileManager.getSummary()
    if (profileSummary && profileSummary.trim()) {
      sections.push({ title: '用户画像', content: profileSummary, priority: 1, tokens: estimateTokens(profileSummary) })
    }

    const globalMemory = memoryFileManager.readGlobalMemory()
    if (globalMemory) {
      sections.push({ title: '全局长期记忆', content: globalMemory, priority: 2, tokens: estimateTokens(globalMemory) })
    }

    const skillMemory = memoryFileManager.readSkillMemory(skillId)
    if (skillMemory) {
      sections.push({ title: '当前技能长期记忆', content: skillMemory, priority: 2, tokens: estimateTokens(skillMemory) })
    }

    const recentGlobal = memoryFileManager.readRecentDaily({ scope: 'global', days: 2 })
    if (recentGlobal) {
      sections.push({ title: '近期全局记忆', content: recentGlobal, priority: 3, tokens: estimateTokens(recentGlobal) })
    }

    const recentSkill = memoryFileManager.readRecentDaily({ scope: 'skill', skillId, days: 2 })
    if (recentSkill) {
      sections.push({ title: '当前技能最近记忆', content: recentSkill, priority: 3, tokens: estimateTokens(recentSkill) })
    }

    return sections
  }

  private searchRelevantMemories(userQuery: string, skillId: string, maxResults = 5): MemorySection[] {
    const results = memorySearch.search({ query: userQuery, scope: 'all', skillId, maxResults, strategy: 'hybrid' })
    return results.map((result, index) => ({
      title: `相关记忆 #${index + 1}`,
      content: result.snippet,
      priority: 3,
      tokens: estimateTokens(result.snippet),
    }))
  }

  buildContext(params: BuildContextParams): string {
    const { skillId, userQuery, tokenBudget = 4000 } = params
    const sections = this.collectSections(skillId)

    if (userQuery.trim()) {
      const relevant = this.searchRelevantMemories(userQuery, skillId)
      const existingPrefixes = new Set(sections.map(section => section.content.slice(0, 100)))
      const unique = relevant.filter(result => !existingPrefixes.has(result.content.slice(0, 100)))
      sections.push(...unique)
    }

    sections.sort((a, b) => a.priority - b.priority)

    const selected: MemorySection[] = []
    let usedTokens = 0
    const maxPerItem = Math.floor(tokenBudget * 0.4)

    for (const section of sections) {
      if (section.priority <= 1) {
        if (section.tokens > maxPerItem) {
          section.content = section.content.slice(0, Math.floor(maxPerItem * 2.5))
          section.tokens = maxPerItem
        }
        selected.push(section)
        usedTokens += section.tokens
        continue
      }
      if (usedTokens + section.tokens <= tokenBudget) {
        selected.push(section)
        usedTokens += section.tokens
      }
    }

    return selected.map(section => `## ${section.title}\n\n${section.content}`).join('\n\n---\n\n')
  }

  buildContextSimple(skillId: string): string {
    return this.buildContext({ skillId, userQuery: '' })
  }
}

export const memoryInjector = new MemoryInjector()

/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲
 *  Memory CLI Extractor锛堥€氳繃 Claude CLI 鎻愬彇缁撴瀯鍖栬蹇嗭級
 * 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 */

export interface CliExtractResult {
  summary: string
  facts: ExtractedFact[]
  keywords: string[]
  sentiment: 'positive' | 'neutral' | 'negative'
  addressingUpdate: {
    shouldUpdate: boolean
    preferredName?: string
    confidence: number
    reason: string
  }
  extractionMethod: 'cli' | 'regex'
}

interface ExtractParams {
  userQuery: string
  assistantResponse: string
  timeoutMs?: number
}

const EXTRACTION_PROMPT = `你是一个记忆抽取助手。
请从给定对话中抽取结构化记忆，并且只输出严格 JSON（不要 markdown 代码块，不要额外解释）。

输出 Schema：
{
  "summary": "简短摘要，使用中文",
  "addressingUpdate": {
    "shouldUpdate": false,
    "preferredName": "",
    "confidence": 0.0,
    "reason": "判断原因"
  },
  "facts": [
    {
      "type": "preference|fact|correction|context|skill_insight",
      "content": "事实内容，使用中文",
      "confidence": 0.5,
      "source": "user|assistant|event",
      "intent": "preference|fact|correction|context|response_style|skill_insight",
      "persistence": "ephemeral|session|long_term",
      "scope": "user|skill|global"
    }
  ],
  "keywords": ["关键词1", "关键词2"],
  "sentiment": "positive|neutral|negative"
}

规则：
1) 只抽取对话中明确表达的信息，禁止臆测。
2) confidence 必须在 [0.5, 1.0] 之间。
3) 若没有可用事实，facts 返回空数组。
4) 用户提出的偏好/要求应标记 source="user"。
5) 助手建议不应直接转成用户偏好。
6) 一次性事件通常标记为 context/event，不应写成长期偏好。
7) addressingUpdate 只在“用户明确指定或强烈暗示以后怎么称呼他/她”时返回 shouldUpdate=true。
8) 像“你现在叫我什么”“你一般怎么称呼我”“好的老板”这类问句/礼貌语，addressingUpdate 必须为 shouldUpdate=false。
9) 不要把“老板/boss/sir”等纯礼貌语当作用户记忆；但“请叫我 Nathan”这类明确称呼偏好可以保留。
10) 输出语言默认使用中文（保留必要英文术语或专有名词）。
11) persistence 字段判断信息时效性：
    - ephemeral：一次性请求、临时状态（"帮我看一下这个报错"）
    - session：本次会话相关但不需要长期记住的信息
    - long_term：长期有效的偏好、知识、规律、方法论
12) scope 字段判断信息归属：
    - user：关于用户本人的信息（偏好、身份、习惯）
    - skill：当前任务领域的知识、方法论、技巧、洞察（不是关于用户，而是关于这个领域本身）
    - global：跨技能通用的信息
13) skill_insight 类型用于记录对话中产生的领域知识、思考方法论、有价值的洞察。
    这类信息通常 source="assistant" 或 source="event"，scope="skill"，persistence="long_term"。
    示例：{"type":"skill_insight","content":"讨论创业想法时用第一性原理拆解比直接给建议更有效","scope":"skill","persistence":"long_term"}`

const HARD_NEGATIVE_FEW_SHOTS = `
困难负例（必须遵循）：

示例 A
用户：帮我看一下这个报错。
助手：可以先清理缓存再重启服务。
错误：{"type":"preference","content":"用户偏好先清理缓存","source":"user"}
正确：{"type":"context","content":"助手建议先清理缓存并重启服务","source":"assistant","intent":"context"}

示例 B
用户：今天临时改成英文回复。
助手：好的。
错误：{"type":"preference","content":"用户长期偏好英文","source":"user"}
正确：{"type":"context","content":"用户今天临时要求英文回复","source":"event","intent":"context"}

示例 C
用户：以后先给结论再给步骤。
助手：收到。
错误：{"type":"context","content":"助手会先给结论再给步骤","source":"assistant"}
正确：{"type":"preference","content":"偏好先结论后步骤","source":"user","intent":"response_style"}

示例 D
用户：帮我分析这张图片。
助手：好的老板，我看一下。
错误：{"type":"fact","content":"用户称呼助手为老板","source":"user"}
正确：{"type":"context","content":"助手使用了礼貌称呼","source":"assistant","intent":"context"}

示例 E
用户：以后叫我 Nathan。
助手：好的。
正确：{"type":"preference","content":"请称呼我为 Nathan","source":"user","intent":"response_style"}

示例 F
用户：你现在叫我什么？
助手：……
正确：{"addressingUpdate":{"shouldUpdate":false,"preferredName":"","confidence":0.05,"reason":"用户在询问当前称呼，不是在设置新称呼"}}

示例 G
用户：帮我分析一下这个竞品。
助手：我来从产品定位、用户群体、商业模式三个维度分析。
错误：{"type":"skill_insight","content":"助手会从三个维度分析竞品","scope":"skill"}
正确：{"type":"context","content":"助手从产品定位、用户群体、商业模式三个维度分析了竞品","scope":"skill","persistence":"ephemeral"}
说明：具体的执行动作不是 insight，只有可复用的方法论或规律才是。

示例 H
用户：我发现用"五个为什么"追问法能帮我找到问题根因。
助手：这确实是很好的思考工具。
正确：{"type":"skill_insight","content":"用户认为'五个为什么'追问法能有效找到问题根因","source":"user","scope":"skill","persistence":"long_term"}
`

const FACT_NOISE_PATTERNS = [
  /(?:称呼|叫|call|address).{0,12}(?:assistant|ai|老板|老大|boss|sir|bro)/i,
  /^\s*(?:好的老板|收到老板|老板好|ok boss|yes sir)\s*$/i,
]

function extractJsonObjectCandidates(raw: string): string[] {
  const candidates: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let index = 0; index < raw.length; index += 1) {
    const ch = raw[index]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') {
      if (depth === 0) start = index
      depth += 1
      continue
    }
    if (ch === '}') {
      if (depth === 0) continue
      depth -= 1
      if (depth === 0 && start >= 0) {
        candidates.push(raw.slice(start, index + 1))
        start = -1
      }
    }
  }

  return candidates
}

function parseJSON<T>(raw: string): T {
  const trimmed = raw.trim()
  const candidates: string[] = []
  if (trimmed) candidates.push(trimmed)

  const markdownMatches = trimmed.matchAll(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/gi)
  for (const match of markdownMatches) {
    const body = (match[1] || '').trim()
    if (body) candidates.push(body)
  }

  const objectCandidates = extractJsonObjectCandidates(trimmed)
  if (objectCandidates.length > 0) {
    candidates.push(objectCandidates[objectCandidates.length - 1])
    candidates.push(...objectCandidates)
  }

  const uniqueCandidates = [...new Set(candidates.map(item => item.trim()).filter(Boolean))]
  for (const candidate of uniqueCandidates) {
    try {
      return JSON.parse(candidate) as T
    } catch {
      // continue
    }
  }

  throw new Error(`Unable to parse CLI extraction JSON (candidates=${uniqueCandidates.length})`)
}

function sanitizeFacts(rawFacts: unknown): ExtractedFact[] {
  if (!Array.isArray(rawFacts)) return []
  const allowedType = new Set<ExtractedFact['type']>(['preference', 'fact', 'correction', 'context', 'skill_insight'])
  const allowedSource = new Set<ExtractedFact['source']>(['user', 'assistant', 'event'])
  const allowedIntent = new Set<NonNullable<ExtractedFact['intent']>>([
    'preference', 'fact', 'correction', 'context', 'response_style', 'skill_insight',
  ])
  const allowedPersistence = new Set<NonNullable<ExtractedFact['persistence']>>(['ephemeral', 'session', 'long_term'])
  const allowedScope = new Set<NonNullable<ExtractedFact['scope']>>(['user', 'skill', 'global'])

  const sanitized: Array<ExtractedFact | null> = rawFacts.map(item => {
    if (!item || typeof item !== 'object') return null
    const candidate = item as Partial<ExtractedFact>
    if (!candidate.type || !allowedType.has(candidate.type)) return null
    if (!candidate.content || typeof candidate.content !== 'string') return null
    const content = candidate.content.trim()
    if (!content) return null
    if (isAddressingNoiseText(content) || FACT_NOISE_PATTERNS.some(pattern => pattern.test(content))) {
      return null
    }

    const parsedConfidence = typeof candidate.confidence === 'number' ? candidate.confidence : 0.6
    const confidence = Math.max(0.5, Math.min(1, parsedConfidence))
    const source = candidate.source && allowedSource.has(candidate.source) ? candidate.source : 'user'
    const intent = candidate.intent && allowedIntent.has(candidate.intent) ? candidate.intent : candidate.type
    const persistence = candidate.persistence && allowedPersistence.has(candidate.persistence)
      ? candidate.persistence : undefined
    const scope = candidate.scope && allowedScope.has(candidate.scope)
      ? candidate.scope : undefined

    return { type: candidate.type, content, confidence, source, intent, persistence, scope }
  })

  return sanitized.filter((item): item is ExtractedFact => item !== null)
}

function sanitizeAddressingUpdate(rawUpdate: unknown): CliExtractResult['addressingUpdate'] {
  if (!rawUpdate || typeof rawUpdate !== 'object') {
    return {
      shouldUpdate: false,
      confidence: 0,
      reason: '未返回称呼更新',
    }
  }

  const candidate = rawUpdate as Partial<CliExtractResult['addressingUpdate']>
  const shouldUpdate = candidate.shouldUpdate === true
  const preferredName = typeof candidate.preferredName === 'string'
    ? candidate.preferredName.trim()
    : ''
  const confidence = typeof candidate.confidence === 'number'
    ? Math.max(0, Math.min(1, candidate.confidence))
    : (shouldUpdate ? 0.8 : 0.2)
  const reason = typeof candidate.reason === 'string' && candidate.reason.trim()
    ? candidate.reason.trim().slice(0, 120)
    : '未提供判断原因'

  if (!shouldUpdate) {
    return { shouldUpdate: false, confidence, reason }
  }

  if (!preferredName) {
    return {
      shouldUpdate: false,
      confidence: Math.min(confidence, 0.2),
      reason: '未返回可用称呼',
    }
  }

  return { shouldUpdate: true, preferredName, confidence, reason }
}

export class MemoryCliExtractor {
  private readonly timeoutMs = 15_000

  private resolveTimeoutMs(override?: number): number {
    if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
      return override
    }

    const configured = Number.parseInt(process.env.MEMORY_CLI_TIMEOUT_MS || '', 10)
    if (Number.isFinite(configured) && configured > 0) {
      return configured
    }

    return this.timeoutMs
  }

  private resolveMemoryModel(): string | undefined {
    return (
      process.env.ANTHROPIC_MEMORY_MODEL
      || process.env.ANTHROPIC_CLASSIFY_MODEL
      || process.env.ANTHROPIC_MODEL
      || ''
    ).trim() || undefined
  }

  private buildConversation(userQuery: string, assistantResponse: string): string {
    return `User: ${userQuery}\n\nAssistant: ${assistantResponse}`
  }

  private buildFallbackFacts(userQuery: string): ExtractedFact[] {
    const facts: ExtractedFact[] = []
    const normalizedCommunicationStyle = normalizeCommunicationStylePreference(userQuery)
    if (normalizedCommunicationStyle) {
      facts.push({
        type: 'preference',
        content: normalizedCommunicationStyle.description,
        confidence: 0.94,
        source: 'user',
        intent: 'response_style',
      })
    }

    for (const patch of extractStrongCommunicationPreferencePatches(userQuery)) {
      facts.push({
        type: 'preference',
        content: patch.description,
        confidence: patch.confidence,
        source: 'user',
        intent: 'response_style',
      })
    }

    const dedup = new Map<string, ExtractedFact>()
    for (const fact of facts) {
      const key = `${fact.type}\u0000${fact.intent}\u0000${fact.content}`
      if (!dedup.has(key)) {
        dedup.set(key, fact)
      }
    }

    return Array.from(dedup.values())
  }

  private fallback(params: ExtractParams): CliExtractResult {
    const preferredName = extractStrongPreferredName(params.userQuery)
    const facts = this.buildFallbackFacts(params.userQuery)
    return {
      summary: '',
      facts,
      keywords: [],
      sentiment: 'neutral',
      addressingUpdate: {
        shouldUpdate: Boolean(preferredName),
        preferredName: preferredName || undefined,
        confidence: preferredName ? 0.99 : 0,
        reason: preferredName ? '命中明确称呼指定快路径' : 'CLI 不可用，跳过称呼更新',
      },
      extractionMethod: 'regex',
    }
  }

  private buildCliErrorLog(params: {
    stage: string
    source?: string
    command?: string
    args?: string[]
    exitCode?: number
    stderr?: string
    stdout?: string
    reason?: unknown
  }): string {
    const details: string[] = [
      `stage=${params.stage}`,
      `source=${params.source || 'unknown'}`,
      `command=${params.command || 'none'}`,
    ]
    if (params.args && params.args.length > 0) {
      details.push(`args=${params.args.join(' ')}`)
    }
    if (typeof params.exitCode === 'number') {
      details.push(`exitCode=${params.exitCode}`)
    }
    if (params.stderr) {
      details.push(`stderr=${params.stderr.slice(0, 240)}`)
    }
    if (params.stdout) {
      details.push(`stdout=${params.stdout.slice(0, 240)}`)
    }
    if (params.reason) {
      details.push(`reason=${String(params.reason).slice(0, 240)}`)
    }
    return `[MemoryCLI] ${details.join(' | ')}`
  }

  private parseCliSuccessPayload(outputText: string): CliExtractResult {
    const parsed = parseJSON<{
      summary?: string
      addressingUpdate?: unknown
      facts?: unknown
      keywords?: unknown
      sentiment?: unknown
    }>(outputText)

    const summary = (parsed.summary || '').trim()
    const addressingUpdate = sanitizeAddressingUpdate(parsed.addressingUpdate)
    const facts = sanitizeFacts(parsed.facts)
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.filter(item => typeof item === 'string').map(item => item.trim()).slice(0, 8)
      : []
    const sentiment = parsed.sentiment === 'positive' || parsed.sentiment === 'negative'
      ? parsed.sentiment : 'neutral'

    if (!summary) throw new Error('CLI extraction result is missing summary')

    return { summary, facts, keywords, sentiment, addressingUpdate, extractionMethod: 'cli' }
  }

  async extract(params: ExtractParams): Promise<CliExtractResult> {
    if (!isClaudeCliAvailable()) {
      return this.fallback(params)
    }

    refreshRuntimeConfig()

    const cliLaunch = resolveClaudeCliLaunch()
    if (!cliLaunch) {
      console.warn(this.buildCliErrorLog({ stage: 'resolve', reason: 'Claude CLI not found' }))
      return this.fallback(params)
    }

    const basePrompt = `${EXTRACTION_PROMPT}\n${HARD_NEGATIVE_FEW_SHOTS}\n${this.buildConversation(params.userQuery, params.assistantResponse)}`
    const strictJsonSuffix = '\n\n重要：只返回一个合法 JSON 对象，不要包含 markdown 代码块或任何额外文本。'
    const args = ['--print', '--dangerously-skip-permissions']
    const memoryModel = this.resolveMemoryModel()
    if (memoryModel) {
      args.push('--model', memoryModel)
    }
    const logArgs = [...cliLaunch.argsPrefix, ...args, '<prompt>']

    const timeout = this.resolveTimeoutMs(params.timeoutMs)

    const runOnce = async (strictJsonOnly = false): Promise<CliExtractResult> => {
      const prompt = strictJsonOnly ? `${basePrompt}${strictJsonSuffix}` : basePrompt
      const promptDelivery = buildClaudeCliPromptDelivery(cliLaunch, args, prompt)
      const spawnArgs = [...cliLaunch.argsPrefix, ...promptDelivery.args]
      const proc = spawn(cliLaunch.command, spawnArgs, {
        env: buildClaudeEnvConfig(),
        shell: cliLaunch.shell,
        stdio: [promptDelivery.useStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      if (!proc.stdout || !proc.stderr) {
        throw new Error('Claude CLI stdio is unavailable')
      }
      proc.stdout.on('data', chunk => { stdout += chunk.toString('utf-8') })
      proc.stderr.on('data', chunk => { stderr += chunk.toString('utf-8') })

      if (promptDelivery.useStdin) {
        if (!proc.stdin) {
          throw new Error('Claude CLI stdin is unavailable')
        }
        proc.stdin.write(prompt, 'utf-8')
        proc.stdin.end()
      }

      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        proc.kill('SIGTERM')
      }, timeout)

      const exitCode = await new Promise<number>((resolve, reject) => {
        proc.on('close', code => resolve(code ?? 1))
        proc.on('error', reject)
      })
      clearTimeout(timer)

      if (exitCode !== 0) {
        const outputText = stdout.trim()
        if (outputText) {
          try {
            const salvaged = this.parseCliSuccessPayload(outputText)
            console.warn(this.buildCliErrorLog({
              stage: timedOut ? 'timeout-salvaged' : 'nonzero-salvaged',
              source: cliLaunch.source,
              command: cliLaunch.command,
              args: logArgs,
              exitCode,
              stderr,
              stdout: outputText,
            }))
            return salvaged
          } catch {
            // fall through to regular error handling
          }
        }

        console.warn(this.buildCliErrorLog({
          stage: 'spawn',
          source: cliLaunch.source,
          command: cliLaunch.command,
          args: logArgs,
          exitCode,
          stderr,
          stdout,
        }))
        throw new Error(`CLI extraction failed: code=${exitCode} stderr=${stderr.slice(0, 240)}`)
      }

      const outputText = stdout.trim()
      try {
        return this.parseCliSuccessPayload(outputText)
      } catch (error) {
        console.warn(this.buildCliErrorLog({
          stage: 'parse',
          source: cliLaunch.source,
          command: cliLaunch.command,
          args: logArgs,
          stderr,
          stdout: outputText,
          reason: error,
        }))
        throw error
      }
    }

    try {
      return await runOnce(false)
    } catch (firstError) {
      console.warn(this.buildCliErrorLog({
        stage: 'retry-1',
        source: cliLaunch.source,
        command: cliLaunch.command,
        args: logArgs,
        reason: firstError,
      }))
      try {
        await new Promise(resolve => setTimeout(resolve, 1000))
        return await runOnce(true)
      } catch (secondError) {
        console.warn(this.buildCliErrorLog({
          stage: 'fallback',
          source: cliLaunch.source,
          command: cliLaunch.command,
          args: logArgs,
          reason: secondError,
        }))
        return this.fallback(params)
      }
    }
  }
}

export const memoryCliExtractor = new MemoryCliExtractor()

/* ═══════════════════════════════════════════════════════════════════════════
 *  通用 Claude CLI 调用（用于 evolution 压缩等场景）
 * ═══════════════════════════════════════════════════════════════════════════ */

export async function runClaudeCliPrompt(prompt: string, timeoutMs = 30_000): Promise<string | null> {
  if (!isClaudeCliAvailable()) return null

  refreshRuntimeConfig()
  const cliLaunch = resolveClaudeCliLaunch()
  if (!cliLaunch) return null

  const args = ['--print', '--dangerously-skip-permissions']
  const memoryModel = (
    process.env.ANTHROPIC_MEMORY_MODEL
    || process.env.ANTHROPIC_CLASSIFY_MODEL
    || process.env.ANTHROPIC_MODEL
    || ''
  ).trim()
  if (memoryModel) args.push('--model', memoryModel)

  const promptDelivery = buildClaudeCliPromptDelivery(cliLaunch, args, prompt)
  const spawnArgs = [...cliLaunch.argsPrefix, ...promptDelivery.args]

  try {
    const proc = spawn(cliLaunch.command, spawnArgs, {
      env: buildClaudeEnvConfig(),
      shell: cliLaunch.shell,
      stdio: [promptDelivery.useStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    if (!proc.stdout || !proc.stderr) {
      throw new Error('Claude CLI stdio is unavailable')
    }
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf-8') })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf-8') })

    if (promptDelivery.useStdin) {
      if (!proc.stdin) {
        throw new Error('Claude CLI stdin is unavailable')
      }
      proc.stdin.write(prompt, 'utf-8')
      proc.stdin.end()
    }

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      proc.kill('SIGTERM')
    }, timeoutMs)

    const exitCode = await new Promise<number>((resolve, reject) => {
      proc.on('close', code => resolve(code ?? 1))
      proc.on('error', reject)
    })
    clearTimeout(timer)

    if (timedOut || exitCode !== 0) {
      console.warn(`[runClaudeCliPrompt] failed: timedOut=${timedOut} exitCode=${exitCode} stderr=${stderr.slice(0, 240)}`)
      return stdout.trim() || null
    }

    return stdout.trim() || null
  } catch (error) {
    console.warn('[runClaudeCliPrompt] spawn error:', error)
    return null
  }
}
