/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     多轮对话端点 - Converse Router                      ║
 * ║                                                                        ║
 * ║  职责：与用户多轮对话，理解任务 → 匹配能力 → 发出决策                   ║
 * ║  设计：复用 executeAgent（Claude Code CLI），统一执行链路               ║
 * ║  关键：只负责「对话+决策」，不负责执行                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Router, Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { existsSync, rmSync } from 'fs'
import { join } from 'path'
import { executeAgent } from '../agent-executor.js'
import { buildConverseSystemPrompt, type ConverseRuntimeContext } from '../converse-prompt.js'
import { planConverseWidgetRuntime } from '../generative-ui/runtime.js'
import { memoryInjector } from '../memory/io.js'
import { memoryAsyncQueue } from '../memory/index.js'
import {
  addressingManager,
  extractStrongPreferredName,
  isAddressingMetaQueryText,
} from '../memory/addressing-manager.js'
import { addressingCliExtractor } from '../memory/addressing-extractor.js'
import {
  communicationPreferenceManager,
  extractStrongCommunicationPreferencePatches,
} from '../memory/communication-preferences.js'
import { normalizeCommunicationStylePreference } from '../memory/communication-style-normalizer.js'
import { loadCatalog } from '../catalog.js'
import { TASKS_DIR, UPLOADS_DIR } from '../paths.js'
import { resolveModelProfile } from '../lib/resolve-model-profile.js'
import {
  extractAttachmentIdsFromText,
  hydrateAttachmentsToTaskDir,
  normalizeAttachmentIds,
  resolveGenerativeWidgetSupport,
  type Skill,
} from 'laborany-shared'

const router = Router()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     SSE 工具函数                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function sseWrite(res: Response, event: string, data: unknown): void {
  if (res.writableEnded || res.destroyed) return
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  } catch {
    // 客户端断开后继续执行后台任务，SSE 写入失败时忽略
  }
}

const ACTION_MARKER_CLEAN_RE = /LABORANY_ACTION:\s*\{[\s\S]*?\}\s*$/gm

function getSrcApiBaseUrl(): string {
  return (process.env.SRC_API_BASE_URL || 'http://127.0.0.1:3620/api').replace(/\/+$/, '')
}

type ExternalSessionStatus = 'running' | 'waiting_input' | 'completed' | 'failed' | 'stopped' | 'aborted'
type ConverseMessageKind =
  | 'user'
  | 'assistant_reply'
  | 'decision_reply'
  | 'action_summary'
  | 'question_summary'
  | 'rule_reply'
  | 'error'

interface ConverseMessageMeta {
  sessionMode: 'converse'
  messageKind: ConverseMessageKind
  turnId: string
  replyToMessageId?: number | null
  variantGroupId?: string | null
  variantIndex?: number | null
  source: 'user' | 'llm' | 'rule'
  capabilities: {
    canCopy: boolean
    canRegenerate: boolean
  }
  widget?: { widgetId: string; title: string; html: string; status: string }
}

interface StoredConverseMessage {
  id: number
  type: string
  content?: string | null
  toolName?: string | null
  toolInput?: Record<string, unknown> | null
  toolResult?: string | null
  meta?: ConverseMessageMeta | null
  createdAt?: string
}

interface StoredConverseSessionDetail {
  skill_id?: string
  messages?: StoredConverseMessage[]
  sourceMeta?: {
    attachmentIds?: string[] | string
    modelProfileId?: string
  } | null
}

interface RegenerateContextMessage {
  role: 'user' | 'assistant'
  content: string
}

function stripActionMarkers(text: string): string {
  return text.replace(ACTION_MARKER_CLEAN_RE, '').trim()
}

function buildConverseMessageMeta({
  kind,
  turnId,
  source,
  replyToMessageId = null,
  canRegenerate = false,
}: {
  kind: ConverseMessageKind
  turnId: string
  source: 'user' | 'llm' | 'rule'
  replyToMessageId?: number | null
  canRegenerate?: boolean
}): ConverseMessageMeta {
  const supportsVariants = kind === 'assistant_reply'
  return {
    sessionMode: 'converse',
    messageKind: kind,
    turnId,
    replyToMessageId,
    variantGroupId: supportsVariants ? `turn:${turnId}` : null,
    variantIndex: supportsVariants ? 0 : null,
    source,
    capabilities: {
      canCopy: true,
      canRegenerate,
    },
  }
}

function buildQuestionSummary(payload: ConverseQuestionPayload): string {
  const lines: string[] = []
  for (const q of payload.questions) {
    const header = q.header?.trim() || '需要补充信息'
    const question = q.question?.trim() || ''
    lines.push(`${header}: ${question}`.trim())
  }
  return lines.filter(Boolean).join('\n')
}

function buildConverseRegenerateSystemPrompt(memoryContext: string): string {
  const sections = [
    '# laborany 对话回复重做助手',
    '',
    '你的职责是基于给定的对话 transcript，为最后一条用户消息重新生成一版自然语言回复。',
    '',
    '必须遵守：',
    '- 只输出回复正文，不要输出 LABORANY_ACTION、JSON、工具调用或系统说明。',
    '- 不要假装执行技能、命令、文件操作或搜索网页。',
    '- 如果 transcript 中存在称呼、语言、风格偏好，继续遵守。',
    '- 这是一版新的回复，但不要提及“重做”“版本”“上一版回答”。',
    '- 若信息确实不足，可以简洁说明缺少什么，但不要调用 AskUserQuestion。',
  ]

  if (memoryContext) {
    sections.push('', '## 用户记忆', '', memoryContext)
  }

  return sections.join('\n')
}

function buildConverseRegenerateQuery(messages: RegenerateContextMessage[]): string {
  const transcript = messages
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}:\n${message.content.trim()}`)
    .join('\n\n')

  return [
    '以下是当前对话在本轮回复前的上下文。',
    '请基于这些上下文，对最后一条 User 消息给出一版新的直接回复。',
    '',
    '[Conversation Transcript]',
    transcript,
  ].join('\n')
}

async function fetchStoredConverseSession(sessionId: string): Promise<StoredConverseSessionDetail | null> {
  try {
    const response = await fetch(`${getSrcApiBaseUrl()}/sessions/${encodeURIComponent(sessionId)}`)
    if (!response.ok) return null
    return await response.json() as StoredConverseSessionDetail
  } catch {
    return null
  }
}

function getLatestConverseUserTurnId(messages: StoredConverseMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.type !== 'user') continue
    const turnId = message.meta?.turnId?.trim()
    if (turnId) return turnId
  }
  return null
}

function summarizeAction(action: ConverseActionPayload): string {
  if (action.action === 'recommend_capability') {
    return `已匹配到技能 ${action.targetId}，可进入执行。`
  }
  if (action.action === 'execute_generic') {
    return '已切换到通用执行模式。'
  }
  if (action.action === 'create_capability') {
    return '将进入创建新技能流程。'
  }
  if (action.action === 'setup_schedule') {
    return '已识别为定时任务，进入创建流程。'
  }
  return `准备发送文件：${action.filePaths.join(', ')}`
}

function withAttachmentIds<T extends object>(
  payload: T,
  attachmentIds: string[],
): T & { attachmentIds: string[] } {
  return {
    ...payload,
    attachmentIds,
  }
}

const ADDRESSING_TASK_INTENT_PATTERNS = [
  /帮我|帮忙|看下|看看|处理|分析|执行|生成|创建|修复|写|做|安排|搜索|查询|翻译|总结|解释|排查|报错|问题/i,
]

function hasNonAddressingTaskIntent(text: string): boolean {
  return ADDRESSING_TASK_INTENT_PATTERNS.some(pattern => pattern.test(text))
}

function buildCommunicationPreferenceReply(descriptions: string[]): string {
  const parts = descriptions.map((description) => {
    if (description === '默认使用中文回复') return '默认用中文回复你'
    if (description === '默认使用英文回复') return '默认用英文回复你'
    if (description === '偏好简洁回复') return '尽量简洁回复'
    if (description === '偏好详细回复') return '尽量详细回复'
    return description
  })

  if (parts.length === 1) {
    return `好的，后续我会${parts[0]}。`
  }

  const [first, ...rest] = parts
  return `好的，后续我会${first}，并${rest.join('，')}。`
}

function buildDirectMetaReply(userText: string): string | null {
  const strongPreferredName = extractStrongPreferredName(userText)
  const currentPreferredName = strongPreferredName || addressingManager.get().preferredName
  const isMetaQuery = isAddressingMetaQueryText(userText)
  const communicationPatches = extractStrongCommunicationPreferencePatches(userText)
  const communicationStructurePreference = normalizeCommunicationStylePreference(userText)
  const hasTaskIntent = hasNonAddressingTaskIntent(userText)

  if (isMetaQuery && currentPreferredName) {
    return `${currentPreferredName}。`
  }

  if (isMetaQuery) {
    return '你还没有设置专属称呼，我目前会先按默认方式称呼你。'
  }

  if (hasTaskIntent) {
    return null
  }

  if (strongPreferredName && communicationPatches.length > 0) {
    return `${currentPreferredName}，${buildCommunicationPreferenceReply(communicationPatches.map(patch => patch.description)).replace(/^好的，/, '')}`
  }

  if (strongPreferredName && communicationStructurePreference) {
    return `好的，${strongPreferredName}。`
  }

  if (strongPreferredName) {
    return `好的，${strongPreferredName}。`
  }

  if (communicationPatches.length > 0) {
    return buildCommunicationPreferenceReply(communicationPatches.map(patch => patch.description))
  }

  return null
}

async function upsertExternalSession(
  sessionId: string,
  query: string,
  status: ExternalSessionStatus = 'running',
  sourceMeta?: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${getSrcApiBaseUrl()}/sessions/external/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        query,
        status,
        skillId: '__converse__',
        source: 'converse',
        sourceMeta,
      }),
    })
  } catch (err) {
    console.warn('[Converse] failed to upsert external session:', err)
  }
}

router.post('/regenerate', async (req: Request, res: Response) => {
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : ''
  const targetMessageId = Number(req.body?.messageId)
  const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : []
  const requestedModelProfileId = typeof req.body?.modelProfileId === 'string'
    ? req.body.modelProfileId.trim()
    : ''

  const contextMessages = rawMessages
    .map((item: unknown) => {
      if (!item || typeof item !== 'object') return null
      const candidate = item as Record<string, unknown>
      const role = candidate.role === 'user' || candidate.role === 'assistant' ? candidate.role : null
      const content = typeof candidate.content === 'string' ? candidate.content.trim() : ''
      if (!role || !content) return null
      return { role, content } satisfies RegenerateContextMessage
    })
    .filter(Boolean) as RegenerateContextMessage[]

  if (!sessionId || !Number.isFinite(targetMessageId) || targetMessageId <= 0) {
    res.status(400).json({ error: '缺少有效的 sessionId 或 messageId' })
    return
  }

  if (contextMessages.length === 0 || contextMessages[contextMessages.length - 1]?.role !== 'user') {
    res.status(400).json({ error: '缺少有效的对话上下文，且最后一条必须是用户消息' })
    return
  }

  const storedSession = await fetchStoredConverseSession(sessionId)
  if (!storedSession || storedSession.skill_id !== '__converse__') {
    res.status(404).json({ error: '未找到可重做的 converse 会话' })
    return
  }

  const storedMessages = Array.isArray(storedSession.messages) ? storedSession.messages : []
  const targetMessage = storedMessages.find((message) => message.id === targetMessageId)
  if (!targetMessage || targetMessage.type !== 'assistant' || targetMessage.meta?.messageKind !== 'assistant_reply') {
    res.status(400).json({ error: '当前仅支持重做最新一轮的普通 AI 回复' })
    return
  }

  const targetTurnId = targetMessage.meta?.turnId?.trim()
  if (!targetTurnId) {
    res.status(400).json({ error: '该消息缺少 turnId，暂不支持重做' })
    return
  }

  const latestTurnId = getLatestConverseUserTurnId(storedMessages)
  if (!latestTurnId || latestTurnId !== targetTurnId) {
    res.status(400).json({ error: '当前仅支持重做最后一轮回复' })
    return
  }

  const replyToMessage = storedMessages.find((message) => message.type === 'user' && message.meta?.turnId === targetTurnId)
  if (!replyToMessage?.id) {
    res.status(400).json({ error: '未找到该回复对应的用户消息' })
    return
  }

  const variantGroupId = targetMessage.meta?.variantGroupId?.trim() || `turn:${targetTurnId}`
  const variantMessages = storedMessages.filter((message) =>
    message.type === 'assistant'
    && message.meta?.messageKind === 'assistant_reply'
    && (message.meta?.variantGroupId?.trim() || `turn:${message.meta?.turnId || ''}`) === variantGroupId,
  )
  const nextVariantIndex = variantMessages.reduce((max, message) => {
    const candidate = Number(message.meta?.variantIndex)
    return Number.isFinite(candidate) ? Math.max(max, candidate) : max
  }, -1) + 1

  const attachmentIds = normalizeAttachmentIds(storedSession.sourceMeta?.attachmentIds)
  const effectiveModelProfileId = requestedModelProfileId || storedSession.sourceMeta?.modelProfileId || ''
  const modelOverride = await resolveModelProfile(effectiveModelProfileId || undefined)

  const tempRunId = `${sessionId}-regen-${randomUUID()}`
  const taskDir = join(TASKS_DIR, tempRunId)
  let regeneratedText = ''
  let regeneratedError = ''

  try {
    const uploadedFiles = await hydrateUploadsToTaskDir(attachmentIds, taskDir)
    const transcriptQuery = buildConverseRegenerateQuery(contextMessages)
    const query = buildConverseQuery(transcriptQuery, uploadedFiles)
    const lastUserMessage = contextMessages[contextMessages.length - 1]?.content || transcriptQuery
    const memoryCtx = memoryInjector.buildContext({
      skillId: '__converse__',
      userQuery: lastUserMessage,
    })

    const skill = {
      meta: { id: '__converse__', name: '对话助手重做', description: '重做首页对话回复', kind: 'skill' as const },
      systemPrompt: buildConverseRegenerateSystemPrompt(memoryCtx),
      scriptsDir: '',
      tools: [],
    } as Skill

    await executeAgent({
      skill,
      query,
      sessionId: tempRunId,
      signal: new AbortController().signal,
      modelOverride,
      onEvent: (event) => {
        if (event.type === 'text' && event.content) {
          regeneratedText += event.content
        }

        if (event.type === 'error' && event.content) {
          regeneratedError = event.content
        }
      },
    })

    const cleanedText = stripActionMarkers(regeneratedText).trim()
    if (regeneratedError && !cleanedText) {
      throw new Error(regeneratedError)
    }
    if (!cleanedText) {
      throw new Error('未生成新的回复内容')
    }

    const meta: ConverseMessageMeta = {
      sessionMode: 'converse',
      messageKind: 'assistant_reply',
      turnId: targetTurnId,
      replyToMessageId: replyToMessage.id,
      variantGroupId,
      variantIndex: nextVariantIndex,
      source: 'llm',
      capabilities: {
        canCopy: true,
        canRegenerate: true,
      },
    }

    const messageId = await appendExternalMessage(sessionId, 'assistant', cleanedText, meta)
    if (!messageId) {
      throw new Error('保存重做结果失败')
    }

    await updateExternalSessionStatus(sessionId, 'completed')
    res.json({
      success: true,
      message: {
        id: messageId,
        type: 'assistant',
        content: cleanedText,
        meta,
        createdAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '重做失败'
    res.status(500).json({ error: message })
  } finally {
    if (existsSync(taskDir)) {
      rmSync(taskDir, { recursive: true, force: true })
    }
  }
})

async function appendExternalMessage(
  sessionId: string,
  type: 'user' | 'assistant' | 'error' | 'system',
  content: string,
  meta?: ConverseMessageMeta,
): Promise<number | null> {
  const text = content.trim()
  if (!text) return null
  try {
    const response = await fetch(`${getSrcApiBaseUrl()}/sessions/external/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, type, content: text, meta }),
    })
    if (!response.ok) return null
    const data = await response.json().catch(() => ({})) as { messageId?: unknown }
    return typeof data.messageId === 'number' ? data.messageId : null
  } catch (err) {
    console.warn('[Converse] failed to append external message:', err)
    return null
  }
}

async function updateExternalSessionStatus(
  sessionId: string,
  status: ExternalSessionStatus,
): Promise<void> {
  try {
    await fetch(`${getSrcApiBaseUrl()}/sessions/external/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, status }),
    })
  } catch (err) {
    console.warn('[Converse] failed to update external session status:', err)
  }
}

async function hydrateUploadsToTaskDir(fileIds: string[], taskDir: string): Promise<string[]> {
  return hydrateAttachmentsToTaskDir({
    attachmentIds: fileIds,
    taskDir,
    uploadsDir: UPLOADS_DIR,
    onResolveFailure: (fileId) => {
      console.warn(`[Converse] cannot resolve uploaded file id: ${fileId}`)
    },
    onCopyFailure: (fileId, error) => {
      console.warn(`[Converse] failed to copy uploaded file ${fileId}:`, error)
    },
  })
}

function buildConverseQuery(query: string, uploadedFiles: string[]): string {
  if (!uploadedFiles.length) return query
  const list = uploadedFiles.map((name) => `- ${name}`).join('\n')
  const baseQuery = query.trim() || '我上传了一些文件，请先读取文件再继续处理。'
  return `${baseQuery}\n\n[Uploaded files in current task directory]\n${list}\n\n这些文件都在当前任务工作目录下，请先读取这些文件，再处理用户请求。`
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     决策标记解析                                          │
 * │  从 agent 文本输出中提取 LABORANY_ACTION 决策                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */

const ACTION_PATTERN = /LABORANY_ACTION:\s*(\{[\s\S]*?\})/g
const ASK_USER_QUESTION_PATTERN = /AskU(?:ser|er)Question\(\s*([\s\S]*?)\s*\)/i

type ActionTargetType = 'skill'
type ScheduleActionKind = 'cron' | 'at' | 'every'

interface DeterministicScheduleDetection {
  scheduleKind: ScheduleActionKind
  cronExpr?: string
  atMs?: number
  everyMs?: number
  tz?: string
  targetId?: string
  targetQuery: string
  matchedText: string
  targetMatchedText?: string
}

interface CapabilityReference {
  explicit: boolean
  targetId?: string
  targetLabel?: string
  matchedText?: string
}

interface ScheduleActionPayload {
  action: 'setup_schedule'
  scheduleKind?: ScheduleActionKind
  cronExpr?: string
  atMs?: number
  everyMs?: number
  tz?: string
  targetType?: ActionTargetType
  targetId?: string
  targetQuery: string
  name?: string
}

type ConverseActionPayload =
  | {
      action: 'recommend_capability'
      targetType: ActionTargetType
      targetId: string
      query: string
      confidence?: number
      matchType?: 'exact' | 'candidate'
      reason?: string
    }
  | {
      action: 'execute_generic'
      query: string
      planSteps?: string[]
    }
  | {
      action: 'create_capability'
      mode: ActionTargetType
      seedQuery: string
    }
  | ScheduleActionPayload
  | {
      action: 'send_file'
      filePaths: string[]
      note?: string
    }

interface ConverseQuestionOption {
  label: string
  description: string
}

interface ConverseQuestion {
  question: string
  header: string
  options: ConverseQuestionOption[]
  multiSelect: boolean
}

interface ConverseQuestionPayload {
  id: string
  toolUseId: string
  questions: ConverseQuestion[]
  missingFields?: string[]
  questionContext?: 'clarify' | 'schedule' | 'approval'
}

type ConversePhase =
  | 'clarify'
  | 'match'
  | 'choose_strategy'
  | 'plan_review'
  | 'schedule_wizard'
  | 'ready'

interface ConverseSessionState {
  phase: ConversePhase
  approvalRequired: boolean
  lastUpdatedAt: number
}

const sessionStateStore = new Map<string, ConverseSessionState>()

function setSessionState(
  sessionId: string,
  state: Pick<ConverseSessionState, 'phase' | 'approvalRequired'>,
): ConverseSessionState {
  const next: ConverseSessionState = {
    phase: state.phase,
    approvalRequired: state.approvalRequired,
    lastUpdatedAt: Date.now(),
  }
  sessionStateStore.set(sessionId, next)
  return next
}

function toQuestionPayload(
  questions: ConverseQuestion[],
  options?: Pick<ConverseQuestionPayload, 'missingFields' | 'questionContext'>,
): ConverseQuestionPayload {
  return {
    id: `question_${randomUUID()}`,
    toolUseId: `tool_${randomUUID()}`,
    questions,
    missingFields: options?.missingFields,
    questionContext: options?.questionContext,
  }
}

function isValidCronExpr(expr: string): boolean {
  const segments = expr.trim().split(/\s+/)
  return segments.length === 5
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const parsed = Number.parseFloat(value.trim())
  return Number.isFinite(parsed) ? parsed : undefined
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asTargetType(value: unknown): ActionTargetType | null {
  return value === 'skill' ? value : null
}

function asScheduleKind(value: unknown): ScheduleActionKind | undefined {
  return value === 'cron' || value === 'at' || value === 'every'
    ? value
    : undefined
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function parseDurationToMs(value: string): number | undefined {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined

  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(ms|毫秒|s|sec|secs|second|seconds|秒|m|min|mins|minute|minutes|分钟|分|h|hr|hrs|hour|hours|小时|时|d|day|days|天)$/i)
  if (!match) return undefined

  const amount = Number.parseFloat(match[1])
  if (!Number.isFinite(amount) || amount <= 0) return undefined

  const unit = match[2].toLowerCase()
  if (['ms', '毫秒'].includes(unit)) return Math.round(amount)
  if (['s', 'sec', 'secs', 'second', 'seconds', '秒'].includes(unit)) return Math.round(amount * 1000)
  if (['m', 'min', 'mins', 'minute', 'minutes', '分钟', '分'].includes(unit)) return Math.round(amount * 60_000)
  if (['h', 'hr', 'hrs', 'hour', 'hours', '小时', '时'].includes(unit)) return Math.round(amount * 3_600_000)
  if (['d', 'day', 'days', '天'].includes(unit)) return Math.round(amount * 86_400_000)
  return undefined
}

function normalizeMeridiemHour(hour: number, meridiem?: string): number {
  if (!Number.isFinite(hour)) return hour

  const normalized = (meridiem || '').trim()
  if (!normalized) return hour

  if (normalized === '凌晨') {
    return hour === 12 ? 0 : hour
  }

  if (normalized === '早上' || normalized === '上午') {
    return hour === 12 ? 0 : hour
  }

  if (normalized === '中午') {
    return hour >= 11 ? hour : hour + 12
  }

  if (normalized === '下午' || normalized === '晚上') {
    return hour >= 12 ? hour : hour + 12
  }

  return hour
}

function parseDateTimeToMs(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const numeric = asNumber(trimmed)
  if (numeric !== undefined) {
    if (numeric > 1_000_000_000_000) return Math.round(numeric)
    if (numeric > 1_000_000_000) return Math.round(numeric * 1000)
  }

  const explicitChinese = trimmed.match(
    /^(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?\s*(?:(早上|上午|中午|下午|晚上|凌晨)\s*)?(\d{1,2})(?:[:：点时](\d{1,2}))?(?:[:：分](\d{1,2}))?$/,
  )
  if (explicitChinese) {
    const [, yearText, monthText, dayText, meridiem, hourText, minuteText, secondText] = explicitChinese
    const year = Number.parseInt(yearText, 10)
    const month = Number.parseInt(monthText, 10)
    const day = Number.parseInt(dayText, 10)
    const hour = normalizeMeridiemHour(Number.parseInt(hourText, 10), meridiem)
    const minute = minuteText ? Number.parseInt(minuteText, 10) : 0
    const second = secondText ? Number.parseInt(secondText, 10) : 0
    const parsed = new Date(year, month - 1, day, hour, minute, second, 0).getTime()
    return Number.isFinite(parsed) ? parsed : undefined
  }

  const relativeChinese = trimmed.match(
    /^(今天|明天|后天)\s*(?:(早上|上午|中午|下午|晚上|凌晨)\s*)?(\d{1,2})(?:[:：点时](\d{1,2}))?(?:[:：分](\d{1,2}))?$/,
  )
  if (relativeChinese) {
    const [, dayLabel, meridiem, hourText, minuteText, secondText] = relativeChinese
    const base = new Date()
    const offsetDays = dayLabel === '今天' ? 0 : dayLabel === '明天' ? 1 : 2
    base.setHours(0, 0, 0, 0)
    base.setDate(base.getDate() + offsetDays)
    const hour = normalizeMeridiemHour(Number.parseInt(hourText, 10), meridiem)
    const minute = minuteText ? Number.parseInt(minuteText, 10) : 0
    const second = secondText ? Number.parseInt(secondText, 10) : 0
    base.setHours(hour, minute, second, 0)
    const parsed = base.getTime()
    return Number.isFinite(parsed) ? parsed : undefined
  }

  const normalized = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(trimmed)
    ? trimmed.replace(' ', 'T')
    : trimmed
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeWeekdayToCron(value: string): string | null {
  const normalized = value.trim()
  if (normalized === '一' || normalized === '1') return '1'
  if (normalized === '二' || normalized === '2') return '2'
  if (normalized === '三' || normalized === '3') return '3'
  if (normalized === '四' || normalized === '4') return '4'
  if (normalized === '五' || normalized === '5') return '5'
  if (normalized === '六' || normalized === '6') return '6'
  if (normalized === '日' || normalized === '天' || normalized === '7') return '0'
  return null
}

function normalizeCapabilityAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[「」【】《》“”"'`]/g, '')
    .replace(/\s+/g, ' ')
}

function resolveCapabilityByAlias(alias: string): { id: string; name: string } | null {
  const normalizedAlias = normalizeCapabilityAlias(alias)
  if (!normalizedAlias) return null

  const catalog = loadCatalog()
  for (const item of catalog) {
    if (item.type !== 'skill') continue
    if (normalizeCapabilityAlias(item.id) === normalizedAlias) {
      return { id: item.id, name: item.name }
    }
    if (normalizeCapabilityAlias(item.name) === normalizedAlias) {
      return { id: item.id, name: item.name }
    }
  }
  return null
}

function extractReferencedCapability(text: string): CapabilityReference {
  const patterns = [
    /((?:用|使用|通过|调用)\s*(?:目标)?技能\s*[「」【】《》“”"'`]?(.+?)[」】》“”"'`]?(?=\s*(?:[，,。；;：:\n]|设立|设置|创建|安排|建立|新增|添加|每天|每日|每周|每月|每隔|在|于|来|去|并|然后|$)))/i,
    /((?:目标技能|技能)\s*(?:是|为|设为|设成)?\s*[「」【】《》“”"'`]?(.+?)[」】》“”"'`]?(?=\s*(?:[，,。；;：:\n]|设立|设置|创建|安排|建立|新增|添加|每天|每日|每周|每月|每隔|在|于|来|去|并|然后|$)))/i,
    /((?:用|使用|通过|调用)\s*[「」【】《》“”"'`]?(.+?)[」】》“”"'`]?\s*(?:这个|该)?技能)/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    const alias = match?.[2]?.trim()
    if (!alias) continue
    const resolved = resolveCapabilityByAlias(alias)
    return {
      explicit: true,
      targetId: resolved?.id,
      targetLabel: alias,
      matchedText: match?.[1] || alias,
    }
  }

  return { explicit: false }
}

function extractScheduleTargetQuery(
  text: string,
  matchedText: string,
  capabilityMatchText?: string,
): string {
  const colonMatch = text.match(/(?:：|:(?!\d{2}\b))\s*(.+)$/s)
  if (colonMatch?.[1]) {
    const candidate = colonMatch[1].trim()
    if (candidate) return candidate
  }

  let remainder = text.replace(matchedText, ' ')
  if (capabilityMatchText) {
    remainder = remainder.replace(capabilityMatchText, ' ')
  }

  remainder = remainder
    .replace(/(?:用|使用|通过|调用)\s*(?:目标)?技能\s*[「」【】《》“”"'`]?[^，,。；;：:\n]+[」】》“”"'`]?\s*/gi, ' ')
    .replace(/(?:目标技能|技能)\s*(?:是|为|设为|设成)?\s*[「」【】《》“”"'`]?[^，,。；;：:\n]+[」】》“”"'`]?\s*/gi, ' ')
    .replace(/^[，,。.\s]+/, '')
    .replace(/^(请|帮我|麻烦|定时|自动|安排|设置|创建|生成)+/g, '')
    .replace(/^(在|于)\s*/g, '')
    .replace(/^(点|时|分|分钟|秒|秒钟|半)\s*/g, '')
    .replace(/^(执行|运行|提醒|通知|发送|推送)(一次)?/g, '')
    .replace(/^(设立|设置|创建|安排|建立|新增|添加)(一个|一条|个)?/g, '')
    .replace(/^(的)?定时任务/g, '')
    .replace(/^[，,。.\s:：-]+/, '')
    .replace(/[，,。.\s:：-]+(?:设立|设置|创建|安排|建立|新增|添加)(一个|一条|个)?/g, ' ')
    .replace(/[，,。.\s:：-]+(?:的)?定时任务/g, ' ')
    .replace(/^[，,。.\s:：-]+/, '')
    .trim()

  return remainder
}

function detectDeterministicScheduleAction(query: string): ScheduleActionPayload | null {
  const text = query.trim()
  if (!text) return null
  const capabilityRef = extractReferencedCapability(text)

  const explicitAtPatterns = [
    /((?:\d{4}[年/-]\d{1,2}[月/-]\d{1,2}日?\s*(?:早上|上午|中午|下午|晚上|凌晨)?\s*\d{1,2}(?:[:：点时]\d{1,2})?(?:[:：分]\d{1,2})?)|(?:今天|明天|后天)\s*(?:早上|上午|中午|下午|晚上|凌晨)?\s*\d{1,2}(?:[:：点时]\d{1,2})?(?:[:：分]\d{1,2})?)(?=\s*(?:执行|运行|提醒|通知|发送|推送|开始|触发))/,
    /(?:请|麻烦|帮我)?在\s*((?:\d{4}[年/-]\d{1,2}[月/-]\d{1,2}日?\s*(?:早上|上午|中午|下午|晚上|凌晨)?\s*\d{1,2}(?:[:：点时]\d{1,2})?(?:[:：分]\d{1,2})?)|(?:今天|明天|后天)\s*(?:早上|上午|中午|下午|晚上|凌晨)?\s*\d{1,2}(?:[:：点时]\d{1,2})?(?:[:：分]\d{1,2})?)/,
  ]

  for (const pattern of explicitAtPatterns) {
    const match = text.match(pattern)
    const dateTimeText = match?.[1]?.trim()
    if (!dateTimeText) continue
    const atMs = parseDateTimeToMs(dateTimeText)
    if (atMs === undefined) continue
    const matchedText = match?.[0] || dateTimeText
    return {
      action: 'setup_schedule',
      scheduleKind: 'at',
      atMs,
      targetType: 'skill',
      targetId: capabilityRef.targetId,
      targetQuery: extractScheduleTargetQuery(text, matchedText, capabilityRef.matchedText),
    }
  }

  const intervalMatch = text.match(
    /((?:每隔|每)\s*\d+(?:\.\d+)?\s*(?:毫秒|秒钟?|秒|分钟?|分|小时|时|天|周|ms|sec|secs|second|seconds|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days))/i,
  )
  if (intervalMatch?.[1]) {
    const intervalText = intervalMatch[1]
      .replace(/^每隔/, '')
      .replace(/^每/, '')
      .trim()
      .replace(/周$/i, '7d')
    const everyMs = parseDurationToMs(intervalText)
    if (everyMs !== undefined) {
      return {
        action: 'setup_schedule',
        scheduleKind: 'every',
        everyMs,
        targetType: 'skill',
        targetId: capabilityRef.targetId,
        targetQuery: extractScheduleTargetQuery(text, intervalMatch[0], capabilityRef.matchedText),
      }
    }
  }

  const dailyMatch = text.match(
    /((?:每天|每日)\s*(?:(早上|上午|中午|下午|晚上|凌晨)\s*)?(\d{1,2})(?:[:：点时](\d{1,2}))?)/,
  )
  if (dailyMatch) {
    const hour = normalizeMeridiemHour(Number.parseInt(dailyMatch[3], 10), dailyMatch[2])
    const minute = dailyMatch[4] ? Number.parseInt(dailyMatch[4], 10) : 0
    return {
      action: 'setup_schedule',
      scheduleKind: 'cron',
      cronExpr: `${minute} ${hour} * * *`,
      tz: 'Asia/Shanghai',
      targetType: 'skill',
      targetId: capabilityRef.targetId,
      targetQuery: extractScheduleTargetQuery(text, dailyMatch[0], capabilityRef.matchedText),
    }
  }

  const workdayMatch = text.match(
    /((?:每个?工作日|工作日(?:每天)?|周一到周五|星期一到星期五)\s*(?:(早上|上午|中午|下午|晚上|凌晨)\s*)?(\d{1,2})(?:[:：点时](\d{1,2}))?)/,
  )
  if (workdayMatch) {
    const hour = normalizeMeridiemHour(Number.parseInt(workdayMatch[3], 10), workdayMatch[2])
    const minute = workdayMatch[4] ? Number.parseInt(workdayMatch[4], 10) : 0
    return {
      action: 'setup_schedule',
      scheduleKind: 'cron',
      cronExpr: `${minute} ${hour} * * 1-5`,
      tz: 'Asia/Shanghai',
      targetType: 'skill',
      targetId: capabilityRef.targetId,
      targetQuery: extractScheduleTargetQuery(text, workdayMatch[0], capabilityRef.matchedText),
    }
  }

  const weeklyMatch = text.match(
    /((?:每周|每星期)([一二三四五六日天1-7])\s*(?:(早上|上午|中午|下午|晚上|凌晨)\s*)?(\d{1,2})(?:[:：点时](\d{1,2}))?)/,
  )
  if (weeklyMatch) {
    const weekday = normalizeWeekdayToCron(weeklyMatch[2])
    if (weekday) {
      const hour = normalizeMeridiemHour(Number.parseInt(weeklyMatch[4], 10), weeklyMatch[3])
      const minute = weeklyMatch[5] ? Number.parseInt(weeklyMatch[5], 10) : 0
      return {
        action: 'setup_schedule',
        scheduleKind: 'cron',
        cronExpr: `${minute} ${hour} * * ${weekday}`,
        tz: 'Asia/Shanghai',
        targetType: 'skill',
        targetId: capabilityRef.targetId,
        targetQuery: extractScheduleTargetQuery(text, weeklyMatch[0], capabilityRef.matchedText),
      }
    }
  }

  const monthlyMatch = text.match(
    /((?:每月)(\d{1,2})(?:号|日)?\s*(?:(早上|上午|中午|下午|晚上|凌晨)\s*)?(\d{1,2})(?:[:：点时](\d{1,2}))?)/,
  )
  if (monthlyMatch) {
    const dayOfMonth = Number.parseInt(monthlyMatch[2], 10)
    const hour = normalizeMeridiemHour(Number.parseInt(monthlyMatch[4], 10), monthlyMatch[3])
    const minute = monthlyMatch[5] ? Number.parseInt(monthlyMatch[5], 10) : 0
    if (dayOfMonth >= 1 && dayOfMonth <= 31) {
      return {
        action: 'setup_schedule',
        scheduleKind: 'cron',
        cronExpr: `${minute} ${hour} ${dayOfMonth} * *`,
        tz: 'Asia/Shanghai',
        targetType: 'skill',
        targetId: capabilityRef.targetId,
        targetQuery: extractScheduleTargetQuery(text, monthlyMatch[0], capabilityRef.matchedText),
      }
    }
  }

  return null
}

function stabilizeScheduleAction(
  action: ScheduleActionPayload,
  query: string,
): ScheduleActionPayload {
  const detected = detectDeterministicScheduleAction(query)
  if (!detected) return action

  return {
    ...action,
    scheduleKind: detected.scheduleKind,
    cronExpr: detected.cronExpr ?? action.cronExpr,
    atMs: detected.atMs ?? action.atMs,
    everyMs: detected.everyMs ?? action.everyMs,
    tz: detected.tz ?? action.tz,
    targetId: detected.targetId ?? action.targetId,
    targetQuery: detected.targetQuery || action.targetQuery,
  }
}

function buildExplicitScheduleTargetQuestion(targetLabel: string): ConverseQuestionPayload {
  return toQuestionPayload([
    {
      header: '目标技能',
      question: `我没有找到你明确指定的技能「${targetLabel}」。请回复正确的技能 ID，或直接说“改为自动选择技能/创建新技能”。`,
      multiSelect: false,
      options: [
        { label: '回复正确技能 ID', description: '继续沿用你指定的目标技能' },
        { label: '改为自动选择技能', description: '让我按任务内容自动匹配' },
        { label: '改为创建新技能', description: '先把这个任务沉淀成 skill' },
      ],
    },
  ], { questionContext: 'schedule' })
}

function applyExplicitScheduleTarget(
  action: ScheduleActionPayload,
  sourceQuery: string,
): {
  action: ScheduleActionPayload
  question?: ConverseQuestionPayload
  validationErrors?: string[]
} {
  const reference = extractReferencedCapability(sourceQuery)
  if (!reference.explicit) {
    return { action }
  }

  if (reference.targetId) {
    return {
      action: {
        ...action,
        targetType: 'skill',
        targetId: reference.targetId,
      },
    }
  }

  const targetLabel = reference.targetLabel || '未识别技能'
  return {
    action,
    question: buildExplicitScheduleTargetQuestion(targetLabel),
    validationErrors: [`未找到用户明确指定的技能: ${targetLabel}`],
  }
}

function inferScheduleKind(action: ScheduleActionPayload): ScheduleActionKind {
  if (action.scheduleKind) return action.scheduleKind
  if (typeof action.atMs === 'number' && Number.isFinite(action.atMs)) return 'at'
  if (typeof action.everyMs === 'number' && Number.isFinite(action.everyMs)) return 'every'
  return 'cron'
}

function normalizeRuntimeContext(raw: unknown): ConverseRuntimeContext {
  if (!raw || typeof raw !== 'object') {
    return {}
  }

  const obj = raw as Record<string, unknown>
  const capabilitiesRaw = obj.capabilities && typeof obj.capabilities === 'object'
    ? obj.capabilities as Record<string, unknown>
    : {}

  return {
    channel: asString(obj.channel) || undefined,
    locale: asString(obj.locale) || undefined,
    currentTime: asString(obj.currentTime) || new Date().toISOString(),
    capabilities: {
      canSendFile: asBoolean(capabilitiesRaw.canSendFile),
      canSendImage: asBoolean(capabilitiesRaw.canSendImage),
      canRenderWidgets: asBoolean(capabilitiesRaw.canRenderWidgets),
    },
  }
}

function normalizeQuestionPayload(
  toolInput: Record<string, unknown>,
  toolUseId?: string,
): ConverseQuestionPayload | null {
  const rawQuestions = Array.isArray(toolInput.questions)
    ? toolInput.questions
    : (() => {
      const singleQuestion = asString(toolInput.question)
      if (!singleQuestion) return null
      const rawOptions = Array.isArray(toolInput.options)
        ? toolInput.options
        : []
      return [{
        question: singleQuestion,
        header: asString(toolInput.header) || '问题',
        options: rawOptions,
        multiSelect: asBoolean(toolInput.multiSelect),
      }]
    })()

  if (!rawQuestions || !rawQuestions.length) return null

  const questions: ConverseQuestion[] = rawQuestions
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const obj = item as Record<string, unknown>
      const question = asString(obj.question)
      if (!question) return null

      const header = asString(obj.header) || '问题'
      const options = Array.isArray(obj.options)
        ? obj.options
          .map((opt) => {
            if (typeof opt === 'string') {
              const label = asString(opt)
              if (!label) return null
              return {
                label,
                description: '',
              }
            }
            if (!opt || typeof opt !== 'object') return null
            const optionObj = opt as Record<string, unknown>
            const label = asString(optionObj.label)
            if (!label) return null
            return {
              label,
              description: asString(optionObj.description),
            }
          })
          .filter((opt): opt is ConverseQuestionOption => Boolean(opt))
        : []

      return {
        question,
        header,
        options,
        multiSelect: asBoolean(obj.multiSelect),
      }
    })
    .filter((q): q is ConverseQuestion => Boolean(q))

  if (!questions.length) return null

  return {
    id: `question_${randomUUID()}`,
    toolUseId: toolUseId || `tool_${randomUUID()}`,
    questions,
    missingFields: Array.isArray(toolInput.missingFields)
      ? toolInput.missingFields.map(item => asString(item)).filter(Boolean)
      : undefined,
    questionContext: (() => {
      const ctx = asString(toolInput.questionContext)
      if (ctx === 'clarify' || ctx === 'schedule' || ctx === 'approval') {
        return ctx
      }
      return undefined
    })(),
  }
}

function parseQuestionCallFromText(text: string): ConverseQuestionPayload | null {
  const match = text.match(ASK_USER_QUESTION_PATTERN)
  if (!match?.[1]) return null
  try {
    const parsed = JSON.parse(match[1]) as Record<string, unknown>
    return normalizeQuestionPayload(parsed)
  } catch {
    return null
  }
}

function buildScheduleQuestion(
  partial: Partial<Extract<ConverseActionPayload, { action: 'setup_schedule' }>>,
  missing: string[],
): ConverseQuestionPayload {
  const questions: ConverseQuestion[] = []
  const scheduleKind = partial.scheduleKind || 'cron'

  if (missing.includes('cronExpr')) {
    questions.push({
      header: '定时频率',
      question: '请选择执行频率；如需一次性任务，请直接回复具体时间；如需固定间隔，请回复如 30m、2h、1d。',
      multiSelect: false,
      options: [
        { label: '每天 09:00', description: 'cron: 0 9 * * *' },
        { label: '每周一 09:00', description: 'cron: 0 9 * * 1' },
        { label: '每小时整点', description: 'cron: 0 * * * *' },
      ],
    })
  }

  if (missing.includes('atMs')) {
    questions.push({
      header: '执行时间',
      question: '请提供一次性任务的执行时间，例如 2026-03-08 08:00 或 ISO 时间。',
      multiSelect: false,
      options: [
        { label: '明天 09:00', description: '一次性任务示例' },
        { label: '2026-03-08 08:00', description: '本地时间格式示例' },
      ],
    })
  }

  if (missing.includes('everyMs')) {
    questions.push({
      header: '执行间隔',
      question: '请提供固定执行间隔，例如 30m、2h、1d。',
      multiSelect: false,
      options: [
        { label: '30m', description: '每 30 分钟执行一次' },
        { label: '2h', description: '每 2 小时执行一次' },
        { label: '1d', description: '每 1 天执行一次' },
      ],
    })
  }

  if (missing.includes('targetId')) {
    const expectedType = 'skill'
    questions.push({
      header: '执行目标 ID',
      question: `请提供要定时执行的 ${expectedType} ID。`,
      multiSelect: false,
      options: [],
    })
  }

  if (missing.includes('targetQuery')) {
    questions.push({
      header: '执行内容',
      question: '请明确定时任务每次执行时使用的任务描述。',
      multiSelect: false,
      options: [
        { label: '沿用当前需求', description: '直接复用这次对话需求作为 query' },
      ],
    })
  }

  if (scheduleKind === 'cron' && !partial.tz) {
    questions.push({
      header: '时区设置',
      question: '默认将使用 Asia/Shanghai。若需其他时区，请直接回复时区名称。',
      multiSelect: false,
      options: [
        { label: 'Asia/Shanghai', description: '北京时间（UTC+8）' },
        { label: 'UTC', description: '协调世界时' },
      ],
    })
  }

  return toQuestionPayload(questions, {
    questionContext: 'schedule',
    missingFields: missing,
  })
}

interface GuardResult {
  ok: boolean
  action?: ConverseActionPayload
  question?: ConverseQuestionPayload
  validationErrors?: string[]
  phase: ConversePhase
  approvalRequired: boolean
}

function guardAction(
  action: ConverseActionPayload,
  runtimeContext?: ConverseRuntimeContext,
  sourceQuery = '',
): GuardResult {
  const catalog = loadCatalog()
  const findCapability = (type: ActionTargetType, id: string) =>
    catalog.some(item => item.type === type && item.id === id)

  if (action.action === 'recommend_capability') {
    if (!findCapability(action.targetType, action.targetId)) {
      const q = toQuestionPayload([
        {
          header: '能力校验',
          question: `未找到 ${action.targetType}「${action.targetId}」。请选择下一步。`,
          multiSelect: false,
          options: [
            { label: '用通用技能执行', description: '先完成一次任务' },
            { label: '创建新能力', description: '沉淀为 skill' },
            { label: '继续匹配', description: '让我重新匹配现有能力' },
          ],
        },
      ], { questionContext: 'clarify' })

      return {
        ok: false,
        question: q,
        validationErrors: [`能力不存在: ${action.targetType}/${action.targetId}`],
        phase: 'match',
        approvalRequired: false,
      }
    }

    return { ok: true, action, phase: 'match', approvalRequired: false }
  }

  if (action.action === 'setup_schedule') {
    const explicitTarget = applyExplicitScheduleTarget(action, sourceQuery)
    action = explicitTarget.action
    if (explicitTarget.question) {
      return {
        ok: false,
        question: explicitTarget.question,
        validationErrors: explicitTarget.validationErrors,
        phase: 'schedule_wizard',
        approvalRequired: false,
      }
    }

    const missing: string[] = []
    action.scheduleKind = inferScheduleKind(action)
    if (!action.targetType) {
      action.targetType = 'skill'
    }
    if (!action.targetQuery) missing.push('targetQuery')

    if (action.scheduleKind === 'cron') {
      if (!action.cronExpr || !isValidCronExpr(action.cronExpr)) {
        missing.push('cronExpr')
      }
      if (!action.tz) {
        action.tz = 'Asia/Shanghai'
      }
    } else if (action.scheduleKind === 'at') {
      if (!Number.isFinite(action.atMs) || (action.atMs || 0) <= Date.now()) {
        missing.push('atMs')
      }
    } else if (!Number.isFinite(action.everyMs) || (action.everyMs || 0) <= 0) {
      missing.push('everyMs')
    }

    if (action.targetType && action.targetId) {
      const exists = findCapability(action.targetType, action.targetId)
      if (!exists) {
        // 对于定时任务，targetId 允许缺失：下游会自动创建技能并绑定
        action.targetId = ''
      }
    }

    if (missing.length) {
      return {
        ok: false,
        question: buildScheduleQuestion(action, missing),
        validationErrors: missing.map(field => `定时任务缺少或无效字段: ${field}`),
        phase: 'schedule_wizard',
        approvalRequired: false,
      }
    }

    return { ok: true, action, phase: 'schedule_wizard', approvalRequired: false }
  }

  if (action.action === 'execute_generic') {
    return { ok: true, action, phase: 'plan_review', approvalRequired: false }
  }

  if (action.action === 'create_capability') {
    return { ok: true, action, phase: 'choose_strategy', approvalRequired: false }
  }

  if (action.action === 'send_file') {
    if (!runtimeContext?.capabilities?.canSendFile) {
      return {
        ok: false,
        question: toQuestionPayload([
          {
            header: '发送能力不可用',
            question: '当前渠道不支持直接发送文件。你希望我改为返回文件路径，还是输出文件摘要？',
            multiSelect: false,
            options: [
              { label: '返回文件路径', description: '我给你可直接访问的绝对路径' },
              { label: '输出文件摘要', description: '我提取并总结文件核心内容' },
            ],
          },
        ], { questionContext: 'clarify' }),
        validationErrors: ['当前渠道 canSendFile=false，无法执行 send_file'],
        phase: 'clarify',
        approvalRequired: false,
      }
    }

    const normalizedPaths = action.filePaths
      .map(item => asString(item))
      .filter(Boolean)
      .slice(0, 5)
    if (!normalizedPaths.length) {
      return {
        ok: false,
        question: toQuestionPayload([
          {
            header: '文件路径确认',
            question: '请提供要发送的文件绝对路径（可多个）。',
            multiSelect: false,
            options: [],
          },
        ], { questionContext: 'clarify' }),
        validationErrors: ['send_file 缺少 filePaths'],
        phase: 'clarify',
        approvalRequired: false,
      }
    }

    return {
      ok: true,
      action: {
        ...action,
        filePaths: normalizedPaths,
      },
      phase: 'ready',
      approvalRequired: false,
    }
  }

  return { ok: true, action, phase: 'clarify', approvalRequired: false }
}

function normalizeAction(raw: Record<string, unknown>): ConverseActionPayload | null {
  const action = asString(raw.action)

  if (action === 'recommend_capability') {
    const targetType = asTargetType(raw.targetType)
    const rawTargetId = asString(raw.targetId)
    const targetId = rawTargetId
      ? (resolveCapabilityByAlias(rawTargetId)?.id || rawTargetId)
      : ''
    const query = asString(raw.query)
    if (!targetType || !targetId || !query) return null
    const confidence = typeof raw.confidence === 'number' ? raw.confidence : undefined
    const matchType = raw.matchType === 'exact' || raw.matchType === 'candidate' ? raw.matchType : undefined
    return {
      action: 'recommend_capability',
      targetType,
      targetId,
      query,
      confidence,
      matchType,
      reason: asString(raw.reason) || undefined,
    }
  }

  if (action === 'execute_generic') {
    const query = asString(raw.query)
    if (!query) return null
    const planSteps = Array.isArray(raw.planSteps)
      ? raw.planSteps.map(item => asString(item)).filter(Boolean)
      : undefined
    return { action: 'execute_generic', query, planSteps }
  }

  if (action === 'create_capability') {
    const mode: ActionTargetType = 'skill'
    const seedQuery = asString(raw.seedQuery) || asString(raw.query)
    if (!seedQuery) return null
    return { action: 'create_capability', mode, seedQuery }
  }

  if (action === 'setup_schedule') {
    const directAtMs = asNumber(raw.atMs ?? raw.runAtMs ?? raw.timestamp)
    const parsedAtMs = directAtMs ?? parseDateTimeToMs(
      asString(raw.runAt) || asString(raw.at) || asString(raw.dateTime) || asString(raw.datetime),
    )
    const directEveryMs = asNumber(raw.everyMs ?? raw.intervalMs)
    const parsedEveryMs = directEveryMs ?? parseDurationToMs(
      asString(raw.every) || asString(raw.interval),
    )
    const cronExpr = asString(raw.cronExpr) || asString(raw.cronSchedule)
    const targetQuery = asString(raw.targetQuery) || asString(raw.query)
    const scheduleKind = asScheduleKind(raw.scheduleKind)
      || (parsedAtMs !== undefined ? 'at' : parsedEveryMs !== undefined ? 'every' : 'cron')
    const rawTargetId = asString(raw.targetId)
    const targetId = rawTargetId
      ? (resolveCapabilityByAlias(rawTargetId)?.id || rawTargetId)
      : undefined
    return {
      action: 'setup_schedule',
      scheduleKind,
      cronExpr: cronExpr || undefined,
      atMs: parsedAtMs,
      everyMs: parsedEveryMs,
      tz: asString(raw.tz) || undefined,
      targetType: 'skill',
      targetId,
      targetQuery,
      name: asString(raw.name) || undefined,
    }
  }

  if (action === 'send_file') {
    const fromArray = Array.isArray(raw.filePaths)
      ? raw.filePaths.map(item => asString(item)).filter(Boolean)
      : []
    const single = asString(raw.filePath)
    const filePaths = fromArray.length ? fromArray : (single ? [single] : [])
    if (!filePaths.length) return null
    return {
      action: 'send_file',
      filePaths,
      note: asString(raw.note) || undefined,
    }
  }

  /* 兼容旧动作协议 */
  if (action === 'navigate_skill') {
    const targetId = asString(raw.skillId)
    const query = asString(raw.query)
    if (!targetId || !query) return null
    return {
      action: 'recommend_capability',
      targetType: 'skill',
      targetId,
      query,
      reason: '兼容旧动作: navigate_skill',
    }
  }

  // Legacy compatibility: historical clients may still emit `navigate_workflow`.
  // We normalize it to unified skill/capability routing semantics.
  if (action === 'navigate_workflow') {
    const targetId = asString(raw.workflowId)
    const query = asString(raw.query)
    if (!targetId || !query) return null
    return {
      action: 'recommend_capability',
      targetType: 'skill',
      targetId,
      query,
      reason: '兼容旧动作: navigate_workflow，按复合技能处理',
    }
  }

  if (action === 'create_skill') {
    const seedQuery = asString(raw.query)
    if (!seedQuery) return null
    return { action: 'create_capability', mode: 'skill', seedQuery }
  }

  if (action === 'setup_cron') {
    const cronExpr = asString(raw.cronSchedule)
    const targetQuery = asString(raw.cronTargetQuery) || asString(raw.query)
    return {
      action: 'setup_schedule',
      scheduleKind: 'cron',
      cronExpr,
      targetQuery,
    }
  }

  return null
}

function extractAction(text: string): ConverseActionPayload | null {
  let found: ConverseActionPayload | null = null
  for (const match of text.matchAll(ACTION_PATTERN)) {
    try {
      const raw = JSON.parse(match[1]) as Record<string, unknown>
      const normalized = normalizeAction(raw)
      if (normalized) {
        found = normalized
      }
    } catch {
    }
  }
  return found
}

function hasRejectCreateIntent(text: string): boolean {
  return /不想创建|不要创建|不创建|不需要创建|不要新技能|不用新技能|don't\s+create|do\s+not\s+create|no\s+new\s+skill/i.test(text)
}

function hasCreateCapabilityIntent(text: string): boolean {
  if (/创建新技能|新建技能|创建一个技能|帮我创建|沉淀为技能|create\s+(a\s+)?new\s+skill|create_skill|create\s+capability/i.test(text)) {
    return true
  }

  const createVerb = /(创建|新建|生成|沉淀(?:成|为)?|封装成|做成|build|make|create)/i
  const capabilityNoun = /(skill|技能|能力|capability)/i
  return createVerb.test(text) && capabilityNoun.test(text)
}

function hasExplicitGenericIntent(text: string): boolean {
  if (/不要直接执行|别直接执行|不是直接执行|无需直接执行|不要通用助手|不要\s+generic|不用\s+generic|别走通用|不要走通用/i.test(text)) {
    return false
  }

  return /直接做|直接执行|通用助手|generic|先直接做|先做一遍/i.test(text)
}

function inferFallbackAction(query: string, fullText: string): ConverseActionPayload | null {
  const deterministicSchedule = detectDeterministicScheduleAction(query)
  if (deterministicSchedule) return deterministicSchedule

  // Keep user intent and assistant prose separate. Mixing them can turn
  // harmless phrases like "创建组件" + "不要推荐 skill" into a false create_capability action.
  const rejectCreate = hasRejectCreateIntent(query) || hasRejectCreateIntent(fullText)
  const acceptCreate = hasCreateCapabilityIntent(query) || hasCreateCapabilityIntent(fullText)
  const genericSignal = hasExplicitGenericIntent(query) || hasExplicitGenericIntent(fullText)

  if (acceptCreate && !rejectCreate) {
    return {
      action: 'create_capability',
      mode: 'skill',
      seedQuery: query || '请创建一个新技能来完成该任务',
    }
  }

  if (rejectCreate || genericSignal) {
    return {
      action: 'execute_generic',
      query: query || '请直接执行这个任务，不创建新技能',
      planSteps: [],
    }
  }

  return null
}

function detectDirectIntentAction(query: string): ConverseActionPayload | null {
  const text = query.trim()
  if (!text) return null

  const rejectCreate = hasRejectCreateIntent(text)
  const acceptCreate = hasCreateCapabilityIntent(text)
  const genericSignal = hasExplicitGenericIntent(text)

  if (acceptCreate && !rejectCreate) {
    return {
      action: 'create_capability',
      mode: 'skill',
      seedQuery: text,
    }
  }

  if (rejectCreate || genericSignal) {
    return {
      action: 'execute_generic',
      query: text,
      planSteps: [],
    }
  }

  return null
}

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     POST /  —— 多轮对话主入口                           ║
 * ║                                                                        ║
 * ║  SSE 事件流：                                                           ║
 * ║    session → 返回 sessionId                                            ║
 * ║    text    → 流式文本                                                   ║
 * ║    action  → 决策动作（前端据此跳转或执行）                              ║
 * ║    done    → 对话轮次结束                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

router.post('/', async (req: Request, res: Response) => {
  const {
    sessionId: incomingId,
    messages: rawMessages,
    context: rawContext,
    modelProfileId,
    attachmentIds: rawAttachmentIds,
  } = req.body
  const runtimeContext = normalizeRuntimeContext(rawContext)

  if (!rawMessages || !Array.isArray(rawMessages) || !rawMessages.length) {
    res.status(400).json({ error: '缺少 messages 参数' })
    return
  }

  /* ── SSE 初始化 ── */
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const sessionId = incomingId || randomUUID()
  sseWrite(res, 'session', { sessionId })
  const currentState = setSessionState(sessionId, {
    phase: 'clarify',
    approvalRequired: false,
  })
  sseWrite(res, 'state', currentState)

  /* ── 提取最新用户消息（CLI 通过 --continue 维护历史） ── */
  const latestMsg = rawMessages[rawMessages.length - 1]
  const rawQuery = typeof latestMsg?.content === 'string' ? latestMsg.content : ''
  const extracted = extractAttachmentIdsFromText(rawQuery)
  const attachmentIds = Array.from(new Set([
    ...normalizeAttachmentIds(rawAttachmentIds),
    ...extracted.attachmentIds,
  ]))
  const baseQuery = extracted.text || rawQuery.trim()
  const persistUserQuery = baseQuery || rawQuery.trim() || '用户发起了对话分派请求'
  const turnId = randomUUID()
  communicationPreferenceManager.applyFromUserText(baseQuery, persistUserQuery)
  addressingCliExtractor.schedulePersistIfNeeded({
    userText: baseQuery,
    currentPreferredName: addressingManager.get().preferredName,
    evidenceText: persistUserQuery,
  })

  await upsertExternalSession(sessionId, persistUserQuery, 'running', {
    attachmentIds,
    modelProfileId: modelProfileId || undefined,
  })
  const userMessageId = await appendExternalMessage(
    sessionId,
    'user',
    persistUserQuery,
    buildConverseMessageMeta({
      kind: 'user',
      turnId,
      source: 'user',
    }),
  )

  const directMetaReply = buildDirectMetaReply(baseQuery)
  if (directMetaReply) {
    sseWrite(res, 'text', { content: directMetaReply })
    await appendExternalMessage(
      sessionId,
      'assistant',
      directMetaReply,
      buildConverseMessageMeta({
        kind: 'rule_reply',
        turnId,
        source: 'rule',
        replyToMessageId: userMessageId,
      }),
    )
    const shouldQueueDirectMemory = (
      extractStrongCommunicationPreferencePatches(baseQuery).length > 0
      || Boolean(normalizeCommunicationStylePreference(baseQuery))
    )
    if (shouldQueueDirectMemory) {
      const memoryParams = {
        sessionId,
        skillId: '__converse__',
        userQuery: persistUserQuery,
        assistantResponse: directMetaReply,
      }
      if (memoryAsyncQueue.isEnabled()) {
        memoryAsyncQueue.enqueue(memoryParams)
      } else {
        await memoryAsyncQueue.runSync(memoryParams)
      }
    }
    await updateExternalSessionStatus(sessionId, 'completed')
    sseWrite(res, 'done', {})
    res.end()
    return
  }

  const directAction = detectDirectIntentAction(baseQuery)
  if (directAction) {
    const guard = guardAction(directAction, runtimeContext, baseQuery)
    const state = setSessionState(sessionId, {
      phase: guard.phase,
      approvalRequired: guard.approvalRequired,
    })
    sseWrite(res, 'state', {
      ...state,
      validationErrors: guard.validationErrors || [],
    })
    if (guard.ok && guard.action) {
      sseWrite(res, 'action', withAttachmentIds(guard.action, attachmentIds))
      await appendExternalMessage(
        sessionId,
        'assistant',
        summarizeAction(guard.action),
        buildConverseMessageMeta({
          kind: 'action_summary',
          turnId,
          source: 'rule',
          replyToMessageId: userMessageId,
        }),
      )
      await updateExternalSessionStatus(sessionId, 'completed')
    } else if (guard.question) {
      sseWrite(res, 'question', guard.question)
      await appendExternalMessage(
        sessionId,
        'assistant',
        buildQuestionSummary(guard.question),
        buildConverseMessageMeta({
          kind: 'question_summary',
          turnId,
          source: 'rule',
          replyToMessageId: userMessageId,
        }),
      )
      await updateExternalSessionStatus(sessionId, 'waiting_input')
    } else if (guard.validationErrors?.length) {
      const errorText = guard.validationErrors.join('; ')
      sseWrite(res, 'error', { message: errorText })
      await appendExternalMessage(
        sessionId,
        'error',
        errorText,
        buildConverseMessageMeta({
          kind: 'error',
          turnId,
          source: 'rule',
          replyToMessageId: userMessageId,
        }),
      )
      await updateExternalSessionStatus(sessionId, 'failed')
    }
    sseWrite(res, 'done', {})
    res.end()
    return
  }

  /* ── 中止控制器（需在 try 外声明，finally 中清理） ── */
  const abortController = new AbortController()
  let streamError = ''
  let questionSummary = ''
  let terminalStatus: ExternalSessionStatus = 'running'
  let assistantMessageKind: ConverseMessageKind = 'assistant_reply'
  let assistantCanRegenerate = false
  let committedWidget: { widgetId: string; title: string; html: string } | null = null
  let lastDeltaTs = 0
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  const stopHeartbeat = () => {
    if (!heartbeatTimer) return
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  const onClientClose = () => {
    // 允许 converse 在客户端断开后继续执行，完成后可在首页恢复查看结果。
  }
  res.on('close', onClientClose)
  heartbeatTimer = setInterval(() => {
    void updateExternalSessionStatus(sessionId, 'running')
  }, 15_000)

  try {
    const taskDir = join(TASKS_DIR, sessionId)
    const uploadedFiles = await hydrateUploadsToTaskDir(attachmentIds, taskDir)
    if (attachmentIds.length > 0 && uploadedFiles.length === 0) {
      sseWrite(res, 'warning', { content: '未能解析上传文件，请重新上传后重试。' })
    }
    const query = buildConverseQuery(baseQuery, uploadedFiles)

    // Resolve model profile for this round
    const modelOverride = await resolveModelProfile(modelProfileId)
    if (modelProfileId && !modelOverride) {
      sseWrite(res, 'warning', { content: `模型配置 ${modelProfileId} 未找到，已回退到默认模型` })
    }
    const widgetSupport = resolveGenerativeWidgetSupport({
      requested: Boolean(runtimeContext?.capabilities?.canRenderWidgets),
      interfaceType: modelOverride?.interfaceType || process.env.LABORANY_MODEL_INTERFACE,
      model: modelOverride?.model || process.env.ANTHROPIC_MODEL,
      baseUrl: modelOverride?.baseUrl || process.env.ANTHROPIC_BASE_URL,
    })
    const widgetRuntimePlan = planConverseWidgetRuntime(query, widgetSupport)
    const effectiveRuntimeContext: ConverseRuntimeContext | undefined = runtimeContext
      ? {
          ...runtimeContext,
          capabilities: {
            ...runtimeContext.capabilities,
            canRenderWidgets: widgetRuntimePlan.canRenderWidgets,
          },
        }
      : undefined

    /* ── 构建 converse skill ── */
    const memoryCtx = memoryInjector.buildContext({
      skillId: '__converse__',
      userQuery: query,
    })
    const systemPrompt = buildConverseSystemPrompt(memoryCtx, effectiveRuntimeContext)
    const skill = {
      meta: { id: '__converse__', name: '对话助手', description: '多轮对话', kind: 'skill' as const },
      systemPrompt,
      scriptsDir: '',
      tools: [],
    } as Skill

    let fullText = ''
    let hasPendingQuestion = false
    const runCliConverse = async (enableWidgets: boolean): Promise<void> => {

      /* ── 通过 CLI 执行对话 ── */
      await executeAgent({
        skill,
        query,
        sessionId,
        signal: abortController.signal,
        modelOverride,
        enableWidgets,
        onEvent: (event) => {
          if (event.type === 'widget_start') {
            sseWrite(res, 'widget_start', {
              widgetId: event.widgetId,
              title: event.widgetTitle || 'Loading...',
            })
            return
          }
          if (event.type === 'widget_delta') {
            const now = Date.now()
            if (now - lastDeltaTs < 100) return
            lastDeltaTs = now
            sseWrite(res, 'widget_delta', {
              widgetId: event.widgetId,
              html: event.widgetHtml || '',
            })
            return
          }
          if (event.type === 'widget_commit') {
            const widgetId = event.widgetId as string
            const title = event.widgetTitle as string
            const html = event.widgetHtml as string
            committedWidget = { widgetId, title, html }
            sseWrite(res, 'widget_commit', {
              widgetId,
              title,
              html,
            })
            return
          }
          if (event.type === 'widget_error') {
            sseWrite(res, 'widget_error', {
              widgetId: event.widgetId,
              message: event.content,
            })
            return
          }

          if (event.type === 'tool_use') {
            if (/^AskU(?:ser|er)Question$/i.test(event.toolName || '')) {
              const questionPayload = normalizeQuestionPayload(
                event.toolInput || {},
                event.toolUseId,
              )
              if (questionPayload) {
                hasPendingQuestion = true
                terminalStatus = 'waiting_input'
                questionSummary = buildQuestionSummary(questionPayload)
                assistantMessageKind = 'question_summary'
                assistantCanRegenerate = false
                sseWrite(res, 'question', questionPayload)
                abortController.abort()
                return
              }

              const fallbackQuestion = toQuestionPayload([
                {
                  header: '信息补充',
                  question: asString((event.toolInput || {}).question) || '请补充本轮缺失信息，以便我继续执行。',
                  options: [],
                  multiSelect: false,
                },
              ], { questionContext: 'clarify' })
              hasPendingQuestion = true
              terminalStatus = 'waiting_input'
              questionSummary = buildQuestionSummary(fallbackQuestion)
              assistantMessageKind = 'question_summary'
              assistantCanRegenerate = false
              sseWrite(res, 'question', fallbackQuestion)
              abortController.abort()
              return
            }

            sseWrite(res, 'tool_use', {
              toolName: event.toolName,
              toolInput: event.toolInput || {},
              toolUseId: event.toolUseId || null,
            })
            return
          }

          if (event.type === 'tool_result') {
            sseWrite(res, 'tool_result', {
              toolResult: event.toolResult || event.content || '',
              toolUseId: event.toolUseId || null,
            })
            return
          }

          if (event.type === 'text' && event.content) {
            fullText += event.content
            sseWrite(res, 'text', { content: event.content })
          }

          if (event.type === 'status' && event.content) {
            sseWrite(res, 'status', { content: event.content })
          }

          if (event.type === 'stopped') {
            if (hasPendingQuestion) {
              terminalStatus = 'waiting_input'
              sseWrite(res, 'done', {})
            }
            return
          }

          if (event.type === 'done') {
            if (hasPendingQuestion) {
              sseWrite(res, 'done', {})
              return
            }

            const textQuestionPayload = parseQuestionCallFromText(fullText)
            if (textQuestionPayload) {
              hasPendingQuestion = true
              terminalStatus = 'waiting_input'
              questionSummary = buildQuestionSummary(textQuestionPayload)
              assistantMessageKind = 'question_summary'
              assistantCanRegenerate = false
              const state = setSessionState(sessionId, {
                phase: textQuestionPayload.questionContext === 'schedule' ? 'schedule_wizard' : 'clarify',
                approvalRequired: false,
              })
              sseWrite(res, 'state', state)
              sseWrite(res, 'question', textQuestionPayload)
              sseWrite(res, 'done', {})
              return
            }

            /* ── 从累积文本中提取决策标记 ── */
            // A committed widget means this turn stayed in direct explanation mode.
            // Even if the model emits a stray action marker, do not route away.
            const rawAction = committedWidget != null
              ? null
              : (extractAction(fullText) || inferFallbackAction(query, fullText))
            const action = rawAction?.action === 'setup_schedule'
              ? stabilizeScheduleAction(rawAction, query)
              : rawAction
            if (action) {
              assistantMessageKind = 'decision_reply'
              assistantCanRegenerate = false
              const guard = guardAction(action, runtimeContext, query)

              const state = setSessionState(sessionId, {
                phase: guard.phase,
                approvalRequired: guard.approvalRequired,
              })
              sseWrite(res, 'state', {
                ...state,
                validationErrors: guard.validationErrors || [],
              })

              if (guard.ok && guard.action) {
                sseWrite(res, 'action', withAttachmentIds(guard.action, attachmentIds))
              } else if (guard.question) {
                hasPendingQuestion = true
                terminalStatus = 'waiting_input'
                questionSummary = buildQuestionSummary(guard.question)
                assistantMessageKind = 'question_summary'
                assistantCanRegenerate = false
                sseWrite(res, 'question', guard.question)
              } else if (guard.validationErrors?.length) {
                streamError = guard.validationErrors.join('; ')
                assistantCanRegenerate = false
                sseWrite(res, 'error', { message: streamError })
              }
            }
            if (!action && !fullText.trim() && !hasPendingQuestion) {
              const fallbackText = '我还缺少一些关键信息，请再描述一次目标，或告诉我你希望先澄清哪一步。'
              fullText += fallbackText
              assistantMessageKind = 'rule_reply'
              assistantCanRegenerate = false
              sseWrite(res, 'text', {
                content: fallbackText,
              })
            }
            if (!action && !hasPendingQuestion && !streamError && fullText.trim()) {
              assistantMessageKind = 'assistant_reply'
              assistantCanRegenerate = true
            }
            terminalStatus = hasPendingQuestion
              ? 'waiting_input'
              : (streamError ? 'failed' : 'completed')
            sseWrite(res, 'done', {})
          }
          if (event.type === 'error') {
            if (hasPendingQuestion) {
              const msg = asString(event.content)
              if (!msg || /abort|aborted|中止|stopped/i.test(msg)) {
                return
              }
            }
            streamError = asString(event.content) || '对话服务异常'
            terminalStatus = 'failed'
            assistantCanRegenerate = false
            sseWrite(res, 'error', { message: streamError })
          }
        },
      })
    }

    await runCliConverse(widgetRuntimePlan.mode === 'cli')

    const cleanedAssistantText = stripActionMarkers(fullText)
    if (cleanedAssistantText) {
      await appendExternalMessage(
        sessionId,
        'assistant',
        cleanedAssistantText,
        buildConverseMessageMeta({
          kind: assistantMessageKind,
          turnId,
          source: assistantMessageKind === 'assistant_reply' || assistantMessageKind === 'decision_reply' ? 'llm' : 'rule',
          replyToMessageId: userMessageId,
          canRegenerate: assistantCanRegenerate,
        }),
      )
    }
    if (questionSummary) {
      await appendExternalMessage(
        sessionId,
        'assistant',
        questionSummary,
        buildConverseMessageMeta({
          kind: 'question_summary',
          turnId,
          source: 'rule',
          replyToMessageId: userMessageId,
        }),
      )
    }
    if (committedWidget != null) {
      const cw = committedWidget as { widgetId: string; title: string; html: string }
      await appendExternalMessage(
        sessionId,
        'assistant',
        `[widget:${cw.title}]`,
        {
          ...buildConverseMessageMeta({
            kind: 'assistant_reply',
            turnId,
            source: 'llm',
            replyToMessageId: userMessageId,
          }),
          widget: {
            widgetId: cw.widgetId,
            title: cw.title,
            html: cw.html,
            status: 'ready',
          },
        },
      )
    }
    if (streamError) {
      await appendExternalMessage(
        sessionId,
        'error',
        streamError,
        buildConverseMessageMeta({
          kind: 'error',
          turnId,
          source: 'rule',
          replyToMessageId: userMessageId,
        }),
      )
      terminalStatus = 'failed'
    }
    if (terminalStatus !== 'running') {
      await updateExternalSessionStatus(sessionId, terminalStatus)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '对话服务异常'
    console.error('[Converse] 错误:', err)
    streamError = msg
    terminalStatus = 'failed'
    await appendExternalMessage(
      sessionId,
      'error',
      msg,
      buildConverseMessageMeta({
        kind: 'error',
        turnId,
        source: 'rule',
        replyToMessageId: userMessageId,
      }),
    )
    await updateExternalSessionStatus(sessionId, 'failed')
    sseWrite(res, 'error', { message: msg })
  } finally {
    stopHeartbeat()
    res.off('close', onClientClose)
    if (!res.writableEnded) {
      res.end()
    }
  }
})

export const converseRouter = router
