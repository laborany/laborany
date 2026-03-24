import { randomUUID } from 'crypto'
import { normalizeAttachmentIds, stripAttachmentMarkers } from 'laborany-shared'
import type { WechatInboundMessage } from './api.js'
import type { WechatConfig } from './config.js'
import {
  activateConverseOwner,
  activateSkillOwner,
  appendConverseMessage,
  buildUserStateKey,
  clearExecuteSessionId,
  getActiveMode,
  getDefaultModelProfileId,
  getUserState,
  markSkillAwaitingInput,
  markSkillRoundSettled,
  resetUser,
  setConverseSessionId,
  setDefaultModelProfileId,
} from './index.js'
import {
  parseWechatInboundMessageContent,
  sendWechatArtifactsFromSession,
  sendWechatFilesByAbsolutePaths,
} from './media.js'
import {
  flushWechatPendingTexts,
  sendWechatTextChunks,
  rememberWechatContextToken,
} from './push.js'
import { WechatStreamingSession } from './streaming.js'

function getSrcApiBaseUrl(): string {
  return (process.env.SRC_API_BASE_URL || 'http://127.0.0.1:3620/api').replace(/\/+$/, '')
}

function getAgentServiceUrl(): string {
  return (process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '')
}

const PROCESSED_MESSAGE_TTL_MS = 10 * 60 * 1000
const ATTACHMENT_ONLY_EXECUTION_QUERY = '请先查看当前上传的文件，并根据文件内容继续处理。'
const WECHAT_DEFAULT_CRON_TZ = 'Asia/Shanghai'
const CRON_TEMPLATE_MAP: Record<string, { expr: string; label: string }> = {
  daily9: { expr: '0 9 * * *', label: '每天 09:00' },
  hourly: { expr: '0 * * * *', label: '每小时整点' },
  weekday9: { expr: '0 9 * * 1-5', label: '工作日 09:00' },
}
const SCHEDULE_CREATE_DEDUPE_WINDOW_MS = 30 * 1000
const processedMessageIds = new Map<string, number>()
const userProcessingQueue = new Map<string, Promise<void>>()
const recentScheduleCreateMap = new Map<string, number>()
const ASK_USER_QUESTION_CLEAN_RE = /AskU(?:ser|er)Question\(\s*[\s\S]*?\s*\)\s*/gi

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
  sourceChannel?: 'desktop' | 'feishu' | 'qq' | 'wechat'
  sourceWechatUserId?: string
}

type WechatScheduleInput =
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

interface CreateWechatJobInput {
  name?: string
  schedule: WechatScheduleInput
  targetId: string
  targetQuery: string
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
  attachmentIds?: string[]
  filePaths?: string[]
  questions?: unknown[]
  toolName?: string
  phase?: string
}

function buildExecutionQueryWithAttachments(baseQuery: string, attachmentIds?: string[]): string {
  const normalizedAttachmentIds = normalizeAttachmentIds(attachmentIds)
  const cleanQuery = stripAttachmentMarkers(baseQuery || '').trim()
  if (normalizedAttachmentIds.length === 0) return cleanQuery
  const nextQuery = cleanQuery || ATTACHMENT_ONLY_EXECUTION_QUERY
  return `${nextQuery}\n\n[LABORANY_FILE_IDS: ${normalizedAttachmentIds.join(', ')}]`
}

type ExecuteRoundPhase = 'running' | 'waiting_input' | 'completed' | 'failed' | 'aborted'

function isDuplicateMessage(messageId: string): boolean {
  const now = Date.now()

  for (const [id, ts] of processedMessageIds.entries()) {
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

function stripQuestionMarkers(text: string): string {
  return text.replace(ASK_USER_QUESTION_CLEAN_RE, '').trim()
}

function extractQuestionText(event: SseEvent): string {
  if (typeof event.content === 'string' && event.content.trim()) return event.content

  if (Array.isArray(event.questions) && event.questions.length > 0) {
    return event.questions
      .map((question) => {
        if (!question || typeof question !== 'object') return ''
        const record = question as Record<string, unknown>
        const header = typeof record.header === 'string' && record.header.trim()
          ? `【${record.header.trim()}】`
          : ''
        const prompt = typeof record.question === 'string' ? record.question.trim() : ''
        return `${header}${prompt}`.trim()
      })
      .filter(Boolean)
      .join('\n\n')
  }

  return '请继续补充信息。'
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

async function fetchSkillList(): Promise<SkillListItem[]> {
  const response = await fetch(`${getSrcApiBaseUrl()}/skill/list`)
  if (!response.ok) throw new Error(await readJsonError(response))

  const payload = await response.json() as { skills?: unknown[] } | unknown[]
  const source = Array.isArray(payload) ? payload : Array.isArray(payload?.skills) ? payload.skills : []

  return source
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      name: typeof item.name === 'string' ? item.name : '',
      description: typeof item.description === 'string' ? item.description : undefined,
    }))
    .filter(item => item.id && item.name)
}

async function skillExists(skillId: string): Promise<boolean> {
  const id = skillId.trim()
  if (!id) return false
  const skills = await fetchSkillList()
  return skills.some(item => item.id === id)
}

async function fetchModelProfiles(): Promise<ModelProfile[]> {
  const response = await fetch(`${getSrcApiBaseUrl()}/config/model-profiles`)
  if (!response.ok) throw new Error(await readJsonError(response))

  const payload = await response.json() as { profiles?: unknown[] }
  return (Array.isArray(payload.profiles) ? payload.profiles : [])
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      name: typeof item.name === 'string' ? item.name : '',
    }))
    .filter(item => item.id && item.name)
}

function normalizeProfileAlias(raw: string): string {
  const trimmed = raw.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function findModelProfileByAlias(profiles: ModelProfile[], alias: string): ModelProfile | undefined {
  const normalized = normalizeProfileAlias(alias).toLowerCase()
  return profiles.find(profile => (
    profile.id.toLowerCase() === normalized || profile.name.toLowerCase() === normalized
  ))
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
  const tz = job.scheduleCronTz || WECHAT_DEFAULT_CRON_TZ
  return `Cron ${job.scheduleCronExpr || ''} (${tz})`.trim()
}

function buildScheduleFingerprint(schedule: WechatScheduleInput): string {
  if (schedule.kind === 'cron') {
    return ['cron', schedule.expr.trim(), (schedule.tz || WECHAT_DEFAULT_CRON_TZ).trim()].join('::')
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

function resolveScheduleKind(value: unknown, fallback: WechatScheduleInput['kind'] = 'cron'): WechatScheduleInput['kind'] {
  if (value === 'cron' || value === 'at' || value === 'every') return value
  return fallback
}

async function createWechatJob(
  wechatUserId: string,
  input: CreateWechatJobInput,
): Promise<{ job?: CronApiJob; error?: string }> {
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  const payload = {
    name: input.name?.trim() || input.targetQuery.trim().slice(0, 40) || '定时任务',
    description: input.targetQuery.trim(),
    schedule: input.schedule.kind === 'cron'
      ? {
          kind: 'cron',
          expr: input.schedule.expr.trim(),
          tz: (input.schedule.tz || WECHAT_DEFAULT_CRON_TZ).trim(),
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
      channel: 'wechat',
      wechatUserId,
    },
    notify: {
      channel: 'wechat_dm',
      wechatUserId,
    },
  }

  let lastError = '创建任务失败'
  for (let attempt = 0; attempt < 3; attempt += 1) {
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

async function listOwnedCronJobs(wechatUserId: string): Promise<CronApiJob[]> {
  const response = await fetch(
    `${getAgentServiceUrl()}/cron/jobs?sourceChannel=wechat&sourceWechatUserId=${encodeURIComponent(wechatUserId)}`,
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

function tryMarkScheduleCreateFingerprint(key: string): boolean {
  const now = Date.now()
  for (const [fingerprint, ts] of recentScheduleCreateMap) {
    if (now - ts > SCHEDULE_CREATE_DEDUPE_WINDOW_MS) {
      recentScheduleCreateMap.delete(fingerprint)
    }
  }

  const existing = recentScheduleCreateMap.get(key)
  if (existing && now - existing <= SCHEDULE_CREATE_DEDUPE_WINDOW_MS) {
    return false
  }

  recentScheduleCreateMap.set(key, now)
  return true
}

function buildExecuteSessionId(skillId: string, currentSkillId?: string, currentSessionId?: string): string {
  if (currentSkillId === skillId && currentSessionId) {
    return currentSessionId
  }
  return `wechat-${randomUUID().slice(0, 12)}`
}

function shouldContinueActiveSkill(stateKey: string): boolean {
  const state = getUserState(stateKey)
  return getActiveMode(stateKey) === 'skill' && Boolean(state.activeSkillId)
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

function isImmediateCommand(text: string): boolean {
  return ['/stop', '/new', '/home', '/router'].includes(text.trim().split(/\s+/, 1)[0].toLowerCase())
}

async function stopExecuteSession(sessionId?: string): Promise<void> {
  if (!sessionId) return
  try {
    await fetch(`${getSrcApiBaseUrl()}/skill/stop/${sessionId}`, { method: 'POST' })
  } catch {
  }
}

async function sendText(
  config: WechatConfig,
  accountId: string,
  toUserId: string,
  contextToken: string,
  text: string,
): Promise<void> {
  await sendWechatTextChunks(config, toUserId, text, { accountId, contextToken })
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
    } catch (error) {
      fallbackReason = `校验技能 ${preferred} 失败：${error instanceof Error ? error.message : String(error)}`
    }
  }

  const fallback = fallbackSkillId.trim() || '__generic__'
  if (fallback && await skillExists(fallback)) {
    return {
      skillId: fallback,
      fallbackUsed: preferred !== '',
      reason: fallbackReason || undefined,
    }
  }

  throw new Error('当前运行环境无可执行技能，请检查 skills 配置')
}

async function dispatchAction(params: {
  config: WechatConfig
  accountId: string
  toUserId: string
  stateKey: string
  contextToken: string
  actionEvent: SseEvent
  converseText: string
  userText: string
}): Promise<void> {
  const { config, accountId, toUserId, stateKey, contextToken, actionEvent, converseText, userText } = params
  const action = (actionEvent.action || '').trim()
  const targetId = (actionEvent.targetId || '').trim()
  const fallbackQuery = (userText || converseText || '').trim()
  const query = (actionEvent.query || fallbackQuery).trim()
  const executionQuery = buildExecutionQueryWithAttachments(query, actionEvent.attachmentIds)

  if (action === 'send_file') {
    const rawPaths = Array.isArray(actionEvent.filePaths) ? actionEvent.filePaths : []
    const filePaths = rawPaths.map(item => String(item || '').trim()).filter(Boolean).slice(0, 5)
    if (!filePaths.length) {
      await sendText(config, accountId, toUserId, contextToken, '缺少可发送的文件路径，请提供完整绝对路径。')
      return
    }

    const result = await sendWechatFilesByAbsolutePaths(config, toUserId, filePaths, {
      accountId,
      contextToken,
    })
    const summary = `文件发送结果：成功 ${result.sent}，失败 ${result.failed}，未找到 ${result.missing}。`
    const missingDetail = result.missingPaths.length > 0
      ? `未找到路径：${result.missingPaths.slice(0, 3).join('；')}${result.missingPaths.length > 3 ? '；...' : ''}`
      : ''
    const failedDetail = result.failedPaths.length > 0
      ? `发送失败：${result.failedPaths.slice(0, 3).join('；')}${result.failedPaths.length > 3 ? '；...' : ''}`
      : ''
    if (result.sent === 0 || result.failed > 0 || result.missing > 0) {
      await sendText(config, accountId, toUserId, contextToken, [summary, missingDetail, failedDetail].filter(Boolean).join('\n'))
    }
    return
  }

  if (action === 'recommend_capability' && targetId) {
    const resolved = await resolveExecutableSkillId(targetId, config.defaultSkillId)
    const state = getUserState(stateKey)
    const sessionId = buildExecuteSessionId(resolved.skillId, state.activeSkillId, state.executeSessionId)
    await executeSkill(
      config,
      accountId,
      toUserId,
      stateKey,
      resolved.skillId,
      executionQuery || '请执行该技能',
      contextToken,
      sessionId,
    )
    return
  }

  if (action === 'execute_generic' && query) {
    const resolved = await resolveExecutableSkillId(config.defaultSkillId, '__generic__')
    const state = getUserState(stateKey)
    const sessionId = buildExecuteSessionId(resolved.skillId, state.activeSkillId, state.executeSessionId)
    await executeSkill(config, accountId, toUserId, stateKey, resolved.skillId, executionQuery, contextToken, sessionId)
    return
  }

  if (action === 'create_capability') {
    await sendText(config, accountId, toUserId, contextToken, '微信创建技能流程将在后续阶段接入，请先在桌面端或飞书/QQ 通道完成该操作。')
    return
  }

  if (action === 'setup_schedule') {
    const rawScheduleKind = resolveScheduleKind(actionEvent.scheduleKind, 'cron')
    const scheduleQuery = (actionEvent.targetQuery || actionEvent.query || fallbackQuery).trim()
    if (!scheduleQuery) {
      await sendText(config, accountId, toUserId, contextToken, '定时任务信息还不完整，请补充执行内容。')
      return
    }

    let schedule: WechatScheduleInput
    if (rawScheduleKind === 'cron') {
      const cronExpr = (actionEvent.cronExpr || '').trim()
      if (!cronExpr) {
        await sendText(config, accountId, toUserId, contextToken, '定时任务信息还不完整，请补充执行频率。')
        return
      }
      schedule = {
        kind: 'cron',
        expr: cronExpr,
        tz: (actionEvent.tz || WECHAT_DEFAULT_CRON_TZ).trim(),
      }
    } else if (rawScheduleKind === 'at') {
      if (!Number.isFinite(actionEvent.atMs) || (actionEvent.atMs || 0) <= Date.now()) {
        await sendText(config, accountId, toUserId, contextToken, '一次性任务的执行时间无效或早于当前时间，请提供未来时间。')
        return
      }
      schedule = {
        kind: 'at',
        atMs: Math.round(actionEvent.atMs!),
      }
    } else {
      if (!Number.isFinite(actionEvent.everyMs) || (actionEvent.everyMs || 0) <= 0) {
        await sendText(config, accountId, toUserId, contextToken, '固定间隔任务的 everyMs 无效，请提供大于 0 的执行间隔。')
        return
      }
      schedule = {
        kind: 'every',
        everyMs: Math.round(actionEvent.everyMs!),
      }
    }

    let scheduleTargetId = targetId
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
        scheduleTargetId = fallback.skillId
        usedFallbackSkill = true
      } catch {
        scheduleTargetId = ''
      }
    }

    if (!scheduleTargetId) {
      await sendText(config, accountId, toUserId, contextToken, '未找到可用技能，请先指定技能，或检查默认技能配置。')
      return
    }

    const scheduleFingerprint = [
      toUserId,
      buildScheduleFingerprint(schedule),
      scheduleTargetId,
      scheduleQuery,
    ].join('::')
    if (!tryMarkScheduleCreateFingerprint(scheduleFingerprint)) {
      await sendText(config, accountId, toUserId, contextToken, '检测到短时间内重复创建同一条定时任务，已自动忽略。')
      return
    }

    await sendText(config, accountId, toUserId, contextToken, '正在创建定时任务...')
    const result = await createWechatJob(toUserId, {
      name: (actionEvent.name || '').trim() || undefined,
      schedule,
      targetId: scheduleTargetId,
      targetQuery: scheduleQuery,
    })

    if (!result.job) {
      await sendText(config, accountId, toUserId, contextToken, `定时任务创建失败：${result.error || '未知错误'}`)
      return
    }

    const summary = [
      '定时任务创建成功 ✅',
      `任务名：${result.job.name}`,
      `任务 ID：${result.job.id}`,
      `调度：${formatCronScheduleLabel(result.job)}`,
      `目标技能：${result.job.targetId}`,
      usedFallbackSkill ? '未指定具体技能，已自动回退到默认执行技能。' : '',
      result.job.nextRunAtMs ? `下次执行：${new Date(result.job.nextRunAtMs).toLocaleString('zh-CN')}` : '',
      '结果将通过微信私聊主动通知你。',
    ].filter(Boolean).join('\n')
    await sendText(config, accountId, toUserId, contextToken, summary)
    return
  }

  await sendText(config, accountId, toUserId, contextToken, action ? `暂不支持的微信动作：${action}` : '未识别到可执行动作。')
}

async function executeSkill(
  config: WechatConfig,
  accountId: string,
  toUserId: string,
  stateKey: string,
  skillId: string,
  query: string,
  contextToken: string,
  sessionIdOverride?: string,
): Promise<void> {
  const streaming = new WechatStreamingSession(config)
  await streaming.start({ accountId, toUserId, contextToken, title: '执行中' })
  const startTime = Date.now()

  const state = getUserState(stateKey)
  const executeSessionId = sessionIdOverride || buildExecuteSessionId(skillId, state.activeSkillId, state.executeSessionId)
  activateSkillOwner(stateKey, skillId, executeSessionId)
  let runtimeSessionId = executeSessionId
  let roundPhase: ExecuteRoundPhase = 'running'
  let accumulatedText = ''
  let pendingQuestionText = ''

  try {
    const response = await fetch(`${getSrcApiBaseUrl()}/skill/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skill_id: skillId,
        query,
        sessionId: executeSessionId,
        source: 'wechat',
        modelProfileId: getDefaultModelProfileId(stateKey),
        sourceMeta: {
          channel: 'wechat',
          wechatUserId: toUserId,
          wechatAccountId: accountId,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await readJsonError(response)
      await streaming.close(`❌ 执行失败：${errorText}`)
      markSkillRoundSettled(stateKey, `❌ 执行失败：${errorText}`)
      return
    }

    for await (const event of streamSse(response)) {
      if (event.type === 'session' && event.sessionId) {
        if (syncSkillOwnerSession(stateKey, skillId, runtimeSessionId, event.sessionId)) {
          runtimeSessionId = event.sessionId
        }
      }

      if (event.type === 'state') {
        if (event.phase === 'waiting_input') {
          roundPhase = 'waiting_input'
          if (isCurrentSkillOwner(stateKey, skillId, runtimeSessionId)) {
            markSkillAwaitingInput(stateKey, pendingQuestionText || stripQuestionMarkers(accumulatedText))
          }
        } else if (event.phase === 'completed') {
          // Some runtimes emit a trailing completed state after a question event.
          // Once we have entered waiting_input, keep that phase until the user replies.
          if (roundPhase !== 'waiting_input') {
            roundPhase = 'completed'
          }
        } else if (event.phase === 'failed') {
          roundPhase = 'failed'
        } else if (event.phase === 'aborted') {
          roundPhase = 'aborted'
        }
      }

      if (event.type === 'text' && event.content) {
        accumulatedText += event.content
        if (isCurrentSkillOwner(stateKey, skillId, runtimeSessionId)) {
          await streaming.update(stripQuestionMarkers(accumulatedText))
        }
      }

      if (event.type === 'question') {
        pendingQuestionText = extractQuestionText(event)
        if (pendingQuestionText) {
          if (isCurrentSkillOwner(stateKey, skillId, runtimeSessionId)) {
            markSkillAwaitingInput(stateKey, pendingQuestionText)
          }
          roundPhase = 'waiting_input'
        }
      }

      if (event.type === 'tool_use' && event.toolName && isCurrentSkillOwner(stateKey, skillId, runtimeSessionId)) {
        await streaming.update(`${stripQuestionMarkers(accumulatedText)}\n\n🔧 ${event.toolName}...`)
      }

      if (event.type === 'error') {
        const message = event.message || event.content || '执行失败'
        if (isCurrentSkillOwner(stateKey, skillId, runtimeSessionId)) {
          await streaming.close(`❌ ${message}`)
          markSkillRoundSettled(stateKey, stripQuestionMarkers(accumulatedText) || message)
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
      .trim() || '✅ 执行完成'

    if (!isCurrentSkillOwner(stateKey, skillId, runtimeSessionId)) {
      await streaming.close('⏹️ 当前执行已取消')
      return
    }

    if (roundPhase === 'waiting_input') {
      markSkillAwaitingInput(stateKey, pendingQuestionText || finalText)
      await streaming.close(finalText)
      return
    }

    markSkillRoundSettled(stateKey, finalText)
    await streaming.close(finalText)

    if (roundPhase !== 'aborted') {
      try {
        await sendWechatArtifactsFromSession(config, toUserId, runtimeSessionId, startTime, {
          accountId,
          contextToken,
        })
      } catch (error) {
        console.warn('[WeChat] artifact push failed:', error)
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await streaming.close(`❌ 执行失败：${message}`)
    markSkillRoundSettled(stateKey, `❌ 执行失败：${message}`)
  }
}

async function runConverse(
  config: WechatConfig,
  accountId: string,
  toUserId: string,
  stateKey: string,
  userMessage: string,
  contextToken: string,
): Promise<void> {
  const state = getUserState(stateKey)
  const sessionId = state.converseSessionId || `wechat-conv-${randomUUID().slice(0, 12)}`
  if (!state.converseSessionId) {
    setConverseSessionId(stateKey, sessionId)
  }

  activateConverseOwner(stateKey)
  appendConverseMessage(stateKey, 'user', userMessage)

  const streaming = new WechatStreamingSession(config)
  await streaming.start({ accountId, toUserId, contextToken, title: '分析中' })

  try {
    const latestState = getUserState(stateKey)
    const response = await fetch(`${getAgentServiceUrl()}/converse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        messages: latestState.converseMessages,
        source: 'wechat',
        modelProfileId: latestState.defaultModelProfileId,
        context: {
          channel: 'wechat',
          locale: 'zh-CN',
          capabilities: {
            canSendFile: true,
            canSendImage: true,
          },
        },
      }),
    })

    if (!response.ok) {
      const errorText = await readJsonError(response)
      await streaming.close(`❌ 意图分析失败：${errorText}`)
      return
    }

    let accumulatedText = ''
    let actionEvent: SseEvent | null = null

    for await (const event of streamSse(response)) {
      if (event.type === 'text' && event.content) {
        accumulatedText += event.content
        await streaming.update(accumulatedText)
      }

      if (event.type === 'action') {
        actionEvent = event
      }

      if (event.type === 'question') {
        const questionText = extractQuestionText(event)
        appendConverseMessage(stateKey, 'assistant', questionText)
        await streaming.close(questionText)
        return
      }

      if (event.type === 'error') {
        await streaming.close(`❌ ${event.message || event.content || 'Converse error'}`)
        return
      }

      if (event.type === 'done') {
        break
      }
    }

    if (actionEvent) {
      await dispatchAction({
        config,
        accountId,
        toUserId,
        stateKey,
        contextToken,
        actionEvent,
        converseText: accumulatedText,
        userText: userMessage,
      })
      return
    }

    const finalText = accumulatedText.trim() || '我还需要更多信息，请补充你的需求。'
    appendConverseMessage(stateKey, 'assistant', finalText)
    await streaming.close(finalText)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await streaming.close(`❌ 处理失败：${message}`)
  }
}

async function handleCronCommand(
  config: WechatConfig,
  accountId: string,
  toUserId: string,
  contextToken: string,
  parsed: string[],
): Promise<boolean> {
  const sub = (parsed[1] || 'help').toLowerCase()

  if (!parsed[1] || sub === 'help') {
    await sendText(config, accountId, toUserId, contextToken, [
      '微信 /cron 用法：',
      '/cron create "<name>" "<cronExpr>" "<skillId>" "<query>" [tz]',
      '/cron quick <daily9|hourly|weekday9> <skillId> "<query>" [name] [tz]',
      '/cron once "<datetime>" <skillId> "<query>" [name]',
      '/cron every "<duration>" <skillId> "<query>" [name]',
      '/cron list',
      '/cron delete <jobId>',
      '',
      '示例：',
      '/cron create "每日早报" "0 9 * * *" "__generic__" "抓取 AI 新闻并输出 300 字摘要" "Asia/Shanghai"',
      '/cron once "2026-03-30 09:00" "__generic__" "提醒我检查日报" "日报提醒"',
      '/cron every "2h" "__generic__" "抓取库存状态" "库存轮询"',
    ].join('\n'))
    return true
  }

  if (sub === 'create') {
    if (parsed.length < 6) {
      await sendText(config, accountId, toUserId, contextToken, '参数不足。用法：/cron create "<name>" "<cronExpr>" "<skillId>" "<query>" [tz]')
      return true
    }
    const [, , name, cronExpr, skillId, targetQuery, tz] = parsed
    try {
      const exists = await skillExists(skillId)
      if (!exists) {
        await sendText(config, accountId, toUserId, contextToken, `❌ 未找到技能：${skillId}`)
        return true
      }
    } catch (err) {
      await sendText(config, accountId, toUserId, contextToken, `❌ 校验技能失败：${err instanceof Error ? err.message : String(err)}`)
      return true
    }

    const result = await createWechatJob(toUserId, {
      name,
      schedule: {
        kind: 'cron',
        expr: cronExpr,
        tz: tz || WECHAT_DEFAULT_CRON_TZ,
      },
      targetId: skillId,
      targetQuery,
    })
    if (!result.job) {
      await sendText(config, accountId, toUserId, contextToken, `❌ 创建失败：${result.error || '未知错误'}`)
      return true
    }
    await sendText(config, accountId, toUserId, contextToken, [
      '✅ 定时任务已创建',
      `任务名：${result.job.name}`,
      `任务 ID：${result.job.id}`,
      `调度：${formatCronScheduleLabel(result.job)}`,
      result.job.nextRunAtMs ? `下次执行：${new Date(result.job.nextRunAtMs).toLocaleString('zh-CN')}` : '',
      '结果将推送到你的微信私聊。',
    ].filter(Boolean).join('\n'))
    return true
  }

  if (sub === 'quick') {
    if (parsed.length < 5) {
      await sendText(config, accountId, toUserId, contextToken, '参数不足。用法：/cron quick <daily9|hourly|weekday9> <skillId> "<query>" [name] [tz]')
      return true
    }
    const [, , templateRaw, skillId, targetQuery, customName, customTz] = parsed
    const template = CRON_TEMPLATE_MAP[templateRaw.toLowerCase()]
    if (!template) {
      await sendText(config, accountId, toUserId, contextToken, '不支持的模板。可选：daily9、hourly、weekday9')
      return true
    }
    try {
      const exists = await skillExists(skillId)
      if (!exists) {
        await sendText(config, accountId, toUserId, contextToken, `❌ 未找到技能：${skillId}`)
        return true
      }
    } catch (err) {
      await sendText(config, accountId, toUserId, contextToken, `❌ 校验技能失败：${err instanceof Error ? err.message : String(err)}`)
      return true
    }

    const result = await createWechatJob(toUserId, {
      name: customName || `${template.label} - ${targetQuery.slice(0, 20)}`,
      schedule: {
        kind: 'cron',
        expr: template.expr,
        tz: customTz || WECHAT_DEFAULT_CRON_TZ,
      },
      targetId: skillId,
      targetQuery,
    })
    if (!result.job) {
      await sendText(config, accountId, toUserId, contextToken, `❌ 创建失败：${result.error || '未知错误'}`)
      return true
    }
    await sendText(config, accountId, toUserId, contextToken, [
      '✅ 快速定时任务已创建',
      `任务名：${result.job.name}`,
      `任务 ID：${result.job.id}`,
      `调度：${formatCronScheduleLabel(result.job)}`,
    ].join('\n'))
    return true
  }

  if (sub === 'once') {
    if (parsed.length < 5) {
      await sendText(config, accountId, toUserId, contextToken, '参数不足。用法：/cron once "<datetime>" <skillId> "<query>" [name]')
      return true
    }
    const [, , datetimeText, skillId, targetQuery, customName] = parsed
    const atMs = parseDateTimeToMs(datetimeText)
    if (!Number.isFinite(atMs) || (atMs || 0) <= Date.now()) {
      await sendText(config, accountId, toUserId, contextToken, '❌ 时间格式无效，或早于当前时间。请使用如 2026-03-30 09:00 / 2026-03-30T09:00:00+08:00')
      return true
    }
    try {
      const exists = await skillExists(skillId)
      if (!exists) {
        await sendText(config, accountId, toUserId, contextToken, `❌ 未找到技能：${skillId}`)
        return true
      }
    } catch (err) {
      await sendText(config, accountId, toUserId, contextToken, `❌ 校验技能失败：${err instanceof Error ? err.message : String(err)}`)
      return true
    }

    const result = await createWechatJob(toUserId, {
      name: customName || `一次性任务 - ${targetQuery.slice(0, 20)}`,
      schedule: {
        kind: 'at',
        atMs: Math.round(atMs!),
      },
      targetId: skillId,
      targetQuery,
    })
    if (!result.job) {
      await sendText(config, accountId, toUserId, contextToken, `❌ 创建失败：${result.error || '未知错误'}`)
      return true
    }

    await sendText(config, accountId, toUserId, contextToken, [
      '✅ 一次性定时任务已创建',
      `任务名：${result.job.name}`,
      `任务 ID：${result.job.id}`,
      `调度：${formatCronScheduleLabel(result.job)}`,
      result.job.nextRunAtMs ? `执行时间：${new Date(result.job.nextRunAtMs).toLocaleString('zh-CN')}` : '',
    ].filter(Boolean).join('\n'))
    return true
  }

  if (sub === 'every') {
    if (parsed.length < 5) {
      await sendText(config, accountId, toUserId, contextToken, '参数不足。用法：/cron every "<duration>" <skillId> "<query>" [name]')
      return true
    }
    const [, , durationText, skillId, targetQuery, customName] = parsed
    const everyMs = parseDurationToMs(durationText)
    if (!Number.isFinite(everyMs) || (everyMs || 0) <= 0) {
      await sendText(config, accountId, toUserId, contextToken, '❌ 间隔格式无效。请使用如 30m、2h、1d。')
      return true
    }
    try {
      const exists = await skillExists(skillId)
      if (!exists) {
        await sendText(config, accountId, toUserId, contextToken, `❌ 未找到技能：${skillId}`)
        return true
      }
    } catch (err) {
      await sendText(config, accountId, toUserId, contextToken, `❌ 校验技能失败：${err instanceof Error ? err.message : String(err)}`)
      return true
    }

    const result = await createWechatJob(toUserId, {
      name: customName || `间隔任务 - ${targetQuery.slice(0, 20)}`,
      schedule: {
        kind: 'every',
        everyMs: Math.round(everyMs!),
      },
      targetId: skillId,
      targetQuery,
    })
    if (!result.job) {
      await sendText(config, accountId, toUserId, contextToken, `❌ 创建失败：${result.error || '未知错误'}`)
      return true
    }

    await sendText(config, accountId, toUserId, contextToken, [
      '✅ 间隔定时任务已创建',
      `任务名：${result.job.name}`,
      `任务 ID：${result.job.id}`,
      `调度：${formatCronScheduleLabel(result.job)}`,
    ].join('\n'))
    return true
  }

  if (sub === 'list') {
    try {
      const jobs = await listOwnedCronJobs(toUserId)
      if (!jobs.length) {
        await sendText(config, accountId, toUserId, contextToken, '你还没有在微信创建的定时任务。')
        return true
      }

      const lines = jobs.slice(0, 20).map((job) => {
        const enabled = job.enabled ? '启用' : '禁用'
        const nextRun = job.nextRunAtMs ? new Date(job.nextRunAtMs).toLocaleString('zh-CN') : '无'
        return `- ${job.id}\n  ${job.name} | ${enabled} | ${formatCronScheduleLabel(job)} | 下次：${nextRun}`
      })
      await sendText(config, accountId, toUserId, contextToken, ['你的微信定时任务：', ...lines].join('\n'))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await sendText(config, accountId, toUserId, contextToken, `获取定时任务失败：${msg}`)
    }
    return true
  }

  if (sub === 'delete') {
    const jobId = parsed[2]?.trim()
    if (!jobId) {
      await sendText(config, accountId, toUserId, contextToken, '请提供要删除的任务 ID。用法：/cron delete <jobId>')
      return true
    }
    try {
      const job = await getCronJobDetail(jobId)
      if (!job) {
        await sendText(config, accountId, toUserId, contextToken, '任务不存在。')
        return true
      }
      if (job.sourceChannel !== 'wechat' || job.sourceWechatUserId !== toUserId) {
        await sendText(config, accountId, toUserId, contextToken, '你只能删除自己在微信创建的任务。')
        return true
      }
      const result = await deleteCronJob(jobId)
      if (!result.success) {
        await sendText(config, accountId, toUserId, contextToken, `删除失败：${result.error || '未知错误'}`)
        return true
      }
      await sendText(config, accountId, toUserId, contextToken, `✅ 已删除任务：${job.name} (${job.id})`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await sendText(config, accountId, toUserId, contextToken, `删除失败：${msg}`)
    }
    return true
  }

  await sendText(config, accountId, toUserId, contextToken, '未知 /cron 子命令。输入 /cron help 查看用法。')
  return true
}

async function handleCommand(
  config: WechatConfig,
  accountId: string,
  toUserId: string,
  stateKey: string,
  contextToken: string,
  text: string,
): Promise<boolean> {
  const trimmed = text.trim()
  const parts = parseCommandArgs(trimmed)
  const cmd = (parts[0] || '').replace(/^\//, '').toLowerCase()
  const args = parts.slice(1)

  if (!cmd) return false

  if (cmd === 'new') {
    const executeSessionId = getUserState(stateKey).executeSessionId
    resetUser(stateKey)
    await stopExecuteSession(executeSessionId)
    await sendText(config, accountId, toUserId, contextToken, '✅ 会话已重置。')
    return true
  }

  if (cmd === 'help') {
    await sendText(config, accountId, toUserId, contextToken, [
      'LaborAny 微信 Bot 帮助',
      '',
      '/help - 显示帮助',
      '/skills - 列出可用技能',
      '/skill <id> [query] - 执行指定技能',
      '/model [name|id] - 查看或切换模型配置',
      '/new - 重置会话',
      '/home - 返回分发器',
      '/router - 返回分发器',
      '/stop - 中止当前任务',
      '/cron help - 查看定时任务命令',
      '',
      '直接发送消息即可开始对话。',
    ].join('\n'))
    return true
  }

  if (cmd === 'home' || cmd === 'router') {
    const executeSessionId = getUserState(stateKey).executeSessionId
    clearExecuteSessionId(stateKey)
    await stopExecuteSession(executeSessionId)
    await sendText(config, accountId, toUserId, contextToken, '✅ 已返回分发模式。接下来我会先判断该走哪个技能。')
    return true
  }

  if (cmd === 'skills') {
    try {
      const skills = await fetchSkillList()
      if (skills.length === 0) {
        await sendText(config, accountId, toUserId, contextToken, '暂无可用技能。')
        return true
      }

      const content = skills
        .map(skill => `• ${skill.name} (${skill.id})${skill.description ? `\n  ${skill.description}` : ''}`)
        .join('\n\n')
      await sendText(config, accountId, toUserId, contextToken, `可用技能：\n\n${content}`)
    } catch (error) {
      await sendText(config, accountId, toUserId, contextToken, `❌ 获取技能列表失败：${error instanceof Error ? error.message : String(error)}`)
    }
    return true
  }

  if (cmd === 'model') {
    const profileAlias = args.join(' ').trim()
    try {
      const profiles = await fetchModelProfiles()
      const currentId = getDefaultModelProfileId(stateKey)

      if (!profileAlias) {
        if (profiles.length === 0) {
          await sendText(config, accountId, toUserId, contextToken, '当前没有可用模型配置，将使用环境变量默认模型。')
          return true
        }

        const currentProfile = profiles.find(profile => profile.id === currentId)
        const effectiveCurrent = currentProfile || profiles[0]
        const lines = profiles.map((profile, index) => `${profile.id === effectiveCurrent.id ? '•' : '-'} ${profile.name}${index === 0 ? '（默认）' : ''}`)
        await sendText(config, accountId, toUserId, contextToken, [
          `当前模型配置：${effectiveCurrent.name}`,
          '',
          '可用模型配置：',
          ...lines,
          '',
          '使用方式：/model <name 或 id>',
        ].join('\n'))
        return true
      }

      const profile = findModelProfileByAlias(profiles, profileAlias)
      if (profile) {
        setDefaultModelProfileId(stateKey, profile.id)
        await sendText(config, accountId, toUserId, contextToken, `✅ 已切换到模型配置：${profile.name}`)
      } else {
        const hint = profiles.slice(0, 5).map(item => item.name).join('、')
        await sendText(
          config,
          accountId,
          toUserId,
          contextToken,
          hint
            ? `❌ 未找到模型配置：${profileAlias}\n可用配置：${hint}\n使用 /model 查看完整列表`
            : `❌ 未找到模型配置：${profileAlias}`,
        )
      }
    } catch {
      await sendText(config, accountId, toUserId, contextToken, '❌ 切换模型配置失败，请稍后重试。')
    }
    return true
  }

  if (cmd === 'skill') {
    if (args.length === 0) {
      await sendText(config, accountId, toUserId, contextToken, '用法：/skill <id> [query]')
      return true
    }

    const skillId = args[0]
    const query = args.slice(1).join(' ') || '执行此技能'

    try {
      const exists = await skillExists(skillId)
      if (!exists) {
        await sendText(config, accountId, toUserId, contextToken, `❌ 未找到技能：${skillId}。可先输入 /skills 查看可用技能。`)
        return true
      }
    } catch (error) {
      await sendText(config, accountId, toUserId, contextToken, `❌ 校验技能失败：${error instanceof Error ? error.message : String(error)}`)
      return true
    }

    const state = getUserState(stateKey)
    const sessionId = buildExecuteSessionId(skillId, state.activeSkillId, state.executeSessionId)
    await executeSkill(config, accountId, toUserId, stateKey, skillId, query, contextToken, sessionId)
    return true
  }

  if (cmd === 'stop') {
    const state = getUserState(stateKey)
    if (!state.executeSessionId) {
      await sendText(config, accountId, toUserId, contextToken, '当前没有正在执行的任务。')
      return true
    }

    if (state.executeAwaitingInput) {
      await stopExecuteSession(state.executeSessionId)
      markSkillRoundSettled(stateKey, '⏹️ 已取消当前等待中的问题。你可以继续补充新要求，或发送 /home 返回分发器。')
      await sendText(config, accountId, toUserId, contextToken, '⏹️ 已取消当前等待中的问题。你可以继续补充新要求，或发送 /home 返回分发器。')
      return true
    }

    try {
      await stopExecuteSession(state.executeSessionId)
      markSkillRoundSettled(stateKey, '⏹️ 当前执行回合已停止。')
      await sendText(config, accountId, toUserId, contextToken, '⏹️ 任务已中止。')
    } catch {
      await sendText(config, accountId, toUserId, contextToken, '❌ 中止任务失败，请稍后重试。')
    }
    return true
  }

  if (cmd === 'cron') {
    return handleCronCommand(config, accountId, toUserId, contextToken, parts)
  }

  return false
}

function runSerialByStateKey(stateKey: string, task: () => Promise<void>): Promise<void> {
  const previous = userProcessingQueue.get(stateKey) || Promise.resolve()
  const next = previous
    .catch(() => {})
    .then(task)
    .catch((error) => {
      console.error('[WeChat] serial task failed:', error)
    })
    .finally(() => {
      if (userProcessingQueue.get(stateKey) === next) {
        userProcessingQueue.delete(stateKey)
      }
    })

  userProcessingQueue.set(stateKey, next)
  return next
}

export async function handleWechatMessage(config: WechatConfig, message: WechatInboundMessage): Promise<void> {
  const accountId = (config.accountId || 'env-token').trim()
  const fromUserId = (message.from_user_id || '').trim()
  if (!fromUserId) return

  const messageId = `${accountId}:${String(message.message_id || message.seq || randomUUID())}`
  if (isDuplicateMessage(messageId)) return

  const contextToken = (message.context_token || '').trim()
  if (contextToken) {
    rememberWechatContextToken(accountId, fromUserId, contextToken)
  }

  if (config.allowUsers.length > 0 && !config.allowUsers.includes(fromUserId)) {
    if (contextToken) {
      await sendText(config, accountId, fromUserId, contextToken, '当前微信账号未在允许列表中，已拒绝本次请求。')
    }
    return
  }

  if (contextToken) {
    try {
      await flushWechatPendingTexts(config, fromUserId, {
        accountId,
        contextToken,
      })
    } catch (error) {
      console.warn('[WeChat] failed to flush pending notifications:', error)
    }
  }

  const parsed = await parseWechatInboundMessageContent(config, message.item_list)
  const text = parsed.text.trim()
  if (!text) {
    if (contextToken) {
      await sendText(config, accountId, fromUserId, contextToken, '当前版本支持文本、图片和文件消息。语音、视频等类型会在后续阶段接入。')
    }
    return
  }

  const stateKey = buildUserStateKey(accountId, fromUserId)
  const quickCommand = text.trim()

  if (quickCommand && contextToken && isImmediateCommand(quickCommand)) {
    await handleCommand(config, accountId, fromUserId, stateKey, contextToken, quickCommand)
    return
  }

  await runSerialByStateKey(stateKey, async () => {
    if (!contextToken) {
      console.warn(`[WeChat] skip message from ${fromUserId} because context_token is missing`)
      return
    }

    if (text.startsWith('/')) {
      const handled = await handleCommand(config, accountId, fromUserId, stateKey, contextToken, text)
      if (handled) return
    }

    const state = getUserState(stateKey)
    if (shouldContinueActiveSkill(stateKey) && state.activeSkillId) {
      const sessionId = buildExecuteSessionId(state.activeSkillId, state.activeSkillId, state.executeSessionId)
      await executeSkill(config, accountId, fromUserId, stateKey, state.activeSkillId, text, contextToken, sessionId)
      return
    }

    await runConverse(config, accountId, fromUserId, stateKey, text, contextToken)
  })
}
