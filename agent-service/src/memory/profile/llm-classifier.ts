import type { ExtractedFact } from '../memcell/index.js'
import { isClaudeCliAvailable, runClaudePrompt } from '../cli-runner.js'

interface ClassifyResult {
  section: string
  key: string
  description: string
  shouldUpdate: boolean
  reason: string
}

interface ConflictResult {
  resolution: 'keep_old' | 'use_new' | 'merge'
  mergedValue?: string
  reason: string
}

const SECTION_WORK_PREFERENCE = '\u5de5\u4f5c\u504f\u597d'
const SECTION_COMMUNICATION_STYLE = '\u6c9f\u901a\u98ce\u683c'
const SECTION_TECH_STACK = '\u6280\u672f\u6808'
const SECTION_PERSONAL_INFO = '\u4e2a\u4eba\u4fe1\u606f'

const CLASSIFY_PROMPT = `请把一条记忆事实归类到画像分区中。
仅返回严格 JSON：
{"section":"...","key":"...","description":"...","shouldUpdate":true,"reason":"..."}

可选 section 值：
- 工作偏好
- 沟通风格
- 技术栈
- 个人信息

规则：
- 对“老板/您好/收到”等低价值称呼礼貌语，返回 shouldUpdate=false。
- description 必须是简洁、可复用的事实记忆，长度 <= 180 字。
- key 要简短，长度 <= 20 字。
- 输出内容优先使用中文（保留必要专有名词/术语）。
- 不要 markdown，不要额外字段。`

const CONFLICT_PROMPT = `请解决画像记忆冲突。
仅返回严格 JSON：
{"resolution":"keep_old|use_new|merge","mergedValue":"...","reason":"..."}

规则：
- keep_old：旧值仍更可靠。
- use_new：新值明显更准确或属于纠正。
- merge：两者都可保留，用一句简洁中文合并。
- reason 使用中文说明。
- 不要 markdown，不要额外字段。`

interface ClassifyPayload {
  section?: string
  key?: string
  description?: string
  shouldUpdate?: boolean
  reason?: string
}

interface ConflictPayload {
  resolution?: 'keep_old' | 'use_new' | 'merge'
  mergedValue?: string
  reason?: string
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function clip(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}...`
}

function parseJsonPayload<T>(raw: string): T | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const start = withoutFence.indexOf('{')
  const end = withoutFence.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null

  try {
    return JSON.parse(withoutFence.slice(start, end + 1)) as T
  } catch {
    return null
  }
}

function normalizeSection(section: string, fallback: string): string {
  const normalized = normalizeWhitespace(section)
  if (normalized === SECTION_WORK_PREFERENCE) return SECTION_WORK_PREFERENCE
  if (normalized === SECTION_COMMUNICATION_STYLE) return SECTION_COMMUNICATION_STYLE
  if (normalized === SECTION_TECH_STACK) return SECTION_TECH_STACK
  if (normalized === SECTION_PERSONAL_INFO) return SECTION_PERSONAL_INFO
  return fallback
}

function isAddressingNoise(content: string): boolean {
  const value = normalizeWhitespace(content)
  if (!value) return true

  const patterns = [
    /^\u8001\u677f(?:\u597d|\u60a8\u597d)?$/,
    /^(?:\u597d\u7684|\u6536\u5230)\u8001\u677f$/,
    /(?:\u79f0\u547c|\u53eb).{0,8}(?:\u8001\u677f|boss|sir|bro)/i,
    /(?:\u7528\u6237|user).{0,8}(?:\u79f0\u547c|\u53eb).{0,8}(?:\u8001\u677f|boss|sir)/i,
    /^(?:hi|hello)\s*(?:boss|sir|bro)$/i,
  ]

  return patterns.some(pattern => pattern.test(value))
}

export class ProfileLLMClassifier {
  async classify(fact: ExtractedFact): Promise<ClassifyResult> {
    if (isAddressingNoise(fact.content)) {
      const fallback = this.defaultClassify(fact)
      return {
        ...fallback,
        shouldUpdate: false,
        reason: '称呼/礼貌语噪声',
      }
    }

    if (!this.isAvailable()) {
      return this.defaultClassify(fact)
    }

    const fallback = this.defaultClassify(fact)
    const model = (process.env.ANTHROPIC_CLASSIFY_MODEL || process.env.ANTHROPIC_MODEL || '').trim()
    const result = await runClaudePrompt({
      prompt: `${CLASSIFY_PROMPT}\n\nInput JSON:\n${JSON.stringify(fact)}`,
      timeoutMs: 12_000,
      model: model || undefined,
    })

    if (!result.ok) {
      console.warn(
        `[ProfileClassifier] classify fallback: source=${result.source || 'unknown'} reason=${result.reason || 'unknown'} stderr=${(result.stderr || '').slice(0, 160)}`,
      )
      return fallback
    }

    const payload = parseJsonPayload<ClassifyPayload>(result.stdout)
    if (!payload) return fallback

    const description = normalizeWhitespace(payload.description || fallback.description)
    const key = normalizeWhitespace(payload.key || fallback.key) || fallback.key
    const section = normalizeSection(payload.section || fallback.section, fallback.section)
    const shouldUpdate = typeof payload.shouldUpdate === 'boolean'
      ? payload.shouldUpdate
      : fallback.shouldUpdate

    return {
      section,
      key: clip(key, 20),
      description: clip(description, 180),
      shouldUpdate,
      reason: clip(normalizeWhitespace(payload.reason || 'CLI 分类结果'), 120),
    }
  }

  async resolveConflict(
    oldValue: string,
    newValue: string,
    oldEvidences: string[],
    newEvidence: string
  ): Promise<ConflictResult> {
    if (!this.isAvailable()) {
      return {
        resolution: 'use_new',
        reason: 'CLI 分类器不可用，回退到最新值',
      }
    }

    const model = (process.env.ANTHROPIC_CLASSIFY_MODEL || process.env.ANTHROPIC_MODEL || '').trim()
    const result = await runClaudePrompt({
      prompt: `${CONFLICT_PROMPT}\n\nInput JSON:\n${JSON.stringify({
        oldValue,
        newValue,
        oldEvidences,
        newEvidence,
      })}`,
      timeoutMs: 12_000,
      model: model || undefined,
    })

    if (!result.ok) {
      console.warn(
        `[ProfileClassifier] conflict fallback: source=${result.source || 'unknown'} reason=${result.reason || 'unknown'} stderr=${(result.stderr || '').slice(0, 160)}`,
      )
      return {
        resolution: 'use_new',
        reason: 'CLI 冲突判定失败，回退到最新值',
      }
    }

    const payload = parseJsonPayload<ConflictPayload>(result.stdout)
    if (!payload || !payload.resolution) {
      return {
        resolution: 'use_new',
        reason: 'CLI 冲突结果无效，回退到最新值',
      }
    }

    return {
      resolution: payload.resolution,
      mergedValue: clip(normalizeWhitespace(payload.mergedValue || ''), 180) || undefined,
      reason: clip(normalizeWhitespace(payload.reason || 'CLI 冲突决策'), 120),
    }
  }

  private normalizeSectionByContent(content: string): string {
    if (/(reply|tone|style|称呼|语气|沟通|中文|英文)/i.test(content)) {
      return SECTION_COMMUNICATION_STYLE
    }
    if (/(python|typescript|javascript|java|go|rust|react|vue|node|docker|sql|postgres|mysql|技术|框架|工具)/i.test(content)) {
      return SECTION_TECH_STACK
    }
    if (/(身份|职业|项目|仓库|目录|分支|姓名|公司|角色)/i.test(content)) {
      return SECTION_PERSONAL_INFO
    }
    return SECTION_WORK_PREFERENCE
  }

  private buildKey(content: string): string {
    return clip(content.replace(/[，。,.!?！？]/g, ' ').trim(), 15)
  }

  private shouldUpdateDefault(fact: ExtractedFact): boolean {
    if (isAddressingNoise(fact.content)) return false
    return fact.confidence >= 0.6
  }

  private defaultReason(fact: ExtractedFact): string {
    if (isAddressingNoise(fact.content)) return '称呼/礼貌语噪声'
    return '规则回退'
  }

  private defaultDescription(content: string): string {
    return clip(normalizeWhitespace(content), 180)
  }

  private defaultSection(fact: ExtractedFact): string {
    const sectionMap: Record<string, string> = {
      preference: SECTION_WORK_PREFERENCE,
      fact: SECTION_PERSONAL_INFO,
      correction: SECTION_COMMUNICATION_STYLE,
      context: SECTION_WORK_PREFERENCE,
    }

    return sectionMap[fact.type] || this.normalizeSectionByContent(fact.content)
  }

  private defaultClassify(fact: ExtractedFact): ClassifyResult {
    const section = this.defaultSection(fact)
    return {
      section,
      key: this.buildKey(fact.content),
      description: this.defaultDescription(fact.content),
      shouldUpdate: this.shouldUpdateDefault(fact),
      reason: this.defaultReason(fact),
    }
  }

  isAvailable(): boolean {
    return isClaudeCliAvailable()
  }
}

export const profileLLMClassifier = new ProfileLLMClassifier()
