import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DATA_DIR } from '../paths.js'
import { profileManager } from './profile/index.js'
import { hasConclusionFirstPreference } from './communication-style-normalizer.js'

export type CommunicationPreferenceSource = 'manual' | 'auto' | 'none'
export type ReplyLanguage = 'zh' | 'en'
export type ReplyStyle = 'brief' | 'detailed'

export interface CommunicationPreferenceLanguageState {
  value: ReplyLanguage | ''
  source: CommunicationPreferenceSource
  updatedAt: string | null
}

export interface CommunicationPreferenceStyleState {
  value: ReplyStyle | ''
  source: CommunicationPreferenceSource
  updatedAt: string | null
}

export interface CommunicationPreferenceSettings {
  replyLanguage: CommunicationPreferenceLanguageState
  replyStyle: CommunicationPreferenceStyleState
}

export interface CommunicationPreferencePromptSection {
  title: string
  content: string
}

export interface CommunicationPreferencePatch {
  key: typeof LANGUAGE_FIELD_KEY | typeof STYLE_FIELD_KEY
  value: ReplyLanguage | ReplyStyle
  description: string
  confidence: number
}

interface CommunicationPreferenceUpdate {
  replyLanguage?: ReplyLanguage | ''
  replyStyle?: ReplyStyle | ''
}

interface ManagedFieldPatch {
  key: typeof LANGUAGE_FIELD_KEY | typeof STYLE_FIELD_KEY
  value: ReplyLanguage | ReplyStyle
  description: string
  evidence: string
  confidence: number
}

export interface ApplyCommunicationPreferenceResult {
  applied: CommunicationPreferencePatch[]
}

export interface CommunicationProfilePatchResult {
  handled: boolean
  applied: boolean
  conflict?: {
    strategy: 'keep_old'
    oldValue: string
    newValue: string
    reason: string
  }
}

const PROFILE_SECTION_NAME = '沟通风格'
const LANGUAGE_FIELD_KEY = '回复语言'
const STYLE_FIELD_KEY = '回复风格'
const COMMUNICATION_PREFERENCES_DIR = join(DATA_DIR, 'memory', 'profiles')
const COMMUNICATION_PREFERENCES_PATH = join(COMMUNICATION_PREFERENCES_DIR, 'communication-preferences.json')

const LONG_TERM_CUE_PATTERNS = [
  /(?:以后|后续|之后|平时|默认|长期|一直|往后)/i,
  /(?:以后都|后续都|默认都|平时都)/i,
]

const LANGUAGE_ZH_PATTERNS = [
  /(?:用中文(?:回复|回答|沟通|交流)?|中文(?:回复|回答|沟通|交流)|chinese(?: reply| response)?)/i,
]

const LANGUAGE_EN_PATTERNS = [
  /(?:用英文(?:回复|回答|沟通|交流)?|英文(?:回复|回答|沟通|交流)|english(?: reply| response)?)/i,
]

const BRIEF_STYLE_PATTERNS = [
  /(?:回复|回答|说明|解释|输出|沟通).{0,8}(?:简洁|简短|精简|短一点)/i,
  /(?:简洁|简短|精简|短一点).{0,8}(?:回复|回答|说明|解释|输出|沟通)/i,
]

const DETAILED_STYLE_PATTERNS = [
  /(?:回复|回答|说明|解释|输出|沟通).{0,8}(?:详细|展开|具体|多一点细节)/i,
  /(?:详细|展开|具体|多一点细节).{0,8}(?:回复|回答|说明|解释|输出|沟通)/i,
]

function emptyLanguageState(): CommunicationPreferenceLanguageState {
  return {
    value: '',
    source: 'none',
    updatedAt: null,
  }
}

function emptyStyleState(): CommunicationPreferenceStyleState {
  return {
    value: '',
    source: 'none',
    updatedAt: null,
  }
}

function defaultSettings(): CommunicationPreferenceSettings {
  return {
    replyLanguage: emptyLanguageState(),
    replyStyle: emptyStyleState(),
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

function hasLongTermCue(text: string): boolean {
  return LONG_TERM_CUE_PATTERNS.some(pattern => pattern.test(text))
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text))
}

function buildEvidence(userText: string): string {
  return normalizeWhitespace(userText).slice(0, 120)
}

function normalizeSource(value: unknown): CommunicationPreferenceSource {
  return value === 'manual' || value === 'auto' ? value : 'none'
}

function normalizeLanguageInput(value: string): ReplyLanguage | '' {
  const normalized = normalizeWhitespace(value).toLowerCase()
  if (!normalized) return ''
  if (normalized === 'zh' || normalized === '中文' || normalized === 'chinese') return 'zh'
  if (normalized === 'en' || normalized === '英文' || normalized === 'english') return 'en'
  return ''
}

function normalizeStyleInput(value: string): ReplyStyle | '' {
  const normalized = normalizeWhitespace(value).toLowerCase()
  if (!normalized) return ''
  if (normalized === 'brief' || normalized === '简洁' || normalized === '简短') return 'brief'
  if (normalized === 'detailed' || normalized === '详细') return 'detailed'
  return ''
}

function inferLanguageFromText(text: string): ReplyLanguage | '' {
  const normalized = normalizeWhitespace(text)
  if (!normalized) return ''

  const directValue = normalizeLanguageInput(normalized)
  if (directValue) return directValue

  const wantsChinese = includesAny(normalized, LANGUAGE_ZH_PATTERNS)
  const wantsEnglish = includesAny(normalized, LANGUAGE_EN_PATTERNS)
  if (wantsChinese === wantsEnglish) return ''
  return wantsChinese ? 'zh' : 'en'
}

function inferStyleFromText(text: string): ReplyStyle | '' {
  const normalized = normalizeWhitespace(text)
  if (!normalized) return ''
  if (hasConclusionFirstPreference(normalized)) return ''

  const directValue = normalizeStyleInput(normalized)
  if (directValue) return directValue

  const wantsBrief = includesAny(normalized, BRIEF_STYLE_PATTERNS)
  const wantsDetailed = includesAny(normalized, DETAILED_STYLE_PATTERNS)
  if (wantsBrief === wantsDetailed) return ''
  return wantsBrief ? 'brief' : 'detailed'
}

function buildLanguageDescription(value: ReplyLanguage): string {
  return value === 'zh' ? '默认使用中文回复' : '默认使用英文回复'
}

function buildStyleDescription(value: ReplyStyle): string {
  return value === 'brief' ? '偏好简洁回复' : '偏好详细回复'
}

function buildDescriptionForPatch(patch: CommunicationPreferencePatch): string {
  if (patch.key === LANGUAGE_FIELD_KEY) {
    return buildLanguageDescription(patch.value as ReplyLanguage)
  }
  return buildStyleDescription(patch.value as ReplyStyle)
}

function sameLanguageState(
  left: CommunicationPreferenceLanguageState,
  right: CommunicationPreferenceLanguageState,
): boolean {
  return left.value === right.value && left.source === right.source && left.updatedAt === right.updatedAt
}

function sameStyleState(
  left: CommunicationPreferenceStyleState,
  right: CommunicationPreferenceStyleState,
): boolean {
  return left.value === right.value && left.source === right.source && left.updatedAt === right.updatedAt
}

function sameSettings(left: CommunicationPreferenceSettings, right: CommunicationPreferenceSettings): boolean {
  return sameLanguageState(left.replyLanguage, right.replyLanguage)
    && sameStyleState(left.replyStyle, right.replyStyle)
}

function sanitizeLanguageState(raw: unknown): CommunicationPreferenceLanguageState {
  if (!raw || typeof raw !== 'object') return emptyLanguageState()
  const candidate = raw as Partial<CommunicationPreferenceLanguageState>
  const value = typeof candidate.value === 'string' ? normalizeLanguageInput(candidate.value) : ''
  if (!value) return emptyLanguageState()
  return {
    value,
    source: normalizeSource(candidate.source),
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : null,
  }
}

function sanitizeStyleState(raw: unknown): CommunicationPreferenceStyleState {
  if (!raw || typeof raw !== 'object') return emptyStyleState()
  const candidate = raw as Partial<CommunicationPreferenceStyleState>
  const value = typeof candidate.value === 'string' ? normalizeStyleInput(candidate.value) : ''
  if (!value) return emptyStyleState()
  return {
    value,
    source: normalizeSource(candidate.source),
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : null,
  }
}

function parseStoredSettings(raw: string): CommunicationPreferenceSettings {
  try {
    const parsed = JSON.parse(raw) as Partial<CommunicationPreferenceSettings>
    return {
      replyLanguage: sanitizeLanguageState(parsed.replyLanguage),
      replyStyle: sanitizeStyleState(parsed.replyStyle),
    }
  } catch {
    return defaultSettings()
  }
}

function cloneSettings(settings: CommunicationPreferenceSettings): CommunicationPreferenceSettings {
  return {
    replyLanguage: { ...settings.replyLanguage },
    replyStyle: { ...settings.replyStyle },
  }
}

function buildProfileEvidence(
  key: typeof LANGUAGE_FIELD_KEY | typeof STYLE_FIELD_KEY,
  source: Exclude<CommunicationPreferenceSource, 'none'>,
  evidence?: string,
): string {
  if (evidence && normalizeWhitespace(evidence)) {
    return buildEvidence(evidence)
  }

  if (source === 'manual') {
    return key === LANGUAGE_FIELD_KEY ? '手动设置默认回复语言' : '手动设置默认回复风格'
  }

  return key === LANGUAGE_FIELD_KEY ? '从对话中自动学习默认回复语言' : '从对话中自动学习默认回复风格'
}

function hasAnyPreference(settings: CommunicationPreferenceSettings): boolean {
  return Boolean(settings.replyLanguage.value || settings.replyStyle.value)
}

function buildFieldState(
  key: typeof LANGUAGE_FIELD_KEY | typeof STYLE_FIELD_KEY,
  value: ReplyLanguage | ReplyStyle | '',
  source: Exclude<CommunicationPreferenceSource, 'none'>,
  updatedAt: string,
): CommunicationPreferenceLanguageState | CommunicationPreferenceStyleState {
  if (!value) {
    return key === LANGUAGE_FIELD_KEY ? emptyLanguageState() : emptyStyleState()
  }

  return {
    value,
    source,
    updatedAt,
  }
}

function getManualValidationError(fieldName: 'replyLanguage' | 'replyStyle'): string {
  return fieldName === 'replyLanguage' ? '回复语言参数无效' : '回复风格参数无效'
}

export function isManagedCommunicationProfileField(sectionName: string, key: string): boolean {
  if (sectionName !== PROFILE_SECTION_NAME) return false
  return key === LANGUAGE_FIELD_KEY || key === STYLE_FIELD_KEY
}

export function extractStrongCommunicationPreferencePatches(userText: string): CommunicationPreferencePatch[] {
  const normalized = normalizeWhitespace(userText)
  if (!normalized || !hasLongTermCue(normalized)) return []

  const patches: CommunicationPreferencePatch[] = []

  const language = inferLanguageFromText(normalized)
  if (language) {
    patches.push({
      key: LANGUAGE_FIELD_KEY,
      value: language,
      description: buildLanguageDescription(language),
      confidence: 0.98,
    })
  }

  const style = inferStyleFromText(normalized)
  if (style) {
    patches.push({
      key: STYLE_FIELD_KEY,
      value: style,
      description: buildStyleDescription(style),
      confidence: 0.96,
    })
  }

  return patches
}

export class CommunicationPreferenceManager {
  private readonly recentApplications = new Map<string, number>()
  private readonly dedupeTtlMs = 60_000

  private pruneExpired(now: number): void {
    for (const [key, expiresAt] of this.recentApplications.entries()) {
      if (expiresAt > now) continue
      this.recentApplications.delete(key)
    }
  }

  private writeSettings(settings: CommunicationPreferenceSettings): void {
    if (!hasAnyPreference(settings)) {
      if (existsSync(COMMUNICATION_PREFERENCES_PATH)) {
        unlinkSync(COMMUNICATION_PREFERENCES_PATH)
      }
      return
    }

    ensureDir(COMMUNICATION_PREFERENCES_DIR)
    writeFileSync(COMMUNICATION_PREFERENCES_PATH, JSON.stringify(settings, null, 2), 'utf-8')
  }

  private hydrateFromProfile(settings: CommunicationPreferenceSettings): CommunicationPreferenceSettings {
    const next = cloneSettings(settings)
    const profile = profileManager.get()
    const profileUpdatedAt = profile.updatedAt instanceof Date ? profile.updatedAt.toISOString() : null
    const profileFields = profileManager.getSection(PROFILE_SECTION_NAME)

    for (const field of profileFields) {
      if (field.key === LANGUAGE_FIELD_KEY && !next.replyLanguage.value) {
        const inferred = inferLanguageFromText(field.description || field.value || '')
        if (inferred) {
          next.replyLanguage = {
            value: inferred,
            source: 'auto',
            updatedAt: profileUpdatedAt,
          }
        }
      }

      if (field.key === STYLE_FIELD_KEY && !next.replyStyle.value) {
        const inferred = inferStyleFromText(field.description || field.value || '')
        if (inferred) {
          next.replyStyle = {
            value: inferred,
            source: 'auto',
            updatedAt: profileUpdatedAt,
          }
        }
      }
    }

    return next
  }

  private syncProfileField(patch: ManagedFieldPatch, source: Exclude<CommunicationPreferenceSource, 'none'>): void {
    profileManager.updateField(
      PROFILE_SECTION_NAME,
      patch.key,
      patch.description,
      buildProfileEvidence(patch.key, source, patch.evidence),
      patch.confidence,
    )
  }

  private removeProfileField(key: typeof LANGUAGE_FIELD_KEY | typeof STYLE_FIELD_KEY): void {
    profileManager.removeField(PROFILE_SECTION_NAME, key)
  }

  private buildCurrentDescription(
    key: typeof LANGUAGE_FIELD_KEY | typeof STYLE_FIELD_KEY,
    settings: CommunicationPreferenceSettings,
  ): string {
    if (key === LANGUAGE_FIELD_KEY) {
      return settings.replyLanguage.value ? buildLanguageDescription(settings.replyLanguage.value) : ''
    }
    return settings.replyStyle.value ? buildStyleDescription(settings.replyStyle.value) : ''
  }

  get(): CommunicationPreferenceSettings {
    const stored = existsSync(COMMUNICATION_PREFERENCES_PATH)
      ? parseStoredSettings(readFileSync(COMMUNICATION_PREFERENCES_PATH, 'utf-8'))
      : defaultSettings()

    const hydrated = this.hydrateFromProfile(stored)
    if (!sameSettings(stored, hydrated)) {
      this.writeSettings(hydrated)
    }
    return hydrated
  }

  setManualPreferences(update: CommunicationPreferenceUpdate): CommunicationPreferenceSettings {
    const current = this.get()
    const next = cloneSettings(current)
    const changedPatches: ManagedFieldPatch[] = []
    const clearedKeys: Array<typeof LANGUAGE_FIELD_KEY | typeof STYLE_FIELD_KEY> = []
    const updatedAt = new Date().toISOString()

    if (update.replyLanguage !== undefined) {
      const value = update.replyLanguage
      if (value !== '' && value !== 'zh' && value !== 'en') {
        throw new Error(getManualValidationError('replyLanguage'))
      }

      const nextState = buildFieldState(LANGUAGE_FIELD_KEY, value, 'manual', updatedAt) as CommunicationPreferenceLanguageState
      if (!sameLanguageState(current.replyLanguage, nextState)) {
        next.replyLanguage = nextState
        if (value) {
          changedPatches.push({
            key: LANGUAGE_FIELD_KEY,
            value,
            description: buildLanguageDescription(value),
            evidence: '手动设置默认回复语言',
            confidence: 1,
          })
        } else {
          clearedKeys.push(LANGUAGE_FIELD_KEY)
        }
      }
    }

    if (update.replyStyle !== undefined) {
      const value = update.replyStyle
      if (value !== '' && value !== 'brief' && value !== 'detailed') {
        throw new Error(getManualValidationError('replyStyle'))
      }

      const nextState = buildFieldState(STYLE_FIELD_KEY, value, 'manual', updatedAt) as CommunicationPreferenceStyleState
      if (!sameStyleState(current.replyStyle, nextState)) {
        next.replyStyle = nextState
        if (value) {
          changedPatches.push({
            key: STYLE_FIELD_KEY,
            value,
            description: buildStyleDescription(value),
            evidence: '手动设置默认回复风格',
            confidence: 1,
          })
        } else {
          clearedKeys.push(STYLE_FIELD_KEY)
        }
      }
    }

    if (sameSettings(current, next)) {
      return current
    }

    this.writeSettings(next)
    for (const key of clearedKeys) {
      this.removeProfileField(key)
    }
    for (const patch of changedPatches) {
      this.syncProfileField(patch, 'manual')
    }

    return next
  }

  clear(): CommunicationPreferenceSettings {
    if (existsSync(COMMUNICATION_PREFERENCES_PATH)) {
      unlinkSync(COMMUNICATION_PREFERENCES_PATH)
    }
    this.removeProfileField(LANGUAGE_FIELD_KEY)
    this.removeProfileField(STYLE_FIELD_KEY)
    return defaultSettings()
  }

  buildPromptSection(): CommunicationPreferencePromptSection | null {
    const settings = this.get()
    const lines: string[] = []

    if (settings.replyLanguage.value === 'zh') {
      lines.push('- 默认使用中文回复用户。')
    } else if (settings.replyLanguage.value === 'en') {
      lines.push('- 默认使用英文回复用户。')
    }

    if (settings.replyStyle.value === 'brief') {
      lines.push('- 默认尽量简洁回复。')
    } else if (settings.replyStyle.value === 'detailed') {
      lines.push('- 默认尽量详细回复。')
    }

    if (lines.length === 0) return null

    lines.push('- 若用户本轮另有明确要求，以本轮要求优先。')
    return {
      title: '默认回复偏好',
      content: lines.join('\n'),
    }
  }

  applyFromUserText(userText: string, evidenceText?: string): ApplyCommunicationPreferenceResult {
    const normalized = normalizeWhitespace(userText)
    if (!normalized) return { applied: [] }

    const patches = extractStrongCommunicationPreferencePatches(normalized)
    if (patches.length === 0) return { applied: [] }

    const now = Date.now()
    this.pruneExpired(now)

    const current = this.get()
    const next = cloneSettings(current)
    const evidence = buildEvidence(evidenceText || normalized)
    const applied: CommunicationPreferencePatch[] = []

    for (const patch of patches) {
      const dedupeKey = `${patch.key}\u0000${patch.description}\u0000${evidence}`
      if (this.recentApplications.has(dedupeKey)) continue

      if (patch.key === LANGUAGE_FIELD_KEY) {
        const nextState = buildFieldState(LANGUAGE_FIELD_KEY, patch.value, 'auto', new Date().toISOString()) as CommunicationPreferenceLanguageState
        if (!sameLanguageState(next.replyLanguage, nextState)) {
          next.replyLanguage = nextState
          applied.push(patch)
        }
      } else {
        const nextState = buildFieldState(STYLE_FIELD_KEY, patch.value, 'auto', new Date().toISOString()) as CommunicationPreferenceStyleState
        if (!sameStyleState(next.replyStyle, nextState)) {
          next.replyStyle = nextState
          applied.push(patch)
        }
      }

      this.recentApplications.set(dedupeKey, now + this.dedupeTtlMs)
    }

    if (applied.length === 0) {
      return { applied: [] }
    }

    this.writeSettings(next)
    for (const patch of applied) {
      this.syncProfileField(
        {
          key: patch.key,
          value: patch.value,
          description: buildDescriptionForPatch(patch),
          evidence,
          confidence: patch.confidence,
        },
        'auto',
      )
    }

    return { applied }
  }

  applyProfilePatch(params: {
    section: string
    key: string
    value: string
    evidence: string
    confidence: number
  }): CommunicationProfilePatchResult {
    const { section, key, value, evidence, confidence } = params
    if (!isManagedCommunicationProfileField(section, key)) {
      return { handled: false, applied: false }
    }

    const current = this.get()
    const normalized = key === LANGUAGE_FIELD_KEY ? inferLanguageFromText(value) : inferStyleFromText(value)
    if (!normalized) {
      return { handled: false, applied: false }
    }

    if (key === LANGUAGE_FIELD_KEY) {
      if (current.replyLanguage.source === 'manual'
        && current.replyLanguage.value
        && current.replyLanguage.value !== normalized) {
        return {
          handled: true,
          applied: false,
          conflict: {
            strategy: 'keep_old',
            oldValue: buildLanguageDescription(current.replyLanguage.value),
            newValue: value,
            reason: '手动设置优先，忽略自动提取的回复语言更新',
          },
        }
      }

      const nextState = buildFieldState(
        LANGUAGE_FIELD_KEY,
        normalized,
        'auto',
        new Date().toISOString(),
      ) as CommunicationPreferenceLanguageState

      if (sameLanguageState(current.replyLanguage, nextState)) {
        return { handled: true, applied: false }
      }

      const next = cloneSettings(current)
      next.replyLanguage = nextState
      this.writeSettings(next)
      this.syncProfileField(
        {
          key: LANGUAGE_FIELD_KEY,
          value: normalized as ReplyLanguage,
          description: buildLanguageDescription(normalized as ReplyLanguage),
          evidence,
          confidence,
        },
        'auto',
      )
      return { handled: true, applied: true }
    }

    if (current.replyStyle.source === 'manual'
      && current.replyStyle.value
      && current.replyStyle.value !== normalized) {
      return {
        handled: true,
        applied: false,
        conflict: {
          strategy: 'keep_old',
          oldValue: buildStyleDescription(current.replyStyle.value),
          newValue: value,
          reason: '手动设置优先，忽略自动提取的回复风格更新',
        },
      }
    }

    const nextState = buildFieldState(
      STYLE_FIELD_KEY,
      normalized,
      'auto',
      new Date().toISOString(),
    ) as CommunicationPreferenceStyleState

    if (sameStyleState(current.replyStyle, nextState)) {
      return { handled: true, applied: false }
    }

    const next = cloneSettings(current)
    next.replyStyle = nextState
    this.writeSettings(next)
    this.syncProfileField(
      {
        key: STYLE_FIELD_KEY,
        value: normalized as ReplyStyle,
        description: buildStyleDescription(normalized as ReplyStyle),
        evidence,
        confidence,
      },
      'auto',
    )
    return { handled: true, applied: true }
  }

  getCurrentDescriptionForKey(key: typeof LANGUAGE_FIELD_KEY | typeof STYLE_FIELD_KEY): string {
    return this.buildCurrentDescription(key, this.get())
  }

  getPath(): string {
    return COMMUNICATION_PREFERENCES_PATH
  }
}

export const communicationPreferenceManager = new CommunicationPreferenceManager()
export { COMMUNICATION_PREFERENCES_PATH }
