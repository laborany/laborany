import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DATA_DIR } from '../paths.js'
import { profileManager } from './profile/index.js'

export type AddressingSource = 'manual' | 'auto' | 'none'
export type AddressingFallbackMode = 'boss'

export interface AddressingSettings {
  preferredName: string
  fallbackMode: AddressingFallbackMode
  source: AddressingSource
  updatedAt: string | null
}

export interface AddressingPromptSection {
  title: string
  content: string
}

const ADDRESSING_DIR = join(DATA_DIR, 'memory', 'profiles')
const ADDRESSING_PATH = join(ADDRESSING_DIR, 'addressing.json')
const DEFAULT_FALLBACK_MODE: AddressingFallbackMode = 'boss'
const PROFILE_SECTION_NAME = '沟通风格'
const PROFILE_FIELD_KEY = '用户称呼'

const RESERVED_ADDRESSING_VALUES = new Set([
  '老板',
  'boss',
  'sir',
  'bro',
  '老大',
  '哥',
  '姐',
  '你',
  '您',
  '用户',
  'user',
  'assistant',
  'ai',
  '机器人',
])

const QUESTION_LIKE_ADDRESSING_VALUES = new Set([
  '什么',
  '啥',
  '谁',
  '哪个',
  '哪位',
  '哪一个',
  '什么名字',
  '啥名字',
  '谁啊',
  '叫啥',
  '叫什么',
  '称呼',
  '名字',
])

const ROLE_WORD_PATTERNS = [
  /^(?:程序员|开发|开发者|工程师|产品|产品经理|设计师|运营|老板|用户|助手|机器人|同学|老师|学生)$/i,
]

const ROLE_RELATIONSHIP_PATTERNS = [
  /^(?:你(?:的)?|我(?:的)?|他(?:的)?|她(?:的)?|咱(?:们)?(?:的)?|我们(?:的)?)(?:老板|老大|领导|上司|经理|雇主)$/i,
  /^(?:老板|老大|领导|上司|经理|雇主)(?:本人)?$/i,
]

const PURE_ADDRESSING_NOISE_PATTERNS = [
  /^\s*(?:老板好|老板您好|好的老板|收到老板|ok boss|yes sir|hi boss|hello boss)\s*$/i,
]

const META_ASSISTANT_ADDRESSING_PATTERNS = [
  /(?:用户|我).{0,8}(?:称呼|叫|喊|称作|叫做).{0,8}(?:助手|你|AI|机器人).{0,6}(?:为|成|叫)?(?:老板|老大|哥|姐|boss|sir|bro)/i,
  /(?:助手|你|AI|机器人).{0,8}(?:被|让).{0,8}(?:称呼|叫|喊|称作|叫做).{0,6}(?:老板|老大|哥|姐|boss|sir|bro)/i,
  /(?:call|address).{0,12}(?:assistant|ai).{0,8}(?:boss|sir|bro)/i,
]

const ADDRESSING_INTENT_CUE_PATTERNS = [
  /(?:叫我|称呼我|喊我|我的名字是|名字是)/i,
  /(?:call me|address me|my name is)/i,
  /^\s*我叫\s*[A-Za-z0-9\u4e00-\u9fa5·._ -]{1,20}(?:[，,。.!！？；;:：\s]|$)/i,
  /(?:^|[，,。.!！？；;:：\s])我叫\s*[A-Za-z0-9\u4e00-\u9fa5·._ -]{1,20}(?:[，,。.!！？；;:：\s]|$)/i,
]

const STRONG_ADDRESSING_SET_PATTERNS = [
  /(?:^|[，,。.!！？；;:：\s])(?:以后|之后|后面)?(?:请|麻烦)?(?:叫我|称呼我(?:为)?|喊我(?:为)?)[\s:："“”'‘’「」【\[\(]?[A-Za-z0-9\u4e00-\u9fa5·._ -]{1,20}(?:[”"’'」】\]\)]|[，,。.!！？；;:：\s]|$)/i,
  /(?:^|[，,。.!！？；;:：\s])(?:我的名字是|名字是|我叫)\s*[A-Za-z0-9\u4e00-\u9fa5·._ -]{1,20}(?:[，,。.!！？；;:：\s]|$)/i,
  /(?:^|[，,。.!！？；;:：\s])(?:call me|address me as|my name is)\s+[A-Za-z0-9\u4e00-\u9fa5·._ -]{1,20}(?:[，,。.!！？；;:：\s]|$)/i,
]

const STRONG_ADDRESSING_CAPTURE_PATTERNS = [
  /(?:^|[，,。.!！？；;:：\s])(?:以后|之后|后面)?(?:请|麻烦)?(?:叫我|称呼我(?:为)?|喊我(?:为)?)[\s:："“”'‘’「」【\[\(]*([A-Za-z0-9\u4e00-\u9fa5·._ -]{1,20})(?=[”"’'」】\]\)]*(?:[，,。.!！？；;:：\s]|$))/i,
  /(?:^|[，,。.!！？；;:：\s])(?:我的名字是|名字是|我叫)\s*([A-Za-z0-9\u4e00-\u9fa5·._ -]{1,20})(?=[，,。.!！？；;:：\s]|$)/i,
  /(?:^|[，,。.!！？；;:：\s])(?:call me|address me as|my name is)\s+([A-Za-z0-9\u4e00-\u9fa5·._ -]{1,20})(?=[，,。.!！？；;:：\s]|$)/i,
]

const ADDRESSING_META_QUERY_PATTERNS = [
  /^\s*(?:默认)?\s*你?(?:现在|目前|一般|平时|通常|默认)?(?:都)?(?:怎么|如何)?(?:称呼|叫|喊)我(?:啊|呀|呢)?[？?]?\s*$/i,
  /^\s*(?:默认)?\s*你?(?:现在|目前|一般|平时|通常|默认)?(?:都)?叫我(?:什么|啥|什么名字|啥名字)(?:啊|呀|呢)?[？?]?\s*$/i,
  /(?:(?:默认|你现在|你目前|你一般|你平时|你通常)).{0,6}(?:怎么称呼我|如何称呼我|叫我什么|叫我啥)/i,
]

function defaultSettings(): AddressingSettings {
  return {
    preferredName: '',
    fallbackMode: DEFAULT_FALLBACK_MODE,
    source: 'none',
    updatedAt: null,
  }
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function stripWrappingQuotes(text: string): string {
  return text
    .replace(/^[“”"'`‘’「」【\[\(]+/, '')
    .replace(/[“”"'`‘’」】\]\)]+$/, '')
}

function normalizePreferredNameCandidate(name: string): string {
  return stripWrappingQuotes(
    normalizeWhitespace(name)
      .replace(/^(?:叫我|称呼我(?:为)?|喊我(?:为)?|我的名字是|名字是|我叫|我是)\s*/i, '')
      .replace(/\s+(?:帮我|然后|并且|并|再|去|开始|处理|分析|看看|做|执行|安排|设置|创建|写|回复|生成).*/i, '')
      .replace(/[，。,.!！？；;:：]+$/g, '')
      .replace(/^(?:为|是)\s*/i, '')
      .replace(/\s*(?:吧|呀|啊|哦|喔|呢|哈)+$/i, '')
      .replace(/\s*(?:就行|即可|就可以|都行)$/i, '')
  )
}

function isReservedAddressingValue(name: string): boolean {
  const normalized = normalizePreferredNameCandidate(name)
  if (!normalized) return true
  return RESERVED_ADDRESSING_VALUES.has(normalized.toLowerCase()) || RESERVED_ADDRESSING_VALUES.has(normalized)
}

function isQuestionLikeAddressingValue(name: string): boolean {
  const normalized = normalizePreferredNameCandidate(name)
  if (!normalized) return true
  if (QUESTION_LIKE_ADDRESSING_VALUES.has(normalized)) return true
  return /^(?:什么|啥|谁|哪个|哪位|哪一个)(?:名字)?$/i.test(normalized)
}

function looksLikeNameCandidate(name: string, mode: 'explicit' | 'inferred'): boolean {
  const normalized = normalizePreferredNameCandidate(name)
  if (!normalized) return false
  if (normalized.length > 30) return false
  if (!/^[A-Za-z0-9\u4e00-\u9fa5·._ -]+$/.test(normalized)) return false
  if (isReservedAddressingValue(normalized)) return false
  if (isQuestionLikeAddressingValue(normalized)) return false
  if (ROLE_WORD_PATTERNS.some(pattern => pattern.test(normalized))) return false
  if (ROLE_RELATIONSHIP_PATTERNS.some(pattern => pattern.test(normalized))) return false

  if (mode === 'inferred') {
    if (/[，。,.!?！？]/.test(normalized)) return false
    if (/\b(?:喜欢|需要|正在|准备|想要|开发|写|分析|帮我)\b/i.test(normalized)) return false
    if (/[的是在用做要会能给让帮]/.test(normalized) && normalized.length > 4) return false
    if (normalized.split(/\s+/).length > 3) return false
  }

  return true
}

export function buildAddressingDescription(preferredName: string): string {
  return `默认称呼用户为「${preferredName}」`
}

export function buildAddressingPolicySection(): AddressingPromptSection {
  return {
    title: '称呼规则',
    content: [
      '- 若用户在本轮消息里明确指定了希望被如何称呼，必须立即使用该称呼。',
      '- 本轮明确指定的称呼优先级高于历史默认称呼。',
      '- 若用户只是在询问当前称呼，或在讨论他如何称呼助手，不要误判成新的称呼设置。',
    ].join('\n'),
  }
}

export function isAddressingDescription(text: string): boolean {
  return /^默认称呼用户为[「“"]?.+[」”"]?$/.test(normalizeWhitespace(text))
}

export function hasAddressingIntentCue(text: string): boolean {
  const normalized = normalizeWhitespace(text)
  if (!normalized) return false
  if (STRONG_ADDRESSING_SET_PATTERNS.some(pattern => pattern.test(normalized))) return true
  if (ADDRESSING_META_QUERY_PATTERNS.some(pattern => pattern.test(normalized))) return false
  return ADDRESSING_INTENT_CUE_PATTERNS.some(pattern => pattern.test(normalized))
}

export function isAddressingMetaQueryText(text: string): boolean {
  const normalized = normalizeWhitespace(text)
  if (!normalized) return false
  return ADDRESSING_META_QUERY_PATTERNS.some(pattern => pattern.test(normalized))
}

export function extractStrongPreferredName(text: string): string | null {
  const normalized = normalizeWhitespace(text)
  if (!normalized) return null

  for (const pattern of STRONG_ADDRESSING_CAPTURE_PATTERNS) {
    const match = normalized.match(pattern)
    const candidate = typeof match?.[1] === 'string'
      ? normalizePreferredNameCandidate(match[1])
      : ''
    if (!candidate) continue
    if (!looksLikeNameCandidate(candidate, 'explicit')) continue
    return candidate
  }

  return null
}

export function isAddressingNoiseText(text: string): boolean {
  const normalized = normalizeWhitespace(text)
  if (!normalized) return true
  return PURE_ADDRESSING_NOISE_PATTERNS.some(pattern => pattern.test(normalized))
    || META_ASSISTANT_ADDRESSING_PATTERNS.some(pattern => pattern.test(normalized))
}

function parseStoredSettings(raw: string): AddressingSettings {
  try {
    const parsed = JSON.parse(raw) as Partial<AddressingSettings>
    const preferredName = typeof parsed.preferredName === 'string'
      ? normalizePreferredNameCandidate(parsed.preferredName)
      : ''
    const source = parsed.source === 'manual' || parsed.source === 'auto' ? parsed.source : 'none'
    const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null
    return {
      preferredName: looksLikeNameCandidate(preferredName, 'explicit') ? preferredName : '',
      fallbackMode: DEFAULT_FALLBACK_MODE,
      source: preferredName ? source : 'none',
      updatedAt: preferredName ? updatedAt : null,
    }
  } catch {
    return defaultSettings()
  }
}

function validatePreferredName(name: string): string {
  const normalized = normalizePreferredNameCandidate(name)
  if (!normalized) {
    throw new Error('称呼不能为空')
  }
  if (!looksLikeNameCandidate(normalized, 'explicit')) {
    throw new Error('称呼格式无效，请使用 1-30 个字符的名字或昵称')
  }
  return normalized
}

function buildProfileEvidence(source: AddressingSource, evidence?: string): string {
  if (evidence && normalizeWhitespace(evidence)) {
    return normalizeWhitespace(evidence).slice(0, 120)
  }
  if (source === 'manual') return '手动设置默认称呼'
  return '从对话中自动学习称呼'
}

export class AddressingManager {
  get(): AddressingSettings {
    if (!existsSync(ADDRESSING_PATH)) return defaultSettings()
    const raw = readFileSync(ADDRESSING_PATH, 'utf-8')
    const parsed = parseStoredSettings(raw)
    if (!parsed.preferredName) {
      this.clear()
      return defaultSettings()
    }
    return parsed
  }

  setPreferredName(preferredName: string, source: Exclude<AddressingSource, 'none'>, evidence?: string): AddressingSettings {
    const normalized = validatePreferredName(preferredName)
    const current = this.get()
    const resolvedSource: Exclude<AddressingSource, 'none'> = current.preferredName === normalized && current.source === 'manual'
      ? 'manual'
      : source

    const next: AddressingSettings = {
      preferredName: normalized,
      fallbackMode: DEFAULT_FALLBACK_MODE,
      source: resolvedSource,
      updatedAt: new Date().toISOString(),
    }

    if (
      current.preferredName !== next.preferredName
      || current.source !== next.source
      || current.updatedAt === null
    ) {
      ensureDir(ADDRESSING_DIR)
      writeFileSync(ADDRESSING_PATH, JSON.stringify(next, null, 2), 'utf-8')
    }

    profileManager.updateField(
      PROFILE_SECTION_NAME,
      PROFILE_FIELD_KEY,
      buildAddressingDescription(normalized),
      buildProfileEvidence(resolvedSource, evidence),
      resolvedSource === 'manual' ? 1 : 0.95
    )

    return current.preferredName === next.preferredName && current.source === next.source && current.updatedAt
      ? current
      : next
  }

  clear(): AddressingSettings {
    if (existsSync(ADDRESSING_PATH)) {
      unlinkSync(ADDRESSING_PATH)
    }
    profileManager.removeField(PROFILE_SECTION_NAME, PROFILE_FIELD_KEY)
    return defaultSettings()
  }

  buildPromptSection(): AddressingPromptSection | null {
    const settings = this.get()
    if (!settings.preferredName) return null

    return {
      title: '用户称呼偏好',
      content: [
        `- 默认称呼用户为「${settings.preferredName}」。`,
        '- 若用户本轮另有明确要求，以本轮要求优先。',
      ].join('\n'),
    }
  }

  getPath(): string {
    return ADDRESSING_PATH
  }
}

export const addressingManager = new AddressingManager()
export { ADDRESSING_PATH }
