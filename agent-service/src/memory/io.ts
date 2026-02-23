/* 鈺斺晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晽
 * 鈺?                    Memory I/O                                         鈺?
 * 鈺?                                                                       鈺?
 * 鈺? 鍖呭惈锛歁emoryInjector锛堟敞鍏ヤ笂涓嬫枃锛? MemoryCliExtractor锛堟彁鍙栬蹇嗭級     鈺?
 * 鈺氣晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨暆 */

import { spawn } from 'child_process'
import { memoryFileManager } from './file-manager.js'
import { memorySearch } from './search.js'
import { profileManager } from './profile/index.js'
import { buildClaudeEnvConfig, resolveClaudeCliLaunch } from '../claude-cli.js'
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
      if (section.priority === 1) {
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
  "facts": [
    {
      "type": "preference|fact|correction|context",
      "content": "事实内容，使用中文",
      "confidence": 0.5,
      "source": "user|assistant|event",
      "intent": "preference|fact|correction|context|response_style"
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
7) 不要把“老板/boss/sir”等称呼礼貌语当作用户记忆。
8) 输出语言默认使用中文（保留必要英文术语或专有名词）。`

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
  const allowedType = new Set<ExtractedFact['type']>(['preference', 'fact', 'correction', 'context'])
  const allowedSource = new Set<ExtractedFact['source']>(['user', 'assistant', 'event'])
  const allowedIntent = new Set<NonNullable<ExtractedFact['intent']>>([
    'preference', 'fact', 'correction', 'context', 'response_style',
  ])

  const sanitized: Array<ExtractedFact | null> = rawFacts.map(item => {
    if (!item || typeof item !== 'object') return null
    const candidate = item as Partial<ExtractedFact>
    if (!candidate.type || !allowedType.has(candidate.type)) return null
    if (!candidate.content || typeof candidate.content !== 'string') return null
    const content = candidate.content.trim()
    if (!content) return null
    if (FACT_NOISE_PATTERNS.some(pattern => pattern.test(content))) return null

    const parsedConfidence = typeof candidate.confidence === 'number' ? candidate.confidence : 0.6
    const confidence = Math.max(0.5, Math.min(1, parsedConfidence))
    const source = candidate.source && allowedSource.has(candidate.source) ? candidate.source : 'user'
    const intent = candidate.intent && allowedIntent.has(candidate.intent) ? candidate.intent : candidate.type

    return { type: candidate.type, content, confidence, source, intent }
  })

  return sanitized.filter((item): item is ExtractedFact => item !== null)
}

export class MemoryCliExtractor {
  private readonly timeoutMs = 15_000

  private buildConversation(userQuery: string, assistantResponse: string): string {
    return `User: ${userQuery}\n\nAssistant: ${assistantResponse}`
  }

  private fallback(_params: ExtractParams): CliExtractResult {
    return { summary: '', facts: [], keywords: [], sentiment: 'neutral', extractionMethod: 'regex' }
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

  async extract(params: ExtractParams): Promise<CliExtractResult> {
    refreshRuntimeConfig()

    const cliLaunch = resolveClaudeCliLaunch()
    if (!cliLaunch) {
      console.warn(this.buildCliErrorLog({ stage: 'resolve', reason: 'Claude CLI not found' }))
      return this.fallback(params)
    }

    const basePrompt = `${EXTRACTION_PROMPT}\n${HARD_NEGATIVE_FEW_SHOTS}\n${this.buildConversation(params.userQuery, params.assistantResponse)}`
    const strictJsonSuffix = '\n\n重要：只返回一个合法 JSON 对象，不要包含 markdown 代码块或任何额外文本。'
    const args = ['--print', '--dangerously-skip-permissions']
    if (process.env.ANTHROPIC_MODEL) {
      args.push('--model', process.env.ANTHROPIC_MODEL)
    }
    const spawnArgs = [...cliLaunch.argsPrefix, ...args]

    const timeout = params.timeoutMs ?? this.timeoutMs

    const runOnce = async (strictJsonOnly = false): Promise<CliExtractResult> => {
      const proc = spawn(cliLaunch.command, spawnArgs, {
        env: buildClaudeEnvConfig(),
        shell: cliLaunch.shell,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      proc.stdout.on('data', chunk => { stdout += chunk.toString('utf-8') })
      proc.stderr.on('data', chunk => { stderr += chunk.toString('utf-8') })

      const prompt = strictJsonOnly ? `${basePrompt}${strictJsonSuffix}` : basePrompt
      proc.stdin.write(prompt, 'utf-8')
      proc.stdin.end()

      const timer = setTimeout(() => { proc.kill('SIGTERM') }, timeout)

      const exitCode = await new Promise<number>((resolve, reject) => {
        proc.on('close', code => resolve(code ?? 1))
        proc.on('error', reject)
      })
      clearTimeout(timer)

      if (exitCode !== 0) {
        console.warn(this.buildCliErrorLog({
          stage: 'spawn',
          source: cliLaunch.source,
          command: cliLaunch.command,
          args: spawnArgs,
          exitCode,
          stderr,
          stdout,
        }))
        throw new Error(`CLI extraction failed: code=${exitCode} stderr=${stderr.slice(0, 240)}`)
      }

      const outputText = stdout.trim()
      let parsed: {
        summary?: string
        facts?: unknown
        keywords?: unknown
        sentiment?: unknown
      }
      try {
        parsed = parseJSON<{
          summary?: string
          facts?: unknown
          keywords?: unknown
          sentiment?: unknown
        }>(outputText)
      } catch (error) {
        console.warn(this.buildCliErrorLog({
          stage: 'parse',
          source: cliLaunch.source,
          command: cliLaunch.command,
          args: spawnArgs,
          stderr,
          stdout: outputText,
          reason: error,
        }))
        throw error
      }

      const summary = (parsed.summary || '').trim()
      const facts = sanitizeFacts(parsed.facts)
      const keywords = Array.isArray(parsed.keywords)
        ? parsed.keywords.filter(item => typeof item === 'string').map(item => item.trim()).slice(0, 8)
        : []
      const sentiment = parsed.sentiment === 'positive' || parsed.sentiment === 'negative'
        ? parsed.sentiment : 'neutral'

      if (!summary) throw new Error('CLI extraction result is missing summary')

      return { summary, facts, keywords, sentiment, extractionMethod: 'cli' }
    }

    try {
      return await runOnce(false)
    } catch (firstError) {
      console.warn(this.buildCliErrorLog({
        stage: 'retry-1',
        source: cliLaunch.source,
        command: cliLaunch.command,
        args: spawnArgs,
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
          args: spawnArgs,
          reason: secondError,
        }))
        return this.fallback(params)
      }
    }
  }
}

export const memoryCliExtractor = new MemoryCliExtractor()
