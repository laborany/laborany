/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Memory I/O                                         ║
 * ║                                                                        ║
 * ║  包含：MemoryInjector（注入上下文）+ MemoryCliExtractor（提取记忆）     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { spawn } from 'child_process'
import { memoryFileManager } from './file-manager.js'
import { memorySearch } from './search.js'
import { profileManager } from './profile/index.js'
import { buildClaudeEnvConfig, resolveClaudeCliLaunch } from '../claude-cli.js'
import type { ExtractedFact } from './memcell/index.js'

/* ══════════════════════════════════════════════════════════════════════════
 *  Memory Injector（注入记忆上下文到 prompt）
 * ══════════════════════════════════════════════════════════════════════════ */

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
      sections.push({ title: '老板工作手册', content: bossMd, priority: 1, tokens: estimateTokens(bossMd) })
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
      sections.push({ title: '最近全局记忆', content: recentGlobal, priority: 3, tokens: estimateTokens(recentGlobal) })
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

/* ══════════════════════════════════════════════════════════════════════════
 *  Memory CLI Extractor（通过 Claude CLI 提取结构化记忆）
 * ══════════════════════════════════════════════════════════════════════════ */

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

const EXTRACTION_PROMPT = `你是一个记忆提取专家。请从对话中提取结构化记忆。
输出必须是严格 JSON，不要输出任何额外文本。

Schema:
{
  "summary": "100-200字摘要",
  "facts": [
    {
      "type": "preference|fact|correction|context",
      "content": "事实内容",
      "confidence": 0.5,
      "source": "user|assistant|event",
      "intent": "preference|fact|correction|context|response_style"
    }
  ],
  "keywords": ["关键词", "关键词"],
  "sentiment": "positive|neutral|negative"
}

规则：
1) 只提取明确表达，不要猜测；
2) confidence 范围 0.5-1.0；
3) 如果无事实，facts 返回空数组；
4) source 必须标注来源：用户陈述= user，助手自述/建议= assistant，对任务过程的客观概括= event；
5) 风格偏好类尽量标注 intent=response_style 或 preference；
6) 输出必须可直接 JSON.parse。

Few-shot 示例：

示例1（用户偏好）
User: 以后回答先给结论，再给步骤，尽量简洁。
Assistant: 好的，我后续会先结论再步骤。
Output:
{
  "summary": "用户明确了后续回答风格，要求先结论后步骤并保持简洁。",
  "facts": [
    {"type":"preference","content":"以后回答先给结论再给步骤","confidence":0.94,"source":"user","intent":"response_style"},
    {"type":"preference","content":"回答尽量简洁","confidence":0.92,"source":"user","intent":"response_style"}
  ],
  "keywords": ["回答风格","先结论","简洁"],
  "sentiment": "neutral"
}

示例2（模型回答，不应当作用户偏好）
User: 你帮我看这个报错。
Assistant: 建议你先清理缓存，再重启服务。
Output:
{
  "summary": "助手给出了排查建议。",
  "facts": [
    {"type":"context","content":"建议先清理缓存再重启服务","confidence":0.76,"source":"assistant","intent":"context"}
  ],
  "keywords": ["排查","缓存","重启"],
  "sentiment": "neutral"
}

示例3（事件概括）
User: 昨天我们把支付模块从 v1 升到了 v2。
Assistant: 升级完成后回归通过。
Output:
{
  "summary": "对话记录了支付模块版本升级及回归结果。",
  "facts": [
    {"type":"fact","content":"支付模块从 v1 升级到 v2","confidence":0.9,"source":"event","intent":"fact"},
    {"type":"context","content":"升级后回归通过","confidence":0.86,"source":"event","intent":"context"}
  ],
  "keywords": ["支付模块","升级","回归"],
  "sentiment": "positive"
}

示例4（无可提取长期事实）
User: 好的，收到。
Assistant: 明白。
Output:
{
  "summary": "本轮主要是确认回复。",
  "facts": [],
  "keywords": ["确认"],
  "sentiment": "neutral"
}

对话：`
const HARD_NEGATIVE_FEW_SHOTS = `
Hard negative examples (must follow):

Example A (do NOT treat assistant suggestion as user preference)
User: 帮我看看这个报错。
Assistant: 你可以先清理缓存，再重启服务。
Bad fact: {"type":"preference","content":"用户偏好先清缓存再重启","source":"user"}
Good fact: {"type":"context","content":"建议先清理缓存再重启服务","source":"assistant","intent":"context"}

Example B (do NOT treat one-time event as stable preference)
User: 今天临时改成英文输出。
Assistant: 好的，今天我用英文回复。
Bad fact: {"type":"preference","content":"用户长期偏好英文回复","source":"user"}
Good fact: {"type":"context","content":"今天临时改成英文输出","source":"event","intent":"context"}

Example C (style requirement from user should be user + response_style)
User: 以后都先给结论，再给步骤。
Assistant: 收到。
Bad fact: {"type":"context","content":"助手将先给结论再给步骤","source":"assistant"}
Good fact: {"type":"preference","content":"以后先给结论再给步骤","source":"user","intent":"response_style"}
`

function parseJSON<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    // continue
  }
  const markdownMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (markdownMatch) {
    return JSON.parse(markdownMatch[1]) as T
  }
  throw new Error('无法解析 CLI 提取结果 JSON')
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

    const parsedConfidence = typeof candidate.confidence === 'number' ? candidate.confidence : 0.6
    const confidence = Math.max(0.5, Math.min(1, parsedConfidence))
    const source = candidate.source && allowedSource.has(candidate.source) ? candidate.source : 'user'
    const intent = candidate.intent && allowedIntent.has(candidate.intent) ? candidate.intent : candidate.type

    return { type: candidate.type, content: candidate.content.trim(), confidence, source, intent }
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
    if (params.reason) {
      details.push(`reason=${String(params.reason).slice(0, 240)}`)
    }
    return `[MemoryCLI] ${details.join(' | ')}`
  }

  async extract(params: ExtractParams): Promise<CliExtractResult> {
    const cliLaunch = resolveClaudeCliLaunch()
    if (!cliLaunch) {
      console.warn(this.buildCliErrorLog({ stage: 'resolve', reason: 'Claude CLI not found' }))
      return this.fallback(params)
    }

    const prompt = `${EXTRACTION_PROMPT}\n${HARD_NEGATIVE_FEW_SHOTS}\n${this.buildConversation(params.userQuery, params.assistantResponse)}`
    const args = ['--print', '--dangerously-skip-permissions']
    if (process.env.ANTHROPIC_MODEL) {
      args.push('--model', process.env.ANTHROPIC_MODEL)
    }
    const spawnArgs = [...cliLaunch.argsPrefix, ...args]

    const timeout = params.timeoutMs ?? this.timeoutMs

    const runOnce = async (): Promise<CliExtractResult> => {
      const proc = spawn(cliLaunch.command, spawnArgs, {
        env: buildClaudeEnvConfig(),
        shell: cliLaunch.shell,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      proc.stdout.on('data', chunk => { stdout += chunk.toString('utf-8') })
      proc.stderr.on('data', chunk => { stderr += chunk.toString('utf-8') })

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
        }))
        throw new Error(`CLI 提取失败: code=${exitCode} stderr=${stderr.slice(0, 240)}`)
      }

      const parsed = parseJSON<{
        summary?: string; facts?: unknown; keywords?: unknown; sentiment?: unknown
      }>(stdout.trim())

      const summary = (parsed.summary || '').trim()
      const facts = sanitizeFacts(parsed.facts)
      const keywords = Array.isArray(parsed.keywords)
        ? parsed.keywords.filter(item => typeof item === 'string').map(item => item.trim()).slice(0, 8)
        : []
      const sentiment = parsed.sentiment === 'positive' || parsed.sentiment === 'negative'
        ? parsed.sentiment : 'neutral'

      if (!summary) throw new Error('CLI 提取结果缺少 summary')

      return { summary, facts, keywords, sentiment, extractionMethod: 'cli' }
    }

    try {
      return await runOnce()
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
        return await runOnce()
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
