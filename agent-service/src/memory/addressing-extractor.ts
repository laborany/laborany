import { runClaudePrompt, isClaudeCliAvailable } from './cli-runner.js'
import { addressingManager, extractStrongPreferredName, hasAddressingIntentCue } from './addressing-manager.js'

export interface AddressingExtractResult {
  shouldUpdate: boolean
  preferredName?: string
  confidence: number
  reason: string
  extractionMethod: 'cli' | 'fast' | 'skipped' | 'unavailable'
}

interface AddressingExtractPayload {
  shouldUpdate?: boolean
  preferredName?: string
  confidence?: number
  reason?: string
}

interface ExtractParams {
  userText: string
  currentPreferredName?: string
  timeoutMs?: number
}

interface PersistParams extends ExtractParams {
  evidenceText?: string
}

const ADDRESSING_EXTRACTION_PROMPT = `你是一个“用户称呼偏好”提取器。
你的任务是判断：最新一条用户消息，是否在指定“助手以后应该如何称呼这个用户”。

仅返回严格 JSON：
{"shouldUpdate":false,"preferredName":"","confidence":0.0,"reason":""}

判断原则：
1) 只有当用户明确指定或强烈暗示“以后怎么称呼他/她”时，shouldUpdate 才为 true。
2) 常见正例：
   - 请叫我 Nathan
   - 以后叫我阿晨
   - 你可以叫我老陈
   - 我叫 Nathan
   - 我的名字是 Nathan
3) 常见反例：
   - 你现在叫我什么
   - 你一般怎么称呼我
   - 你是不是把我叫老板
   - 好的老板
   - 我叫你老板
   - 老板让我改一下
4) 如果是问句、追问、引用、礼貌语、谈论“助手被怎么称呼”，都应返回 shouldUpdate=false。
5) preferredName 只填写最终称呼本身，不要带“叫我”“称呼我为”等前缀。
6) confidence 取值 0 到 1。
7) 输出语言使用中文，reason 简短说明判断依据。`

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function parseJsonPayload<T>(raw: string): T | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const candidates: string[] = [trimmed]
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
      continue
    }
  }

  return null
}

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

function clip(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}...`
}

function fallbackResult(reason: string, extractionMethod: AddressingExtractResult['extractionMethod']): AddressingExtractResult {
  return {
    shouldUpdate: false,
    confidence: 0,
    reason,
    extractionMethod,
  }
}

function buildPersistKey(userText: string, currentPreferredName?: string): string {
  return `${normalizeWhitespace(userText)}\u0000${normalizeWhitespace(currentPreferredName || '')}`
}

export class AddressingCliExtractor {
  private readonly timeoutMs = 18_000
  private readonly pendingPersists = new Map<string, Promise<void>>()
  private readonly pendingExtracts = new Map<string, Promise<AddressingExtractResult>>()
  private readonly recentExtracts = new Map<string, { result: AddressingExtractResult; expiresAt: number }>()
  private readonly cacheTtlMs = 60_000

  shouldInspect(userText: string): boolean {
    return hasAddressingIntentCue(userText)
  }

  private getCachedExtract(key: string): AddressingExtractResult | null {
    const cached = this.recentExtracts.get(key)
    if (!cached) return null
    if (cached.expiresAt <= Date.now()) {
      this.recentExtracts.delete(key)
      return null
    }
    return { ...cached.result }
  }

  private setCachedExtract(key: string, result: AddressingExtractResult): void {
    this.recentExtracts.set(key, {
      result: { ...result },
      expiresAt: Date.now() + this.cacheTtlMs,
    })
  }

  private resolveFastPath(userText: string): AddressingExtractResult | null {
    const preferredName = extractStrongPreferredName(userText)
    if (!preferredName) return null
    return {
      shouldUpdate: true,
      preferredName,
      confidence: 0.99,
      reason: '命中明确称呼指定快路径',
      extractionMethod: 'fast',
    }
  }

  private async extractWithCli(userText: string, currentPreferredName: string, timeoutMs?: number): Promise<AddressingExtractResult> {
    if (!isClaudeCliAvailable()) return fallbackResult('Claude CLI 不可用', 'unavailable')

    const model = (
      process.env.ANTHROPIC_ADDRESSING_MODEL
      || process.env.ANTHROPIC_CLASSIFY_MODEL
      || process.env.ANTHROPIC_MODEL
      || ''
    ).trim()

    const prompt = `${ADDRESSING_EXTRACTION_PROMPT}

Current preferredName: ${currentPreferredName || '(empty)'}
Latest user message: ${userText}

重要：只返回一个合法 JSON 对象，不要包含 markdown 代码块或任何额外文本。`

    const attempts = [
      { timeoutMs: timeoutMs ?? this.timeoutMs, prompt },
      { timeoutMs: Math.max(timeoutMs ?? this.timeoutMs, 24_000), prompt: `${prompt}\n再次强调：只能输出 JSON。` },
    ]

    let payload: AddressingExtractPayload | null = null
    let lastFailureReason = 'Claude CLI 执行失败'

    for (const attempt of attempts) {
      const result = await runClaudePrompt({
        prompt: attempt.prompt,
        timeoutMs: attempt.timeoutMs,
        model: model || undefined,
      })

      if (!result.ok) {
        lastFailureReason = result.reason || 'Claude CLI 执行失败'
        console.warn(
          `[AddressingExtractor] fallback: source=${result.source || 'unknown'} reason=${lastFailureReason} stderr=${(result.stderr || '').slice(0, 160)}`,
        )
        continue
      }

      payload = parseJsonPayload<AddressingExtractPayload>(result.stdout)
      if (payload) break

      lastFailureReason = 'Claude CLI 输出无法解析'
      console.warn('[AddressingExtractor] fallback: Claude CLI 输出无法解析，准备重试')
    }

    if (!payload) {
      return fallbackResult(lastFailureReason, 'unavailable')
    }

    const shouldUpdate = payload.shouldUpdate === true
    const preferredName = typeof payload.preferredName === 'string'
      ? normalizeWhitespace(payload.preferredName)
      : ''
    const confidence = typeof payload.confidence === 'number'
      ? Math.max(0, Math.min(1, payload.confidence))
      : (shouldUpdate ? 0.8 : 0.2)
    const reason = clip(normalizeWhitespace(payload.reason || 'Claude CLI 提取结果'), 120)

    return {
      shouldUpdate,
      preferredName: preferredName || undefined,
      confidence,
      reason,
      extractionMethod: 'cli',
    }
  }

  async extract(params: ExtractParams): Promise<AddressingExtractResult> {
    const userText = normalizeWhitespace(params.userText)
    if (!userText) return fallbackResult('用户消息为空', 'skipped')

    const key = buildPersistKey(userText, params.currentPreferredName)
    const cached = this.getCachedExtract(key)
    if (cached) return cached

    const fastPath = this.resolveFastPath(userText)
    if (fastPath) {
      this.setCachedExtract(key, fastPath)
      return fastPath
    }

    if (!this.shouldInspect(userText)) return fallbackResult('未命中称呼候选信号', 'skipped')

    const pending = this.pendingExtracts.get(key)
    if (pending) return pending

    const currentPreferredName = normalizeWhitespace(params.currentPreferredName || '')
    const task = this.extractWithCli(userText, currentPreferredName, params.timeoutMs)
      .then((result) => {
        if (result.extractionMethod === 'cli' || result.extractionMethod === 'fast') {
          this.setCachedExtract(key, result)
        }
        return result
      })
      .finally(() => {
        this.pendingExtracts.delete(key)
      })

    this.pendingExtracts.set(key, task)
    return task
  }

  async persistIfNeeded(params: PersistParams): Promise<AddressingExtractResult> {
    const result = await this.extract(params)
    if (!result.shouldUpdate || !result.preferredName) return result

    try {
      addressingManager.setPreferredName(
        result.preferredName,
        'auto',
        `${(params.evidenceText || params.userText).slice(0, 100)} | ${result.reason}`,
      )
    } catch (error) {
      console.warn('[AddressingExtractor] Skip invalid addressing update', error)
    }

    return result
  }

  schedulePersistIfNeeded(params: PersistParams): void {
    const userText = normalizeWhitespace(params.userText)
    if (!userText || !this.shouldInspect(userText)) return

    const fastPath = this.resolveFastPath(userText)
    if (fastPath?.shouldUpdate && fastPath.preferredName) {
      try {
        addressingManager.setPreferredName(
          fastPath.preferredName,
          'auto',
          `${(params.evidenceText || userText).slice(0, 100)} | ${fastPath.reason}`,
        )
      } catch (error) {
        console.warn('[AddressingExtractor] Skip invalid fast-path update', error)
      }
      const key = buildPersistKey(userText, params.currentPreferredName)
      this.setCachedExtract(key, fastPath)
      return
    }

    if (!isClaudeCliAvailable()) return

    const key = buildPersistKey(userText, params.currentPreferredName)
    if (this.pendingPersists.has(key)) return

    const task = this.persistIfNeeded({
      ...params,
      userText,
    })
      .then(() => undefined)
      .catch((error) => {
        console.warn('[AddressingExtractor] Background persist failed', error)
      })
      .finally(() => {
        this.pendingPersists.delete(key)
      })

    this.pendingPersists.set(key, task)
  }
}

export const addressingCliExtractor = new AddressingCliExtractor()
