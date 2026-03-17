/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     QQ Bot 消息处理核心                                  ║
 * ║                                                                        ║
 * ║  职责：处理 QQ Bot 消息事件，执行两阶段流程（Converse + Execute）        ║
 * ║  设计：参考飞书 Bot handler.ts，简化实现                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { randomUUID } from 'crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from 'fs'
import { basename, extname, join } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { UPLOADS_DIR } from '../paths.js'
import type { QQConfig } from './config.js'
import {
  activateConverseOwner,
  activateSkillOwner,
  appendConverseMessage,
  buildUserStateKey,
  clearExecuteSessionId,
  getActiveMode,
  getUserState,
  markSkillAwaitingInput,
  markSkillRoundSettled,
  resetUser,
  setConverseSessionId,
  setDefaultModelProfileId,
  getDefaultModelProfileId,
} from './index.js'
import { QQStreamingSession } from './streaming.js'
import { sendArtifactsToTarget, sendFileToTarget } from './push.js'
import { stripAttachmentMarkers } from 'laborany-shared'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     配置与常量                                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function getSrcApiBaseUrl(): string {
  return (process.env.SRC_API_BASE_URL || 'http://127.0.0.1:3620/api').replace(/\/+$/, '')
}

function getAgentServiceUrl(): string {
  return (process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '')
}

const PROCESSED_MESSAGE_TTL_MS = 10 * 60 * 1000
const MAX_ARTIFACT_BYTES = 20 * 1024 * 1024
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg'])
const QQ_DEFAULT_CRON_TZ = 'Asia/Shanghai'
const CRON_TEMPLATE_MAP: Record<string, { expr: string; label: string }> = {
  daily9: { expr: '0 9 * * *', label: '每天 09:00' },
  hourly: { expr: '0 * * * *', label: '每小时整点' },
  weekday9: { expr: '0 9 * * 1-5', label: '工作日 09:00' },
}
const SCHEDULE_CREATE_DEDUPE_WINDOW_MS = 30 * 1000
const processedMessageIds = new Map<string, number>()
const userProcessingQueue = new Map<string, Promise<void>>()
const recentScheduleCreateMap = new Map<string, number>()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     类型定义                                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */

interface QQMessageEvent {
  id: string
  author: {
    id: string
    username?: string
  }
  content: string
  channel_id?: string
  guild_id?: string
  group_openid?: string
  attachments?: Array<{
    url: string
    content_type?: string
    filename?: string
  }>
  group_id?: string
}

interface ParsedMessage {
  text: string
  fileIds: string[]
}

interface SseEvent {
  type?: string
  sessionId?: string
  content?: string
  message?: string
  action?: string
  scheduleKind?: 'cron' | 'at' | 'every'
  targetId?: string
  query?: string
  targetQuery?: string
  cronExpr?: string
  atMs?: number
  everyMs?: number
  tz?: string
  name?: string
  seedQuery?: string
  capabilityId?: string
  filePaths?: string[]
  questions?: unknown[]
  toolName?: string
}

type MessageType = 'c2c'

interface PassiveReplyContext {
  msgId?: string
  msgSeq: number
}

interface SkillListItem {
  id: string
  name: string
  description?: string
}

interface ModelProfile {
  id: string
  name: string
}

interface CronApiJob {
  id: string
  name: string
  enabled: boolean
  scheduleKind: 'at' | 'every' | 'cron'
  scheduleAtMs?: number
  scheduleEveryMs?: number
  scheduleCronExpr?: string
  scheduleCronTz?: string
  targetId: string
  targetQuery: string
  nextRunAtMs?: number
  sourceChannel?: 'desktop' | 'feishu' | 'qq'
  sourceQqOpenId?: string
}

type QQScheduleInput =
  | {
      kind: 'cron'
      expr: string
      tz?: string
    }
  | {
      kind: 'at'
      atMs: number
    }
  | {
      kind: 'every'
      everyMs: number
    }

interface CreateQQJobInput {
  name?: string
  schedule: QQScheduleInput
  targetId: string
  targetQuery: string
}

interface FileSendResult {
  attempted: number
  sent: number
  failed: number
  missing: number
  missingPaths: string[]
  failedPaths: string[]
}

type ExecuteRoundPhase = 'running' | 'waiting_input' | 'completed' | 'failed' | 'aborted'
const ASK_USER_QUESTION_CLEAN_RE = /AskU(?:ser|er)Question\(\s*[\s\S]*?\s*\)\s*/gi

function buildExecuteSessionId(skillId: string, currentSkillId?: string, currentSessionId?: string): string {
  if (currentSkillId === skillId && currentSessionId) {
    return currentSessionId
  }
  return `qq-${randomUUID()}`
}

function shouldContinueActiveSkill(stateKey: string): boolean {
  const state = getUserState(stateKey)
  return getActiveMode(stateKey) === 'skill' && Boolean(state.activeSkillId)
}

function stripQuestionMarkers(text: string): string {
  return text.replace(ASK_USER_QUESTION_CLEAN_RE, '').trim()
}

function isImmediateCommand(text: string): boolean {
  return ['/stop', '/new', '/home', '/router'].includes(text.trim().split(/\s+/, 1)[0].toLowerCase())
}

function isCurrentSkillOwner(stateKey: string, skillId: string, sessionId: string): boolean {
  const state = getUserState(stateKey)
  if (getActiveMode(stateKey) !== 'skill') return false
  if (state.activeSkillId !== skillId) return false
  return state.executeSessionId === sessionId || state.activeSessionId === sessionId
}

function syncSkillOwnerSession(
  stateKey: string,
  skillId: string,
  previousSessionId: string,
  nextSessionId: string,
): boolean {
  if (!isCurrentSkillOwner(stateKey, skillId, previousSessionId)) return false
  activateSkillOwner(stateKey, skillId, nextSessionId)
  return true
}

async function stopExecuteSession(sessionId?: string): Promise<void> {
  if (!sessionId) return
  try {
    await fetch(`${getSrcApiBaseUrl()}/skill/stop/${sessionId}`, { method: 'POST' })
  } catch {
  }
}

function parseSseBlock(rawBlock: string): SseEvent | null {
  const lines = rawBlock.split(/\r?\n/)
  let dataLine = ''
  let eventName = ''

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.startsWith('event:')) {
      eventName += line.slice(6).trim()
      continue
    }
    if (line.startsWith('data:')) dataLine += line.slice(5).trimStart()
  }

  if (!dataLine) {
    return eventName ? { type: eventName } : null
  }

  try {
    const parsed = JSON.parse(dataLine) as SseEvent
    if (!parsed.type && eventName) parsed.type = eventName
    return parsed
  } catch {
    return eventName ? { type: eventName, content: dataLine } : null
  }
}

async function* streamSse(response: Response): AsyncGenerator<SseEvent> {
  const reader = response.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() || ''

      for (const block of blocks) {
        const event = parseSseBlock(block)
        if (event) yield event
      }
    }

    if (buffer.trim()) {
      const event = parseSseBlock(buffer.trim())
      if (event) yield event
    }
  } finally {
    reader.releaseLock()
  }
}

function extractQuestionText(event: SseEvent): string {
  if (typeof event.content === 'string' && event.content.trim()) return event.content

  const questions = (event as any).questions
  if (Array.isArray(questions) && questions.length > 0) {
    return questions
      .map((question: any) => {
        const header = question?.header ? `【${question.header}】` : ''
        const prompt = typeof question?.question === 'string' ? question.question : ''
        const options = Array.isArray(question?.options)
          ? question.options
            .map((option: any, index: number) => `  ${index + 1}. ${option?.label || ''}${option?.description ? ` - ${option.description}` : ''}`)
            .join('\n')
          : ''
        return `${header}${prompt}\n${options}`.trim()
      })
      .filter(Boolean)
      .join('\n\n')
  }

  return '请继续补充信息。'
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     工具函数                                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function isDuplicateMessage(messageId: string): boolean {
  const now = Date.now()

  for (const [id, ts] of processedMessageIds) {
    if (now - ts > PROCESSED_MESSAGE_TTL_MS) {
      processedMessageIds.delete(id)
    }
  }

  const previous = processedMessageIds.get(messageId)
  if (previous && now - previous <= PROCESSED_MESSAGE_TTL_MS) {
    return true
  }

  processedMessageIds.set(messageId, now)
  return false
}

async function sendText(client: any, targetId: string, targetType: MessageType, text: string): Promise<void> {
  return sendTextWithContext(client, targetId, targetType, text)
}

function nextMsgSeq(replyCtx?: PassiveReplyContext): number | undefined {
  if (!replyCtx?.msgId) return undefined
  return replyCtx.msgSeq + 1
}

function commitMsgSeq(replyCtx: PassiveReplyContext | undefined, sentSeq: number | undefined): void {
  if (!replyCtx || !replyCtx.msgId || !sentSeq) return
  replyCtx.msgSeq = sentSeq
}

async function sendTextWithContext(
  client: any,
  targetId: string,
  targetType: MessageType,
  text: string,
  replyCtx?: PassiveReplyContext,
): Promise<void> {
  try {
    if (targetType === 'c2c') {
      const msgSeq = nextMsgSeq(replyCtx)
      const payload: Record<string, unknown> = { content: text, msg_type: 0 }
      if (replyCtx?.msgId) {
        payload.msg_id = replyCtx.msgId
        payload.msg_seq = msgSeq || 1
      }
      await client.c2cApi.postMessage(targetId, payload)
      commitMsgSeq(replyCtx, msgSeq)
    }
  } catch (err) {
    console.error('[QQ] Failed to send text:', err)
    // 被动回复超时等场景下，尝试降级为主动消息发送
    if (targetType === 'c2c' && replyCtx?.msgId) {
      try {
        await client.c2cApi.postMessage(targetId, { content: text, msg_type: 0 })
      } catch (fallbackErr) {
        console.error('[QQ] Fallback active send failed:', fallbackErr)
      }
    }
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     消息解析                                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */

async function parseMessageContent(
  _client: any,
  event: QQMessageEvent,
  _targetType: MessageType,
): Promise<ParsedMessage> {
  let text = (event.content || '').trim()
  const fileIds: string[] = []

  // 处理附件
  if (Array.isArray(event.attachments) && event.attachments.length > 0) {
    for (const attachment of event.attachments) {
      if (!attachment.url) continue

      try {
        const fileId = randomUUID()
        const ext = extname(attachment.filename || attachment.url).toLowerCase() || '.bin'
        mkdirSync(UPLOADS_DIR, { recursive: true })
        const localPath = join(UPLOADS_DIR, `${fileId}${ext}`)

        // 下载文件
        const response = await fetch(attachment.url)
        if (!response.ok) continue

        const fileStream = createWriteStream(localPath)
        await pipeline(Readable.fromWeb(response.body as any), fileStream)

        fileIds.push(fileId)
        console.log(`[QQ] Downloaded attachment: ${fileId}${ext}`)
      } catch (err) {
        console.warn('[QQ] Failed to download attachment:', err)
      }
    }
  }

  // 如果有文件，添加文件标记
  if (fileIds.length > 0) {
    text += `\n\n[LABORANY_FILE_IDS: ${fileIds.join(', ')}]`
  }

  return { text, fileIds }
}

async function fetchSkillList(): Promise<SkillListItem[]> {
  const res = await fetch(`${getSrcApiBaseUrl()}/skill/list`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const payload = await res.json() as unknown
  const skills: SkillListItem[] = []

  const source = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.skills)
      ? (payload as any).skills
      : []

  for (const item of source) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, any>
    const id = typeof obj.id === 'string' ? obj.id : (typeof obj.meta?.id === 'string' ? obj.meta.id : '')
    const name = typeof obj.name === 'string' ? obj.name : (typeof obj.meta?.name === 'string' ? obj.meta.name : '')
    const description = typeof obj.description === 'string'
      ? obj.description
      : (typeof obj.meta?.description === 'string' ? obj.meta.description : undefined)
    if (!id || !name) continue
    skills.push({ id, name, description })
  }

  return skills
}

function normalizeProfileAlias(raw: string): string {
  const trimmed = raw.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\''))) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

async function fetchModelProfiles(): Promise<ModelProfile[]> {
  const res = await fetch(`${getSrcApiBaseUrl()}/config/model-profiles`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const payload = await res.json() as { profiles?: unknown[] }
  const source = Array.isArray(payload?.profiles) ? payload.profiles : []

  return source
    .filter((item): item is ModelProfile => (
      Boolean(item)
      && typeof (item as Record<string, unknown>).id === 'string'
      && typeof (item as Record<string, unknown>).name === 'string'
    ))
    .map((item) => ({
      id: item.id,
      name: item.name,
    }))
}

function findModelProfileByAlias(profiles: ModelProfile[], alias: string): ModelProfile | undefined {
  const normalized = normalizeProfileAlias(alias).toLowerCase()
  return profiles.find((profile) => (
    profile.id.toLowerCase() === normalized || profile.name.toLowerCase() === normalized
  ))
}

function parseCommandArgs(text: string): string[] {
  const args: string[] = []
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const raw = match[1] ?? match[2] ?? match[3] ?? ''
    const unescaped = raw.replace(/\\(["'\\])/g, '$1')
    args.push(unescaped.trim())
  }
  return args.filter(Boolean)
}

async function readJsonError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  if (!text) return `HTTP ${response.status}`
  try {
    const payload = JSON.parse(text) as { error?: string; message?: string }
    return payload.error || payload.message || text
  } catch {
    return text
  }
}

function formatCronScheduleLabel(job: CronApiJob): string {
  if (job.scheduleKind === 'at') {
    return job.scheduleAtMs ? `一次性 @ ${new Date(job.scheduleAtMs).toLocaleString('zh-CN')}` : '一次性'
  }
  if (job.scheduleKind === 'every') {
    const ms = Number(job.scheduleEveryMs || 0)
    if (ms <= 0) return '周期任务'
    if (ms < 60_000) return `每 ${Math.round(ms / 1000)} 秒`
    if (ms < 3_600_000) return `每 ${Math.round(ms / 60_000)} 分钟`
    if (ms < 86_400_000) return `每 ${Math.round(ms / 3_600_000)} 小时`
    return `每 ${Math.round(ms / 86_400_000)} 天`
  }
  const tz = job.scheduleCronTz || QQ_DEFAULT_CRON_TZ
  return `Cron ${job.scheduleCronExpr || ''} (${tz})`.trim()
}

function formatSkillLabel(skillId: string): string {
  return skillId === '__generic__' ? '通用助手' : skillId
}

function buildScheduleFingerprint(schedule: QQScheduleInput): string {
  if (schedule.kind === 'cron') {
    return ['cron', schedule.expr.trim(), (schedule.tz || QQ_DEFAULT_CRON_TZ).trim()].join('::')
  }
  if (schedule.kind === 'at') {
    return ['at', String(schedule.atMs)].join('::')
  }
  return ['every', String(schedule.everyMs)].join('::')
}

function parseNumberLike(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number.parseFloat(value.trim())
  return Number.isFinite(parsed) ? parsed : null
}

function parseDurationToMs(value: string): number | null {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null

  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(ms|毫秒|s|sec|secs|second|seconds|秒|m|min|mins|minute|minutes|分钟|分|h|hr|hrs|hour|hours|小时|时|d|day|days|天)$/i)
  if (!match) return null

  const amount = Number.parseFloat(match[1])
  if (!Number.isFinite(amount) || amount <= 0) return null

  const unit = match[2].toLowerCase()
  if (['ms', '毫秒'].includes(unit)) return Math.round(amount)
  if (['s', 'sec', 'secs', 'second', 'seconds', '秒'].includes(unit)) return Math.round(amount * 1000)
  if (['m', 'min', 'mins', 'minute', 'minutes', '分钟', '分'].includes(unit)) return Math.round(amount * 60_000)
  if (['h', 'hr', 'hrs', 'hour', 'hours', '小时', '时'].includes(unit)) return Math.round(amount * 3_600_000)
  if (['d', 'day', 'days', '天'].includes(unit)) return Math.round(amount * 86_400_000)
  return null
}

function parseDateTimeToMs(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const numeric = parseNumberLike(trimmed)
  if (numeric !== null) {
    if (numeric > 1_000_000_000_000) return Math.round(numeric)
    if (numeric > 1_000_000_000) return Math.round(numeric * 1000)
  }

  const normalized = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(trimmed)
    ? trimmed.replace(' ', 'T')
    : trimmed
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function resolveScheduleKind(value: unknown, fallback: QQScheduleInput['kind'] = 'cron'): QQScheduleInput['kind'] {
  if (value === 'cron' || value === 'at' || value === 'every') return value
  return fallback
}

async function createQQJob(
  qqOpenId: string,
  input: CreateQQJobInput,
): Promise<{ job?: CronApiJob; error?: string }> {
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  const payload = {
    name: input.name?.trim() || input.targetQuery.trim().slice(0, 40) || '定时任务',
    description: input.targetQuery.trim(),
    schedule: input.schedule.kind === 'cron'
      ? {
          kind: 'cron',
          expr: input.schedule.expr.trim(),
          tz: (input.schedule.tz || QQ_DEFAULT_CRON_TZ).trim(),
        }
      : input.schedule.kind === 'at'
        ? {
            kind: 'at',
            atMs: input.schedule.atMs,
          }
        : {
            kind: 'every',
            everyMs: input.schedule.everyMs,
          },
    target: {
      type: 'skill',
      id: input.targetId.trim(),
      query: input.targetQuery.trim(),
    },
    source: {
      channel: 'qq',
      qqOpenId,
    },
    notify: {
      channel: 'qq_dm',
      qqOpenId,
    },
  }

  let lastError = '创建任务失败'
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${getAgentServiceUrl()}/cron/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (response.ok) {
      const job = await response.json() as CronApiJob
      return { job }
    }
    lastError = await readJsonError(response)
    const shouldRetry = lastError.includes('未找到目标技能')
    if (!shouldRetry || attempt === 2) break
    await wait(500)
  }
  return { error: lastError }
}

async function listOwnedCronJobs(qqOpenId: string): Promise<CronApiJob[]> {
  const response = await fetch(
    `${getAgentServiceUrl()}/cron/jobs?sourceChannel=qq&sourceOpenId=${encodeURIComponent(qqOpenId)}`,
  )
  if (!response.ok) throw new Error(await readJsonError(response))
  const payload = await response.json() as { jobs?: CronApiJob[] }
  return Array.isArray(payload.jobs) ? payload.jobs : []
}

async function getCronJobDetail(jobId: string): Promise<CronApiJob | null> {
  const response = await fetch(`${getAgentServiceUrl()}/cron/jobs/${encodeURIComponent(jobId)}`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(await readJsonError(response))
  return await response.json() as CronApiJob
}

async function deleteCronJob(jobId: string): Promise<{ success: boolean; error?: string }> {
  const response = await fetch(`${getAgentServiceUrl()}/cron/jobs/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    return { success: false, error: await readJsonError(response) }
  }
  return { success: true }
}

async function skillExists(skillId: string): Promise<boolean> {
  const id = skillId.trim()
  if (!id) return false
  const skills = await fetchSkillList()
  return skills.some(item => item.id === id)
}

async function resolveExecutableSkillId(
  preferredSkillId: string,
  fallbackSkillId: string,
): Promise<{ skillId: string; fallbackUsed: boolean; reason?: string }> {
  const preferred = preferredSkillId.trim()
  let fallbackReason = ''
  if (preferred) {
    try {
      if (await skillExists(preferred)) {
        return { skillId: preferred, fallbackUsed: false }
      }
      fallbackReason = `技能 ${preferred} 不可用，已回退默认技能`
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      fallbackReason = `校验技能 ${preferred} 失败：${detail}`
    }
  }

  const fallback = fallbackSkillId.trim() || '__generic__'
  if (fallback) {
    const fallbackExists = await skillExists(fallback)
    if (fallbackExists) {
      const reason = fallbackReason || (preferred
        ? `技能 ${preferred} 不可用，已回退 ${fallback}`
        : undefined)
      return { skillId: fallback, fallbackUsed: preferred !== '', reason }
    }
  }

  throw new Error('当前运行环境无可执行技能，请检查内置 skills 是否完整')
}

async function detectNewSkillIdFromKnown(knownSkillIds: string[]): Promise<string | undefined> {
  if (!knownSkillIds.length) return undefined

  const knownSet = new Set(knownSkillIds)
  try {
    const res = await fetch(`${getSrcApiBaseUrl()}/skill/detect-new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ knownIds: knownSkillIds }),
    })
    if (res.ok) {
      const payload = await res.json() as { newSkills?: Array<{ id?: string }> }
      const candidate = Array.isArray(payload.newSkills)
        ? payload.newSkills.find(item => typeof item?.id === 'string' && !knownSet.has((item.id || '').trim()))
        : undefined
      const id = typeof candidate?.id === 'string' ? candidate.id.trim() : ''
      if (id) return id
    }
  } catch {
  }

  try {
    const current = await fetchSkillList()
    const found = current.find(item => !knownSet.has(item.id))
    if (found?.id) return found.id
  } catch {
  }
  return undefined
}

async function createCapabilityFromSeed(
  stateKey: string,
  seedQuery: string,
): Promise<{ skillId?: string; error?: string; sessionId?: string }> {
  const state = getUserState(stateKey)
  const sessionId = `qq-create-skill-${randomUUID().slice(0, 12)}`
  const creatorQuery = [
    '请创建一个新的 LaborAny skill，满足以下需求：',
    seedQuery.trim(),
    '',
    '要求：生成可复用技能并完成必要文件。',
  ].join('\n')
  const knownSkillIds = await fetchSkillList().then(list => list.map(item => item.id)).catch(() => [])

  const response = await fetch(`${getSrcApiBaseUrl()}/skill/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skill_id: 'skill-creator',
      query: creatorQuery,
      originQuery: seedQuery.trim(),
      sessionId,
      source: 'qq',
      modelProfileId: state.defaultModelProfileId,
    }),
  })

  if (!response.ok) {
    return { error: await readJsonError(response) }
  }

  let createdSkillId = ''
  let runtimeSessionId = sessionId
  let streamError = ''
  for await (const event of streamSse(response)) {
    if (event.type === 'session' && event.sessionId) runtimeSessionId = event.sessionId
    if (event.type === 'created_capability') {
      const id = (event as any).capabilityId || (event as any).primary?.id
      if (typeof id === 'string' && id.trim()) createdSkillId = id.trim()
    }
    if (event.type === 'error') {
      streamError = (event.message || event.content || '技能创建失败').trim()
      break
    }
  }

  if (createdSkillId) return { skillId: createdSkillId, sessionId: runtimeSessionId }

  const inferredSkillId = await detectNewSkillIdFromKnown(knownSkillIds)
  if (inferredSkillId) return { skillId: inferredSkillId, sessionId: runtimeSessionId }

  return {
    error: streamError || '技能创建结束，但未检测到新技能产物',
    sessionId: runtimeSessionId,
  }
}

function tryMarkScheduleCreateFingerprint(key: string): boolean {
  const now = Date.now()
  for (const [fingerprint, ts] of recentScheduleCreateMap) {
    if (now - ts > SCHEDULE_CREATE_DEDUPE_WINDOW_MS) {
      recentScheduleCreateMap.delete(fingerprint)
    }
  }
  const existing = recentScheduleCreateMap.get(key)
  if (existing && now - existing <= SCHEDULE_CREATE_DEDUPE_WINDOW_MS) return false
  recentScheduleCreateMap.set(key, now)
  return true
}

function normalizePathToken(pathToken: string): string {
  let normalized = pathToken.trim().replace(/^["'`]+|["'`]+$/g, '')
  while (/[，。！？；：,.;!?）)】]$/.test(normalized)) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

async function sendFilesByAbsolutePaths(
  client: any,
  targetId: string,
  paths: string[],
): Promise<FileSendResult> {
  const normalizedPaths = paths.map(item => normalizePathToken(item)).filter(Boolean)
  if (!normalizedPaths.length) {
    return { attempted: 0, sent: 0, failed: 0, missing: 0, missingPaths: [], failedPaths: [] }
  }

  let sent = 0
  let failed = 0
  let missing = 0
  const missingPaths: string[] = []
  const failedPaths: string[] = []

  for (const candidatePath of normalizedPaths) {
    const tryPaths = [candidatePath]
    if (candidatePath.includes('/')) tryPaths.push(candidatePath.replace(/\//g, '\\'))
    else if (candidatePath.includes('\\')) tryPaths.push(candidatePath.replace(/\\/g, '/'))

    const absolutePath = tryPaths.find((item) => existsSync(item))
    if (!absolutePath) {
      missing += 1
      missingPaths.push(candidatePath)
      continue
    }

    try {
      const stat = statSync(absolutePath)
      if (!stat.isFile()) {
        missing += 1
        missingPaths.push(candidatePath)
        continue
      }
      if (stat.size > MAX_ARTIFACT_BYTES) {
        failed += 1
        failedPaths.push(absolutePath)
        continue
      }
      const fileName = basename(absolutePath) || absolutePath
      const payload = readFileSync(absolutePath)
      const result = await sendFileToTarget(client, targetId, 'c2c', fileName, payload)
      if (result === 'sent') {
        sent += 1
      } else {
        failed += 1
        failedPaths.push(absolutePath)
      }
    } catch {
      failed += 1
      failedPaths.push(candidatePath)
    }
  }

  return {
    attempted: normalizedPaths.length,
    sent,
    failed,
    missing,
    missingPaths,
    failedPaths,
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     命令处理                                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */

async function handleCommand(
  client: any,
  event: QQMessageEvent,
  targetType: MessageType,
  targetId: string,
  stateKey: string,
  command: string,
  args: string[],
  config: QQConfig,
  rawCommandText?: string,
  replyCtx?: PassiveReplyContext,
): Promise<boolean> {
  const cmd = command.toLowerCase()
    .replace(/^\//, '')

  if (cmd === 'new') {
    const executeSessionId = getUserState(stateKey).executeSessionId
    resetUser(stateKey)
    await stopExecuteSession(executeSessionId)
    await sendTextWithContext(client, targetId, targetType, '✅ 会话已重置', replyCtx)
    return true
  }

  if (cmd === 'help') {
    const helpText = `**LaborAny QQ Bot 帮助**

可用命令：
• /new - 重置会话
• /help - 显示此帮助
• /skill <id> [query] - 执行指定技能
• /home - 返回分发器
• /skills - 列出可用技能
• /cron help - 查看定时任务命令
• /model [name|id] - 查看或切换模型配置
• /stop - 中止当前任务

直接发送消息即可开始对话。`
    await sendTextWithContext(client, targetId, targetType, helpText, replyCtx)
    return true
  }

  if (cmd === 'home' || cmd === 'router') {
    const executeSessionId = getUserState(stateKey).executeSessionId
    clearExecuteSessionId(stateKey)
    await stopExecuteSession(executeSessionId)
    await sendTextWithContext(client, targetId, targetType, '✅ 已返回分发模式。接下来我会先判断该走哪个技能。', replyCtx)
    return true
  }

  if (cmd === 'skills') {
    try {
      const skills = await fetchSkillList()

      if (skills.length === 0) {
        await sendTextWithContext(client, targetId, targetType, '暂无可用技能', replyCtx)
        return true
      }

      const skillList = skills
        .map(s => `• ${s.name} (${s.id})${s.description ? `\n  ${s.description}` : ''}`)
        .join('\n\n')

      await sendTextWithContext(client, targetId, targetType, `**可用技能：**\n\n${skillList}`, replyCtx)
    } catch (err) {
      await sendTextWithContext(client, targetId, targetType, '❌ 获取技能列表失败', replyCtx)
    }
    return true
  }

  if (cmd === 'cron') {
    const parsed = parseCommandArgs((rawCommandText || `${command} ${args.join(' ')}`).trim())
    const sub = (parsed[1] || '').toLowerCase()

    if (!sub || sub === 'help') {
      await sendTextWithContext(client, targetId, targetType, [
        '定时任务命令：',
        '/cron create "<name>" "<cronExpr>" "<skillId>" "<query>" [tz]',
        '/cron quick <daily9|hourly|weekday9> <skillId> "<query>" [name] [tz]',
        '/cron once "<datetime>" <skillId> "<query>" [name]',
        '/cron every "<duration>" <skillId> "<query>" [name]',
        '/cron list',
        '/cron delete <jobId>',
      ].join('\n'), replyCtx)
      return true
    }

    if (sub === 'create') {
      if (parsed.length < 6) {
        await sendTextWithContext(client, targetId, targetType, '参数不足。用法：/cron create "<name>" "<cronExpr>" "<skillId>" "<query>" [tz]', replyCtx)
        return true
      }
      const [, , name, cronExpr, skillId, targetQuery, tz] = parsed
      try {
        const exists = await skillExists(skillId)
        if (!exists) {
          await sendTextWithContext(client, targetId, targetType, `❌ 未找到技能：${skillId}`, replyCtx)
          return true
        }
      } catch (err) {
        await sendTextWithContext(client, targetId, targetType, `❌ 校验技能失败：${err instanceof Error ? err.message : String(err)}`, replyCtx)
        return true
      }

      const result = await createQQJob(event.author.id, {
        name,
        schedule: {
          kind: 'cron',
          expr: cronExpr,
          tz: tz || QQ_DEFAULT_CRON_TZ,
        },
        targetId: skillId,
        targetQuery,
      })
      if (!result.job) {
        await sendTextWithContext(client, targetId, targetType, `❌ 创建失败：${result.error || '未知错误'}`, replyCtx)
        return true
      }

      await sendTextWithContext(client, targetId, targetType, [
        '✅ 定时任务已创建',
        `任务名：${result.job.name}`,
        `任务 ID：${result.job.id}`,
        `调度：${formatCronScheduleLabel(result.job)}`,
        result.job.nextRunAtMs ? `下次执行：${new Date(result.job.nextRunAtMs).toLocaleString('zh-CN')}` : '',
        '结果将推送到你的 QQ 私聊。',
      ].filter(Boolean).join('\n'), replyCtx)
      return true
    }

    if (sub === 'quick') {
      if (parsed.length < 5) {
        await sendTextWithContext(client, targetId, targetType, '参数不足。用法：/cron quick <daily9|hourly|weekday9> <skillId> "<query>" [name] [tz]', replyCtx)
        return true
      }
      const [, , templateRaw, skillId, targetQuery, customName, customTz] = parsed
      const template = CRON_TEMPLATE_MAP[templateRaw.toLowerCase()]
      if (!template) {
        await sendTextWithContext(client, targetId, targetType, '不支持的模板。可选：daily9、hourly、weekday9', replyCtx)
        return true
      }
      try {
        const exists = await skillExists(skillId)
        if (!exists) {
          await sendTextWithContext(client, targetId, targetType, `❌ 未找到技能：${skillId}`, replyCtx)
          return true
        }
      } catch (err) {
        await sendTextWithContext(client, targetId, targetType, `❌ 校验技能失败：${err instanceof Error ? err.message : String(err)}`, replyCtx)
        return true
      }

      const result = await createQQJob(event.author.id, {
        name: customName || `${template.label} - ${targetQuery.slice(0, 20)}`,
        schedule: {
          kind: 'cron',
          expr: template.expr,
          tz: customTz || QQ_DEFAULT_CRON_TZ,
        },
        targetId: skillId,
        targetQuery,
      })
      if (!result.job) {
        await sendTextWithContext(client, targetId, targetType, `❌ 创建失败：${result.error || '未知错误'}`, replyCtx)
        return true
      }
      await sendTextWithContext(client, targetId, targetType, [
        '✅ 快速定时任务已创建',
        `任务名：${result.job.name}`,
        `任务 ID：${result.job.id}`,
        `调度：${formatCronScheduleLabel(result.job)}`,
      ].join('\n'), replyCtx)
      return true
    }

    if (sub === 'once') {
      if (parsed.length < 5) {
        await sendTextWithContext(client, targetId, targetType, '参数不足。用法：/cron once "<datetime>" <skillId> "<query>" [name]', replyCtx)
        return true
      }
      const [, , datetimeText, skillId, targetQuery, customName] = parsed
      const atMs = parseDateTimeToMs(datetimeText)
      if (!Number.isFinite(atMs) || (atMs || 0) <= Date.now()) {
        await sendTextWithContext(client, targetId, targetType, '❌ 时间格式无效，或早于当前时间。请使用如 2026-03-08 08:00 / 2026-03-08T08:00:00+08:00', replyCtx)
        return true
      }
      try {
        const exists = await skillExists(skillId)
        if (!exists) {
          await sendTextWithContext(client, targetId, targetType, `❌ 未找到技能：${skillId}`, replyCtx)
          return true
        }
      } catch (err) {
        await sendTextWithContext(client, targetId, targetType, `❌ 校验技能失败：${err instanceof Error ? err.message : String(err)}`, replyCtx)
        return true
      }

      const result = await createQQJob(event.author.id, {
        name: customName || `一次性任务 - ${targetQuery.slice(0, 20)}`,
        schedule: {
          kind: 'at',
          atMs: Math.round(atMs!),
        },
        targetId: skillId,
        targetQuery,
      })
      if (!result.job) {
        await sendTextWithContext(client, targetId, targetType, `❌ 创建失败：${result.error || '未知错误'}`, replyCtx)
        return true
      }

      await sendTextWithContext(client, targetId, targetType, [
        '✅ 一次性定时任务已创建',
        `任务名：${result.job.name}`,
        `任务 ID：${result.job.id}`,
        `调度：${formatCronScheduleLabel(result.job)}`,
        result.job.nextRunAtMs ? `执行时间：${new Date(result.job.nextRunAtMs).toLocaleString('zh-CN')}` : '',
      ].filter(Boolean).join('\n'), replyCtx)
      return true
    }

    if (sub === 'every') {
      if (parsed.length < 5) {
        await sendTextWithContext(client, targetId, targetType, '参数不足。用法：/cron every "<duration>" <skillId> "<query>" [name]', replyCtx)
        return true
      }
      const [, , durationText, skillId, targetQuery, customName] = parsed
      const everyMs = parseDurationToMs(durationText)
      if (!Number.isFinite(everyMs) || (everyMs || 0) <= 0) {
        await sendTextWithContext(client, targetId, targetType, '❌ 间隔格式无效。请使用如 30m、2h、1d。', replyCtx)
        return true
      }
      try {
        const exists = await skillExists(skillId)
        if (!exists) {
          await sendTextWithContext(client, targetId, targetType, `❌ 未找到技能：${skillId}`, replyCtx)
          return true
        }
      } catch (err) {
        await sendTextWithContext(client, targetId, targetType, `❌ 校验技能失败：${err instanceof Error ? err.message : String(err)}`, replyCtx)
        return true
      }

      const result = await createQQJob(event.author.id, {
        name: customName || `间隔任务 - ${targetQuery.slice(0, 20)}`,
        schedule: {
          kind: 'every',
          everyMs: Math.round(everyMs!),
        },
        targetId: skillId,
        targetQuery,
      })
      if (!result.job) {
        await sendTextWithContext(client, targetId, targetType, `❌ 创建失败：${result.error || '未知错误'}`, replyCtx)
        return true
      }

      await sendTextWithContext(client, targetId, targetType, [
        '✅ 间隔定时任务已创建',
        `任务名：${result.job.name}`,
        `任务 ID：${result.job.id}`,
        `调度：${formatCronScheduleLabel(result.job)}`,
      ].join('\n'), replyCtx)
      return true
    }

    if (sub === 'list') {
      try {
        const jobs = await listOwnedCronJobs(event.author.id)
        if (!jobs.length) {
          await sendTextWithContext(client, targetId, targetType, '你还没有在 QQ 创建的定时任务。', replyCtx)
          return true
        }
        const lines = jobs.slice(0, 20).map((job) => {
          const enabled = job.enabled ? '启用' : '禁用'
          const nextRun = job.nextRunAtMs ? new Date(job.nextRunAtMs).toLocaleString('zh-CN') : '无'
          return `- ${job.id}\n  ${job.name} | ${enabled} | ${formatCronScheduleLabel(job)} | 下次：${nextRun}`
        })
        await sendTextWithContext(client, targetId, targetType, ['你的 QQ 定时任务：', ...lines].join('\n'), replyCtx)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await sendTextWithContext(client, targetId, targetType, `获取定时任务失败：${msg}`, replyCtx)
      }
      return true
    }

    if (sub === 'delete') {
      const jobId = parsed[2]?.trim()
      if (!jobId) {
        await sendTextWithContext(client, targetId, targetType, '请提供要删除的任务 ID。用法：/cron delete <jobId>', replyCtx)
        return true
      }
      try {
        const job = await getCronJobDetail(jobId)
        if (!job) {
          await sendTextWithContext(client, targetId, targetType, '任务不存在。', replyCtx)
          return true
        }
        if (job.sourceChannel !== 'qq' || job.sourceQqOpenId !== event.author.id) {
          await sendTextWithContext(client, targetId, targetType, '你只能删除自己在 QQ 创建的任务。', replyCtx)
          return true
        }
        const result = await deleteCronJob(jobId)
        if (!result.success) {
          await sendTextWithContext(client, targetId, targetType, `删除失败：${result.error || '未知错误'}`, replyCtx)
          return true
        }
        await sendTextWithContext(client, targetId, targetType, `✅ 已删除任务：${job.name} (${job.id})`, replyCtx)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await sendTextWithContext(client, targetId, targetType, `删除失败：${msg}`, replyCtx)
      }
      return true
    }

    await sendTextWithContext(client, targetId, targetType, '未知 /cron 子命令。输入 /cron help 查看用法。', replyCtx)
    return true
  }

  if (cmd === 'model') {
    const profileAlias = args.join(' ').trim()
    try {
      const profiles = await fetchModelProfiles()
      const currentId = getDefaultModelProfileId(stateKey)

      if (!profileAlias) {
        if (profiles.length === 0) {
          await sendTextWithContext(client, targetId, targetType, '当前没有可用模型配置，将使用环境变量默认模型。', replyCtx)
          return true
        }
        const currentProfile = profiles.find((profile) => profile.id === currentId)
        const effectiveCurrent = currentProfile || profiles[0]
        const lines = profiles.map((profile, idx) => {
          const isCurrent = profile.id === effectiveCurrent.id
          return `${isCurrent ? '•' : '-'} ${profile.name}${idx === 0 ? '（默认）' : ''}`
        })
        await sendTextWithContext(client, targetId, targetType, [
          `当前模型配置: ${effectiveCurrent.name}`,
          '',
          '可用模型配置：',
          ...lines,
          '',
          '使用方式：/model <name 或 id>',
        ].join('\n'), replyCtx)
        return true
      }

      const profile = findModelProfileByAlias(profiles, profileAlias)
      if (profile) {
        setDefaultModelProfileId(stateKey, profile.id)
        await sendTextWithContext(client, targetId, targetType, `✅ 已切换到模型配置: ${profile.name}`, replyCtx)
      } else {
        const hint = profiles.slice(0, 5).map((item) => item.name).join('、')
        await sendTextWithContext(
          client,
          targetId,
          targetType,
          hint
            ? `❌ 未找到模型配置: ${profileAlias}\n可用配置：${hint}\n使用 /model 查看完整列表`
            : `❌ 未找到模型配置: ${profileAlias}`,
          replyCtx,
        )
      }
    } catch {
      await sendTextWithContext(client, targetId, targetType, '❌ 切换模型配置失败，请稍后重试', replyCtx)
    }
    return true
  }

  if (cmd === 'skill' && args.length > 0) {
    const skillId = args[0]
    const query = args.slice(1).join(' ') || '执行此技能'

    try {
      const exists = await skillExists(skillId)
      if (!exists) {
        await sendTextWithContext(client, targetId, targetType, `❌ 未找到技能：${skillId}。可先输入 /skills 查看可用技能。`, replyCtx)
        return true
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await sendTextWithContext(client, targetId, targetType, `❌ 校验技能失败：${msg}`, replyCtx)
      return true
    }

    const state = getUserState(stateKey)
    const sessionId = buildExecuteSessionId(skillId, state.activeSkillId, state.executeSessionId)

    await executeSkill(
      client,
      event,
      targetType,
      targetId,
      stateKey,
      skillId,
      query,
      sessionId,
      config,
      replyCtx,
    )
    return true
  }

  if (cmd === 'stop') {
    const state = getUserState(stateKey)
    if (state.executeSessionId) {
      if (state.executeAwaitingInput) {
        await stopExecuteSession(state.executeSessionId)
        markSkillRoundSettled(stateKey, '⏹️ 已取消当前等待中的问题。你可以继续补充新要求，或发送 /home 返回分发器。')
        await sendTextWithContext(client, targetId, targetType, '⏹️ 已取消当前等待中的问题。你可以继续补充新要求，或发送 /home 返回分发器。', replyCtx)
        return true
      }
      try {
        await fetch(`${getSrcApiBaseUrl()}/skill/stop/${state.executeSessionId}`, { method: 'POST' })
        markSkillRoundSettled(stateKey, '⏹️ 当前执行回合已停止')
        await sendTextWithContext(client, targetId, targetType, '⏹️ 任务已中止', replyCtx)
      } catch (err) {
        await sendTextWithContext(client, targetId, targetType, '❌ 中止任务失败', replyCtx)
      }
    } else {
      await sendTextWithContext(client, targetId, targetType, '当前没有正在执行的任务', replyCtx)
    }
    return true
  }

  return false
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     Converse 阶段（意图分析）                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */

async function runConverse(
  client: any,
  event: QQMessageEvent,
  targetType: MessageType,
  targetId: string,
  stateKey: string,
  userMessage: string,
  config: QQConfig,
  replyCtx?: PassiveReplyContext,
): Promise<void> {
  const state = getUserState(stateKey)
  const sessionId = state.converseSessionId || `qq-conv-${randomUUID()}`

  if (!state.converseSessionId) {
    setConverseSessionId(stateKey, sessionId)
  }
  activateConverseOwner(stateKey)

  appendConverseMessage(stateKey, 'user', userMessage)

  const streamingSession = new QQStreamingSession(client, config, replyCtx)
  await streamingSession.start(targetId, targetType, '分析中')

  try {
    const response = await fetch(`${getAgentServiceUrl()}/converse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        messages: state.converseMessages,
        source: 'qq',
        modelProfileId: state.defaultModelProfileId,
        context: {
          channel: 'qq',
          locale: 'zh-CN',
          capabilities: { canSendFile: true, canSendImage: true },
        },
      }),
    })

    if (!response.ok) {
      await streamingSession.close('❌ 意图分析失败')
      return
    }

    let accumulatedText = ''
    let actionEvent: SseEvent | null = null

    for await (const event of streamSse(response)) {
      if (event.type === 'text' && event.content) {
        accumulatedText += event.content
        await streamingSession.update(accumulatedText)
      }

      if (event.type === 'action') {
        actionEvent = event
      }

      if (event.type === 'question') {
        await streamingSession.close(accumulatedText + '\n\n❓ 请回答问题后继续')
        appendConverseMessage(stateKey, 'assistant', accumulatedText)
        return
      }

      if (event.type === 'error') {
        const msg = event.message || event.content || 'Converse error'
        await streamingSession.close(`❌ ${msg}`)
        return
      }

      if (event.type === 'done') {
        break
      }
    }

    if (actionEvent) {
      // 命中执行动作时，交给 execute 阶段统一输出，避免同一轮多次回包导致 QQ 丢消息。
      await dispatchAction(client, actionEvent, targetType, targetId, stateKey, config, accumulatedText, userMessage, replyCtx)
      return
    }

    await streamingSession.close(accumulatedText || '✅ 分析完成')
    appendConverseMessage(stateKey, 'assistant', accumulatedText || '✅ 分析完成')
  } catch (err) {
    console.error('[QQ] Converse error:', err)
    await streamingSession.close('❌ 处理失败')
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     Action 分发                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */

async function dispatchAction(
  client: any,
  event: SseEvent,
  targetType: MessageType,
  targetId: string,
  stateKey: string,
  config: QQConfig,
  converseText: string,
  userText: string,
  replyCtx?: PassiveReplyContext,
): Promise<void> {
  const action = event.action
  const resolvedTargetId = (event.targetId || '').trim()
  const fallbackQuery = (userText || converseText || '').trim()
  const query = (event.query || fallbackQuery).trim()

  if (action === 'send_file') {
    const rawPaths = Array.isArray(event.filePaths) ? event.filePaths : []
    const filePaths = rawPaths.map(item => String(item || '').trim()).filter(Boolean).slice(0, 5)
    if (!filePaths.length) {
      await sendTextWithContext(client, targetId, targetType, '缺少可发送的文件路径，请提供完整绝对路径。', replyCtx)
      return
    }
    const result = await sendFilesByAbsolutePaths(client, targetId, filePaths)
    const summary = `文件发送结果：成功 ${result.sent}，失败 ${result.failed}，未找到 ${result.missing}。`
    await sendTextWithContext(client, targetId, targetType, summary, replyCtx)
    return
  }

  if (action === 'recommend_capability' && resolvedTargetId) {
    const resolved = await resolveExecutableSkillId(resolvedTargetId, config.defaultSkillId)
    const state = getUserState(stateKey)
    const sessionId = buildExecuteSessionId(resolved.skillId, state.activeSkillId, state.executeSessionId)
    await executeSkill(client, null, targetType, targetId, stateKey, resolved.skillId, query || '请执行该技能', sessionId, config, replyCtx)
  } else if (action === 'execute_generic' && query) {
    const resolved = await resolveExecutableSkillId(config.defaultSkillId, '__generic__')
    const state = getUserState(stateKey)
    const sessionId = buildExecuteSessionId(resolved.skillId, state.activeSkillId, state.executeSessionId)
    await executeSkill(client, null, targetType, targetId, stateKey, resolved.skillId, query, sessionId, config, replyCtx)
  } else if (action === 'create_capability') {
    const seedQuery = (event.seedQuery || query || fallbackQuery).trim()
    if (!seedQuery) {
      await sendTextWithContext(client, targetId, targetType, '缺少技能创建需求，请补充你希望沉淀成技能的任务描述。', replyCtx)
      return
    }
    await sendTextWithContext(client, targetId, targetType, '正在创建新技能...', replyCtx)
    const created = await createCapabilityFromSeed(stateKey, seedQuery)
    if (!created.skillId) {
      await sendTextWithContext(client, targetId, targetType, `技能创建失败：${created.error || '未知错误'}`, replyCtx)
      return
    }
    await sendTextWithContext(client, targetId, targetType, [
      '新技能创建成功 ✅',
      `技能 ID：${created.skillId}`,
      '你现在可以直接 /skill <id> 执行，或继续使用 /cron 创建定时任务。',
    ].join('\n'), replyCtx)
  } else if (action === 'setup_schedule') {
    const rawScheduleKind = resolveScheduleKind(
      event.scheduleKind,
      parseNumberLike(event.atMs) !== null
        ? 'at'
        : parseNumberLike(event.everyMs) !== null
          ? 'every'
          : 'cron',
    )
    const cronExpr = (event.cronExpr || '').trim()
    const tz = (event.tz || QQ_DEFAULT_CRON_TZ).trim()
    const atMs = parseNumberLike(event.atMs)
    const everyMs = parseNumberLike(event.everyMs)
    const scheduleQuery = (event.targetQuery || query || fallbackQuery).trim()
    let scheduleTargetId = resolvedTargetId

    if (!scheduleQuery) {
      await sendTextWithContext(client, targetId, targetType, '定时任务信息还不完整，请补充执行频率和执行内容。', replyCtx)
      return
    }

    let schedule: QQScheduleInput | null = null
    if (rawScheduleKind === 'cron') {
      if (!cronExpr) {
        await sendTextWithContext(client, targetId, targetType, '定时任务信息还不完整，请补充执行频率。', replyCtx)
        return
      }
      schedule = {
        kind: 'cron',
        expr: cronExpr,
        tz,
      }
    } else if (rawScheduleKind === 'at') {
      if (!Number.isFinite(atMs) || (atMs || 0) <= Date.now()) {
        await sendTextWithContext(client, targetId, targetType, '一次性任务的执行时间无效或早于当前时间，请提供未来时间。', replyCtx)
        return
      }
      schedule = {
        kind: 'at',
        atMs: Math.round(atMs!),
      }
    } else {
      if (!Number.isFinite(everyMs) || (everyMs || 0) <= 0) {
        await sendTextWithContext(client, targetId, targetType, '固定间隔任务的 everyMs 无效，请提供大于 0 的执行间隔。', replyCtx)
        return
      }
      schedule = {
        kind: 'every',
        everyMs: Math.round(everyMs!),
      }
    }

    if (scheduleTargetId) {
      try {
        const exists = await skillExists(scheduleTargetId)
        if (!exists) scheduleTargetId = ''
      } catch {
        scheduleTargetId = ''
      }
    }

    let usedFallbackSkill = false
    if (!scheduleTargetId) {
      try {
        const fallback = await resolveExecutableSkillId(config.defaultSkillId, '__generic__')
        if (fallback.skillId) {
          scheduleTargetId = fallback.skillId
          usedFallbackSkill = true
        }
      } catch {
      }
    }

    if (!scheduleTargetId) {
      await sendTextWithContext(client, targetId, targetType, '未找到可用技能，正在先创建技能...', replyCtx)
      const created = await createCapabilityFromSeed(stateKey, scheduleQuery)
      if (!created.skillId) {
        await sendTextWithContext(client, targetId, targetType, `定时任务创建失败：自动创建技能未成功（${created.error || '未知错误'}）`, replyCtx)
        return
      }
      scheduleTargetId = created.skillId
    }

    const scheduleFingerprint = [
      targetId,
      buildScheduleFingerprint(schedule),
      scheduleTargetId,
      scheduleQuery,
    ].join('::')
    if (!tryMarkScheduleCreateFingerprint(scheduleFingerprint)) {
      await sendTextWithContext(client, targetId, targetType, '检测到短时间内重复创建同一条定时任务，已自动忽略。', replyCtx)
      return
    }

    await sendTextWithContext(client, targetId, targetType, '正在创建定时任务...', replyCtx)
    const result = await createQQJob(targetId, {
      name: (event.name || '').trim() || undefined,
      schedule,
      targetId: scheduleTargetId,
      targetQuery: scheduleQuery,
    })
    if (!result.job) {
      await sendTextWithContext(client, targetId, targetType, `定时任务创建失败：${result.error || '未知错误'}`, replyCtx)
      return
    }

    const summary = [
      '定时任务创建成功 ✅',
      `任务名：${result.job.name}`,
      `任务 ID：${result.job.id}`,
      `调度：${formatCronScheduleLabel(result.job)}`,
      `目标技能：${formatSkillLabel(result.job.targetId)}`,
      usedFallbackSkill ? '未指定具体技能，已自动回退到默认执行技能。' : '',
      result.job.nextRunAtMs ? `下次执行：${new Date(result.job.nextRunAtMs).toLocaleString('zh-CN')}` : '',
      '结果将通过 QQ 私聊主动通知你。',
    ].filter(Boolean).join('\n')
    await sendTextWithContext(client, targetId, targetType, summary, replyCtx)
  } else {
    await sendTextWithContext(client, targetId, targetType, `⚠️ 不支持的操作: ${action}`, replyCtx)
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     Execute 阶段（技能执行）                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */

async function executeSkill(
  client: any,
  event: QQMessageEvent | null,
  targetType: MessageType,
  targetId: string,
  stateKey: string,
  skillId: string,
  query: string,
  sessionId: string,
  config: QQConfig,
  replyCtx?: PassiveReplyContext,
): Promise<void> {
  const streamingSession = new QQStreamingSession(client, config, replyCtx)
  await streamingSession.start(targetId, targetType, '执行中')

  const startTime = Date.now()
  activateSkillOwner(stateKey, skillId, sessionId)
  let roundPhase: ExecuteRoundPhase = 'running'
  let pendingQuestionText = ''

  try {
    const response = await fetch(`${getSrcApiBaseUrl()}/skill/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skill_id: skillId,
        query,
        sessionId,
        source: 'qq',
        modelProfileId: getDefaultModelProfileId(stateKey),
      }),
    })

    if (!response.ok) {
      await streamingSession.close('❌ 执行失败')
      markSkillRoundSettled(stateKey, '❌ 执行失败')
      return
    }

    let accumulatedText = ''
    for await (const event of streamSse(response)) {
      if (event.type === 'session' && event.sessionId) {
        syncSkillOwnerSession(stateKey, skillId, sessionId, event.sessionId)
        sessionId = event.sessionId
      }

      if (event.type === 'state') {
        const phase = typeof (event as any).phase === 'string' ? (event as any).phase : ''
        if (phase === 'waiting_input') {
          roundPhase = 'waiting_input'
          if (isCurrentSkillOwner(stateKey, skillId, sessionId)) {
            markSkillAwaitingInput(stateKey, pendingQuestionText || stripQuestionMarkers(accumulatedText))
          }
        } else if (phase === 'completed') {
          roundPhase = 'completed'
        } else if (phase === 'failed') {
          roundPhase = 'failed'
        } else if (phase === 'aborted') {
          roundPhase = 'aborted'
        }
      }

      if (event.type === 'text' && event.content) {
        accumulatedText += event.content
        if (isCurrentSkillOwner(stateKey, skillId, sessionId)) {
          await streamingSession.update(stripQuestionMarkers(accumulatedText))
        }
      }

      if (event.type === 'question') {
        pendingQuestionText = extractQuestionText(event)
        if (pendingQuestionText) {
          if (isCurrentSkillOwner(stateKey, skillId, sessionId)) {
            markSkillAwaitingInput(stateKey, pendingQuestionText)
          }
          roundPhase = 'waiting_input'
        }
      }

      if (event.type === 'tool_use' && event.toolName) {
        if (isCurrentSkillOwner(stateKey, skillId, sessionId)) {
          await streamingSession.update(`${stripQuestionMarkers(accumulatedText)}\n\n🔧 ${event.toolName}...`)
        }
      }

      if (event.type === 'error') {
        const msg = event.message || event.content || '执行失败'
        if (isCurrentSkillOwner(stateKey, skillId, sessionId)) {
          await streamingSession.close(`❌ ${msg}`)
          markSkillRoundSettled(stateKey, stripQuestionMarkers(accumulatedText) || msg)
        }
        return
      }

      if (event.type === 'done' || event.type === 'stopped' || event.type === 'aborted') {
        if (event.type === 'aborted') {
          roundPhase = 'aborted'
        }
        break
      }
    }

    const finalText = [stripQuestionMarkers(accumulatedText), pendingQuestionText.trim()]
      .filter(Boolean)
      .join('\n\n')
      .trim() || stripQuestionMarkers(accumulatedText) || '✅ 执行完成'

    if (!isCurrentSkillOwner(stateKey, skillId, sessionId)) {
      await streamingSession.close('⏹️ 当前执行已取消')
      return
    }

    if (roundPhase === 'waiting_input') {
      markSkillAwaitingInput(stateKey, pendingQuestionText || finalText)
      await streamingSession.close(finalText)
      return
    }

    markSkillRoundSettled(stateKey, finalText)
    await streamingSession.close(finalText)

    // 回传产物
    if (roundPhase !== 'aborted') {
      const pushResult = await sendArtifactsToTarget(targetId, targetType, sessionId, startTime)
      void pushResult
    }
  } catch (err) {
    console.error('[QQ] Execute error:', err)
    await streamingSession.close('❌ 执行失败')
    markSkillRoundSettled(stateKey, '❌ 执行失败')
  }
}

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     主入口：handleQQMessage                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

export async function handleQQMessage(
  client: any,
  rawData: unknown,
  config: QQConfig,
  messageType: MessageType,
): Promise<void> {
  try {
    const envelope = rawData as any
    const msg = (envelope?.msg && typeof envelope.msg === 'object') ? envelope.msg : envelope
    const author = (msg?.author && typeof msg.author === 'object') ? msg.author : {}
    const resolvedAuthorId = String(
      author.id ||
      author.user_openid ||
      author.member_openid ||
      author.union_openid ||
      msg?.author_id ||
      '',
    ).trim()

    const event: QQMessageEvent = {
      id: msg?.id || envelope?.eventId || envelope?.id || msg?.msg_id || randomUUID(),
      author: {
        id: resolvedAuthorId,
        username: author.username || '',
      },
      content: msg?.content || '',
      channel_id: msg?.channel_id,
      guild_id: msg?.guild_id,
      group_openid: msg?.group_openid,
      group_id: msg?.group_id,
      attachments: msg?.attachments,
    }
    const replyCtx: PassiveReplyContext = {
      msgId: event.id || undefined,
      msgSeq: 0,
    }

    if (!event.author.id) {
      console.warn('[QQ] Skip message because author id is missing')
      return
    }

    // 去重检查
    if (isDuplicateMessage(event.id)) {
      return
    }

    // 权限检查
    if (config.allowUsers.length > 0 && !config.allowUsers.includes(event.author.id)) {
      console.log(`[QQ] User ${event.author.id} not in allowlist, ignoring message`)
      return
    }

    if (messageType !== 'c2c') {
      console.debug(`[QQ] Ignore non-C2C message type: ${messageType}`)
      return
    }

    // C2C 私聊回包目标：用户 openid
    const targetId = event.author.id

    // 构建状态 key
    const stateKey = buildUserStateKey(event.author.id)

    const quickCommand = (event.content || '').trim()
    if (quickCommand && isImmediateCommand(quickCommand)) {
      const parts = quickCommand.split(/\s+/)
      const command = parts[0]
      const args = parts.slice(1)
      await handleCommand(
        client,
        event,
        messageType,
        targetId,
        stateKey,
        command,
        args,
        config,
        quickCommand,
        replyCtx,
      )
      return
    }

    // 串行处理队列
    const previousTask = userProcessingQueue.get(stateKey) || Promise.resolve()
    const currentTask = previousTask.then(async () => {
      try {
        // 解析消息
        const parsed = await parseMessageContent(client, event, messageType)
        let text = parsed.text.trim()

        // 如果只有文件没有任何说明文本，为避免传空 query 给 Claude CLI，这里补上一段默认说明。
        if (parsed.fileIds.length > 0) {
          const stripped = stripAttachmentMarkers(text)
          if (!stripped) {
            text = '我上传了一些文件，请先读取这些文件再继续处理本轮任务。\n\n' + text
          }
        }

        if (!text.trim()) {
          await sendTextWithContext(client, targetId, messageType, '未检测到有效文本内容，请附带说明或重新发送。', replyCtx)
          return
        }

        // 检查是否是命令
        if (text.startsWith('/')) {
          const parts = text.split(/\s+/)
          const command = parts[0]
          const args = parts.slice(1)

          const handled = await handleCommand(
            client,
            event,
            messageType,
            targetId,
            stateKey,
            command,
            args,
            config,
            text,
            replyCtx,
          )

          if (handled) return
        }

        const currentState = getUserState(stateKey)
        if (shouldContinueActiveSkill(stateKey) && currentState.activeSkillId) {
          const sessionId = buildExecuteSessionId(
            currentState.activeSkillId,
            currentState.activeSkillId,
            currentState.executeSessionId,
          )
          await executeSkill(
            client,
            event,
            messageType,
            targetId,
            stateKey,
            currentState.activeSkillId,
            text,
            sessionId,
            config,
            replyCtx,
          )
          return
        }

        // 普通消息：进入 converse 流程
        await runConverse(client, event, messageType, targetId, stateKey, text, config, replyCtx)
      } catch (err) {
        console.error('[QQ] Message processing error:', err)
        await sendTextWithContext(client, targetId, messageType, '❌ 处理消息时出错', replyCtx)
      }
    })

    userProcessingQueue.set(stateKey, currentTask)

    await currentTask
    userProcessingQueue.delete(stateKey)
  } catch (err) {
    console.error('[QQ] handleQQMessage error:', err)
  }
}
