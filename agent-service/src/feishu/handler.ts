import { randomUUID } from 'crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from 'fs'
import { basename, dirname, extname, join } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { Client } from '@larksuiteoapi/node-sdk'
import { DATA_DIR } from '../paths.js'
import type { FeishuConfig } from './config.js'
import {
  appendConverseMessage,
  buildUserStateKey,
  clearExecuteSessionId,
  getUserState,
  resetUser,
  setConverseSessionId,
  setExecuteSessionId,
  setDefaultModelProfileId,
  getDefaultModelProfileId,
} from './index.js'
import { FeishuStreamingSession } from './streaming.js'

function getSrcApiBaseUrl(): string {
  return (process.env.SRC_API_BASE_URL || 'http://127.0.0.1:3620/api').replace(/\/+$/, '')
}

function getAgentServiceUrl(): string {
  return (process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '')
}

function getFeishuHistorySkillId(): string {
  return process.env.FEISHU_HISTORY_SKILL_ID?.trim() || '__generic__'
}

interface FeishuRawEvent {
  sender?: { sender_id?: { open_id?: string } }
  message?: FeishuMessageEvent['message']
  event?: {
    sender?: { sender_id?: { open_id?: string } }
    message?: FeishuMessageEvent['message']
  }
}

interface FeishuMessageEvent {
  sender: { sender_id: { open_id: string } }
  message: {
    chat_id: string
    message_id: string
    message_type: string
    content: string
    mentions?: Array<{ key: string }>
  }
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
  toolName?: string
  action?: string
  targetId?: string
  query?: string
  targetQuery?: string
  cronExpr?: string
  tz?: string
  name?: string
  seedQuery?: string
  capabilityId?: string
  filePaths?: string[]
  questions?: unknown[]
}

type FeishuResourceType = 'image' | 'file' | 'audio' | 'video'
type ExternalSessionStatus = 'running' | 'completed' | 'failed' | 'stopped' | 'aborted'

interface SkillListItem {
  id: string
  name: string
  description?: string
}

interface ModelProfile {
  id: string
  name: string
}

interface TaskFileNode {
  name: string
  path: string
  type: 'file' | 'folder'
  ext?: string
  size?: number
  mtimeMs?: number
  updatedAt?: string
  children?: TaskFileNode[]
}

interface TaskFileSnapshot {
  path: string
  size: number
  mtimeMs: number
}

interface FileSendResult {
  attempted: number
  sent: number
  failed: number
  missing: number
  missingPaths: string[]
  failedPaths: string[]
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
  sourceChannel?: 'desktop' | 'feishu'
  sourceFeishuOpenId?: string
}

interface CreateFeishuCronInput {
  name?: string
  cronExpr: string
  tz?: string
  targetId: string
  targetQuery: string
}

const PROCESSED_MESSAGE_TTL_MS = 10 * 60 * 1000
const MAX_PROCESSED_MESSAGES = 2000
const MAX_ARTIFACTS_PER_RUN = 5
const MAX_ARTIFACT_BYTES = 20 * 1024 * 1024
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg'])
const IGNORE_ARTIFACT_NAMES = new Set(['history.txt', 'CLAUDE.md'])
const FEISHU_DEFAULT_CRON_TZ = 'Asia/Shanghai'
const CRON_TEMPLATE_MAP: Record<string, { expr: string; label: string }> = {
  daily9: { expr: '0 9 * * *', label: '每天 09:00' },
  hourly: { expr: '0 * * * *', label: '每小时整点' },
  weekday9: { expr: '0 9 * * 1-5', label: '工作日 09:00' },
}
const SCHEDULE_CREATE_DEDUPE_WINDOW_MS = 30 * 1000
const processedMessageIds = new Map<string, number>()
const userProcessingQueue = new Map<string, Promise<void>>()
const recentScheduleCreateMap = new Map<string, number>()

interface FeishuOutputSession {
  update(text: string): Promise<void>
  close(finalText?: string, summary?: string): Promise<void>
  isActive(): boolean
}

class FeishuTextSession implements FeishuOutputSession {
  private closed = false

  constructor(
    private readonly client: Client,
    private readonly chatId: string,
  ) {}

  async update(_text: string): Promise<void> {
    // 文本降级通道不做中间增量更新，避免刷屏
  }

  async close(finalText?: string): Promise<void> {
    if (this.closed) return
    this.closed = true
    const text = (finalText || '').trim()
    if (!text) return
    await sendText(this.client, this.chatId, text)
  }

  isActive(): boolean {
    return !this.closed
  }
}

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
  if (processedMessageIds.size > MAX_PROCESSED_MESSAGES) {
    const oldest = processedMessageIds.keys().next()
    if (!oldest.done) processedMessageIds.delete(oldest.value)
  }
  return false
}

function runSerialByStateKey(stateKey: string, task: () => Promise<void>): Promise<void> {
  const previous = userProcessingQueue.get(stateKey) || Promise.resolve()
  const next = previous
    .catch(() => {})
    .then(task)
    .catch((err) => {
      console.error('[Feishu] serial task failed:', err)
    })
    .finally(() => {
      if (userProcessingQueue.get(stateKey) === next) {
        userProcessingQueue.delete(stateKey)
      }
    })

  userProcessingQueue.set(stateKey, next)
  return next
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

function normalizeIncomingEvent(rawEvent: unknown): FeishuMessageEvent | null {
  const payload = rawEvent as FeishuRawEvent
  const message = payload.message ?? payload.event?.message
  const sender = payload.sender ?? payload.event?.sender
  const openId = sender?.sender_id?.open_id?.trim()
  const chatId = message?.chat_id?.trim()
  const messageId = message?.message_id?.trim()
  const messageType = message?.message_type?.trim()

  if (!openId || !chatId || !messageId || !messageType) return null
  const content = typeof message?.content === 'string' ? message.content : ''

  return {
    sender: { sender_id: { open_id: openId } },
    message: {
      chat_id: chatId,
      message_id: messageId,
      message_type: messageType,
      content,
      mentions: message?.mentions,
    },
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

function getUploadsDir(): string {
  return join(dirname(DATA_DIR), 'uploads')
}

function normalizeApiFilePath(path: string): string {
  return path
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')
}

function flattenTaskFiles(nodes: TaskFileNode[]): TaskFileSnapshot[] {
  const flattened: TaskFileSnapshot[] = []
  const visit = (node: TaskFileNode): void => {
    if (node.type === 'file') {
      flattened.push({
        path: node.path,
        size: Number(node.size || 0),
        mtimeMs: Number(node.mtimeMs || 0),
      })
      return
    }
    if (!Array.isArray(node.children)) return
    node.children.forEach(visit)
  }
  nodes.forEach(visit)
  return flattened
}

function buildSnapshotMap(nodes: TaskFileNode[]): Map<string, TaskFileSnapshot> {
  const map = new Map<string, TaskFileSnapshot>()
  for (const file of flattenTaskFiles(nodes)) {
    map.set(file.path, file)
  }
  return map
}

function shouldIgnoreArtifact(path: string): boolean {
  const name = basename(path)
  if (!name) return true
  if (IGNORE_ARTIFACT_NAMES.has(name)) return true
  if (name.startsWith('.')) return true
  return false
}

function resolveFeishuFileType(fileName: string): 'pdf' | 'doc' | 'xls' | 'ppt' | 'stream' {
  const ext = extname(fileName).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (ext === '.doc' || ext === '.docx') return 'doc'
  if (ext === '.xls' || ext === '.xlsx') return 'xls'
  if (ext === '.ppt' || ext === '.pptx') return 'ppt'
  return 'stream'
}

async function fetchTaskFiles(sessionId: string): Promise<TaskFileNode[]> {
  try {
    const response = await fetch(`${getSrcApiBaseUrl()}/task/${encodeURIComponent(sessionId)}/files`)
    if (!response.ok) return []
    const payload = await response.json() as { files?: unknown }
    return Array.isArray(payload.files) ? payload.files as TaskFileNode[] : []
  } catch {
    return []
  }
}

async function downloadTaskFile(sessionId: string, filePath: string): Promise<Buffer | null> {
  const normalizedPath = normalizeApiFilePath(filePath)
  try {
    const response = await fetch(`${getSrcApiBaseUrl()}/task/${encodeURIComponent(sessionId)}/files/${normalizedPath}`)
    if (!response.ok) return null
    const data = Buffer.from(await response.arrayBuffer())
    if (data.length > MAX_ARTIFACT_BYTES) {
      console.warn(`[Feishu] skip oversized artifact ${filePath}: ${data.length} bytes`)
      return null
    }
    return data
  } catch (error) {
    console.warn(`[Feishu] failed to download task artifact ${filePath}:`, error)
    return null
  }
}

async function sendFileAttachment(
  client: Client,
  chatId: string,
  fileName: string,
  buffer: Buffer,
): Promise<boolean> {
  try {
    const fileRes = await client.im.file.create({
      data: {
        file_type: resolveFeishuFileType(fileName),
        file_name: fileName,
        file: buffer,
      },
    })
    const fileKey = (fileRes as any)?.file_key
    if (!fileKey) return false
    await client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'file',
        content: JSON.stringify({ file_key: fileKey }),
      },
    })
    return true
  } catch (error) {
    console.warn(`[Feishu] failed to send file attachment ${fileName}:`, error)
    return false
  }
}

async function sendImageAttachment(
  client: Client,
  chatId: string,
  fileName: string,
  buffer: Buffer,
): Promise<boolean> {
  try {
    const imageRes = await client.im.image.create({
      data: {
        image_type: 'message',
        image: buffer,
      },
    })
    const imageKey = (imageRes as any)?.image_key
    if (!imageKey) return false
    await client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'image',
        content: JSON.stringify({ image_key: imageKey }),
      },
    })
    return true
  } catch (error) {
    console.warn(`[Feishu] failed to send image attachment ${fileName}:`, error)
    return false
  }
}

async function sendArtifactsFromSession(
  client: Client,
  chatId: string,
  sessionId: string,
  baselineMap: Map<string, TaskFileSnapshot>,
): Promise<void> {
  const latestNodes = await fetchTaskFiles(sessionId)
  const latestMap = buildSnapshotMap(latestNodes)
  if (latestMap.size === 0) return

  const candidates: TaskFileSnapshot[] = []
  for (const [path, nextSnapshot] of latestMap.entries()) {
    if (shouldIgnoreArtifact(path)) continue
    const previous = baselineMap.get(path)
    const isChanged = !previous
      || previous.size !== nextSnapshot.size
      || previous.mtimeMs !== nextSnapshot.mtimeMs
    if (isChanged) candidates.push(nextSnapshot)
  }

  if (candidates.length === 0) return
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)

  let sent = 0
  let failed = 0
  let skipped = 0
  const capped = candidates.slice(0, MAX_ARTIFACTS_PER_RUN)
  skipped += Math.max(0, candidates.length - capped.length)

  for (const item of capped) {
    const fileName = basename(item.path) || item.path
    const payload = await downloadTaskFile(sessionId, item.path)
    if (!payload) {
      skipped += 1
      continue
    }

    const extension = extname(fileName).toLowerCase()
    let ok = false
    if (IMAGE_EXTENSIONS.has(extension)) {
      ok = await sendImageAttachment(client, chatId, fileName, payload)
      if (!ok && extension === '.svg') {
        ok = await sendFileAttachment(client, chatId, fileName, payload)
      }
    } else {
      ok = await sendFileAttachment(client, chatId, fileName, payload)
    }

    if (ok) sent += 1
    else failed += 1
  }

  if (sent > 0 || failed > 0 || skipped > 0) {
    await sendText(
      client,
      chatId,
      `本轮文件回传：成功 ${sent}，失败 ${failed}，跳过 ${skipped}。`,
    )
  }
}

async function downloadFeishuFile(
  client: Client,
  messageId: string,
  fileKey: string | undefined,
  resourceType: FeishuResourceType,
  fileName: string,
): Promise<string | null> {
  if (!fileKey) return null

  try {
    const uploadsDir = getUploadsDir()
    if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true })

    const fileId = randomUUID()
    const ext = extname(fileName) || '.bin'
    const filePath = join(uploadsDir, `${fileId}${ext}`)

    const res = await client.im.messageResource.get({
      path: { message_id: messageId, file_key: fileKey },
      params: { type: resourceType },
    })

    const resAny = res as any
    if (typeof resAny?.writeFile === 'function') {
      await resAny.writeFile(filePath)
    } else if (typeof resAny?.getReadableStream === 'function') {
      await pipeline(resAny.getReadableStream(), createWriteStream(filePath))
    } else if (resAny instanceof Readable) {
      await pipeline(resAny, createWriteStream(filePath))
    } else if (resAny?.data instanceof Readable) {
      await pipeline(resAny.data, createWriteStream(filePath))
    }

    if (!existsSync(filePath)) return null
    console.log(`[Feishu] file downloaded: ${fileName} -> ${fileId}${ext}`)
    return fileId
  } catch (err) {
    console.error('[Feishu] file download failed:', err)
    return null
  }
}

function extractPostContent(raw: Record<string, unknown>): Array<Array<Record<string, unknown>>> {
  const direct = (raw as any).content
  if (Array.isArray(direct)) return direct as Array<Array<Record<string, unknown>>>

  for (const value of Object.values(raw)) {
    const content = (value as any)?.content
    if (Array.isArray(content)) return content as Array<Array<Record<string, unknown>>>
  }

  return []
}

async function parseMessageContent(client: Client, event: FeishuMessageEvent): Promise<ParsedMessage | null> {
  const { message } = event
  const fileIds: string[] = []
  const msgType = message.message_type

  let raw: Record<string, unknown> = {}
  if (message.content) {
    try {
      raw = JSON.parse(message.content) as Record<string, unknown>
    } catch {
      if (msgType === 'text') return { text: message.content, fileIds }
      return null
    }
  }

  if (msgType === 'text') return { text: (raw.text as string) || '', fileIds }

  if (msgType === 'image') {
    const fileId = await downloadFeishuFile(client, message.message_id, raw.image_key as string, 'image', 'image.png')
    if (fileId) fileIds.push(fileId)
    return { text: '', fileIds }
  }

  if (msgType === 'file') {
    const fileId = await downloadFeishuFile(
      client,
      message.message_id,
      raw.file_key as string,
      'file',
      (raw.file_name as string) || 'file.bin',
    )
    if (fileId) fileIds.push(fileId)
    return { text: '', fileIds }
  }

  if (msgType === 'audio') {
    const fileId = await downloadFeishuFile(client, message.message_id, raw.file_key as string, 'audio', 'audio.ogg')
    if (fileId) fileIds.push(fileId)
    return { text: '', fileIds }
  }

  if (msgType === 'media') {
    const fileId = await downloadFeishuFile(client, message.message_id, raw.file_key as string, 'video', 'video.mp4')
    if (fileId) fileIds.push(fileId)
    return { text: '', fileIds }
  }

  if (msgType === 'post') {
    const content = extractPostContent(raw)
    let text = ''

    for (const line of content) {
      for (const node of line) {
        const tag = String(node.tag || '')
        if ((tag === 'text' || tag === 'a' || tag === 'at') && typeof node.text === 'string') {
          text += node.text
        }
        if (tag === 'img') {
          const fileId = await downloadFeishuFile(client, message.message_id, node.image_key as string, 'image', 'image.png')
          if (fileId) fileIds.push(fileId)
        }
        if (tag === 'file') {
          const fileId = await downloadFeishuFile(
            client,
            message.message_id,
            node.file_key as string,
            'file',
            (node.file_name as string) || 'file.bin',
          )
          if (fileId) fileIds.push(fileId)
        }
      }
      text += '\n'
    }

    return { text: text.trim(), fileIds }
  }

  return null
}

async function sendText(client: Client, chatId: string, text: string): Promise<void> {
  try {
    await client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      },
    })
  } catch (err) {
    console.error('[Feishu] send text failed:', err)
  }
}

function normalizePathToken(pathToken: string): string {
  let normalized = pathToken.trim().replace(/^["'`]+|["'`]+$/g, '')
  while (/[，。！？；：,.;!?）)】]$/.test(normalized)) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

async function sendFilesByAbsolutePaths(
  client: Client,
  chatId: string,
  paths: string[],
): Promise<FileSendResult> {
  const normalizedPaths = paths
    .map(item => normalizePathToken(item))
    .filter(Boolean)
  if (!normalizedPaths.length) {
    return {
      attempted: 0,
      sent: 0,
      failed: 0,
      missing: 0,
      missingPaths: [],
      failedPaths: [],
    }
  }

  let sent = 0
  let failed = 0
  let missing = 0
  const missingPaths: string[] = []
  const failedPaths: string[] = []

  for (const candidatePath of normalizedPaths) {
    const tryPaths = [candidatePath]
    if (candidatePath.includes('/')) {
      tryPaths.push(candidatePath.replace(/\//g, '\\'))
    } else if (candidatePath.includes('\\')) {
      tryPaths.push(candidatePath.replace(/\\/g, '/'))
    }

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
      const extension = extname(fileName).toLowerCase()
      let ok = false
      if (IMAGE_EXTENSIONS.has(extension)) {
        ok = await sendImageAttachment(client, chatId, fileName, payload)
        if (!ok && extension === '.svg') {
          ok = await sendFileAttachment(client, chatId, fileName, payload)
        }
      } else {
        ok = await sendFileAttachment(client, chatId, fileName, payload)
      }

      if (ok) sent += 1
      else {
        failed += 1
        failedPaths.push(absolutePath)
      }
    } catch {
      failed += 1
      failedPaths.push(absolutePath)
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

async function sendSkillListInChunks(client: Client, chatId: string, skills: SkillListItem[]): Promise<void> {
  if (skills.length === 0) {
    await sendText(client, chatId, '暂无可用技能')
    return
  }

  const lines = skills.map((skill, index) => `${index + 1}. ${skill.id} - ${skill.name}`)
  const maxChunkLength = 1400
  const chunks: string[] = []
  let current = ''

  for (const line of lines) {
    const nextLine = `${line}\n`
    if ((current + nextLine).length > maxChunkLength) {
      chunks.push(current.trimEnd())
      current = ''
    }
    current += nextLine
  }

  if (current.trim()) chunks.push(current.trimEnd())

  for (let i = 0; i < chunks.length; i++) {
    const header = chunks.length > 1
      ? `可用技能列表 (${i + 1}/${chunks.length})`
      : '可用技能列表'
    await sendText(client, chatId, `${header}\n${chunks[i]}`)
  }
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
  const tz = job.scheduleCronTz || FEISHU_DEFAULT_CRON_TZ
  return `Cron ${job.scheduleCronExpr || ''} (${tz})`.trim()
}

async function createFeishuCronJob(
  openId: string,
  chatId: string,
  input: CreateFeishuCronInput,
): Promise<{ job?: CronApiJob; error?: string }> {
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  const payload = {
    name: input.name?.trim() || input.targetQuery.trim().slice(0, 40) || '定时任务',
    description: input.targetQuery.trim(),
    schedule: {
      kind: 'cron',
      expr: input.cronExpr.trim(),
      tz: (input.tz || FEISHU_DEFAULT_CRON_TZ).trim(),
    },
    target: {
      type: 'skill',
      id: input.targetId.trim(),
      query: input.targetQuery.trim(),
    },
    source: {
      channel: 'feishu',
      feishuOpenId: openId,
      feishuChatId: chatId,
    },
    notify: {
      channel: 'feishu_dm',
      feishuOpenId: openId,
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

async function createCapabilityFromSeed(
  stateKey: string,
  seedQuery: string,
  oneTimeModelProfileId?: string,
): Promise<{ skillId?: string; error?: string; sessionId?: string }> {
  const state = getUserState(stateKey)
  const modelProfileId = oneTimeModelProfileId ?? state.defaultModelProfileId
  const sessionId = `feishu-create-skill-${randomUUID().slice(0, 12)}`
  const creatorQuery = [
    '请创建一个新的 LaborAny skill，满足以下需求：',
    seedQuery.trim(),
    '',
    '要求：生成可复用技能并完成必要文件。'
  ].join('\n')

  const knownSkillIds = await fetchSkillList()
    .then(list => list.map(item => item.id))
    .catch(() => [])

  const response = await fetch(`${getSrcApiBaseUrl()}/skill/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skill_id: 'skill-creator',
      query: creatorQuery,
      originQuery: seedQuery.trim(),
      sessionId,
      source: 'feishu',
      modelProfileId,
    }),
  })

  if (!response.ok) {
    return { error: await readJsonError(response) }
  }

  let createdSkillId = ''
  let runtimeSessionId = sessionId
  let streamError = ''
  for await (const event of streamSse(response)) {
    if (event.type === 'session' && event.sessionId) {
      runtimeSessionId = event.sessionId
    }
    if (event.type === 'created_capability') {
      const id = (event as any).capabilityId || (event as any).primary?.id
      if (typeof id === 'string' && id.trim()) {
        createdSkillId = id.trim()
      }
    }
    if (event.type === 'error') {
      streamError = (event.message || event.content || '技能创建失败').trim()
      break
    }
  }

  if (createdSkillId) {
    return { skillId: createdSkillId, sessionId: runtimeSessionId }
  }

  const inferredSkillId = await detectNewSkillIdFromKnown(knownSkillIds)
  if (inferredSkillId) {
    return { skillId: inferredSkillId, sessionId: runtimeSessionId }
  }

  return {
    error: streamError || '技能创建结束，但未检测到新技能产物',
    sessionId: runtimeSessionId,
  }
}

async function listOwnedCronJobs(openId: string): Promise<CronApiJob[]> {
  const response = await fetch(
    `${getAgentServiceUrl()}/cron/jobs?sourceChannel=feishu&sourceOpenId=${encodeURIComponent(openId)}`,
  )
  if (!response.ok) {
    throw new Error(await readJsonError(response))
  }
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

async function upsertExternalSession(
  sessionId: string,
  query: string,
  status: ExternalSessionStatus = 'running',
): Promise<boolean> {
  const normalizedQuery = query.trim() || '飞书会话'
  try {
    const response = await fetch(`${getSrcApiBaseUrl()}/sessions/external/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        query: normalizedQuery,
        status,
        skillId: getFeishuHistorySkillId(),
      }),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.warn(`[Feishu] upsert external session failed: status=${response.status} ${detail}`)
      return false
    }
    return true
  } catch (err) {
    console.warn('[Feishu] failed to upsert external session:', err)
    return false
  }
}

async function appendExternalMessage(
  sessionId: string,
  type: 'user' | 'assistant' | 'error' | 'system',
  content: string,
): Promise<void> {
  const normalizedContent = content.trim()
  if (!normalizedContent) return

  const payload = JSON.stringify({ sessionId, type, content: normalizedContent })

  try {
    let response = await fetch(`${getSrcApiBaseUrl()}/sessions/external/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    })

    if (response.status === 404) {
      const queryHint = type === 'user' ? normalizedContent : '飞书会话'
      const created = await upsertExternalSession(sessionId, queryHint, 'running')
      if (created) {
        response = await fetch(`${getSrcApiBaseUrl()}/sessions/external/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        })
      }
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.warn(`[Feishu] append external message failed: status=${response.status} ${detail}`)
    }
  } catch (err) {
    console.warn('[Feishu] failed to append external message:', err)
  }
}

async function updateExternalSessionStatus(
  sessionId: string,
  status: ExternalSessionStatus,
): Promise<void> {
  try {
    let response = await fetch(`${getSrcApiBaseUrl()}/sessions/external/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, status }),
    })

    if (response.status === 404) {
      const created = await upsertExternalSession(sessionId, '飞书会话', status)
      if (created) {
        response = await fetch(`${getSrcApiBaseUrl()}/sessions/external/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, status }),
        })
      }
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.warn(`[Feishu] update external status failed: status=${response.status} ${detail}`)
    }
  } catch (err) {
    console.warn('[Feishu] failed to update external session status:', err)
  }
}

async function executeSkill(
  client: Client,
  chatId: string,
  stateKey: string,
  skillId: string,
  query: string,
  card: FeishuOutputSession | null,
  oneTimeModelProfileId?: string,
): Promise<void> {
  const state = getUserState(stateKey)
  const modelProfileId = oneTimeModelProfileId ?? state.defaultModelProfileId
  const executeSessionId = state.executeSessionId || `feishu-${randomUUID().slice(0, 12)}`
  setExecuteSessionId(stateKey, executeSessionId)
  let runtimeSessionId = executeSessionId
  let baselineSessionId = executeSessionId
  let baselineMap = buildSnapshotMap(await fetchTaskFiles(executeSessionId))

  try {
    const response = await fetch(`${getSrcApiBaseUrl()}/skill/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skill_id: skillId,
        query,
        sessionId: executeSessionId,
        modelProfileId,
        source: 'feishu',
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => `HTTP ${response.status}`)
      throw new Error(`skill/execute failed: ${errText}`)
    }

    let accumulated = ''
    for await (const event of streamSse(response)) {
      if (event.type === 'session' && event.sessionId) {
        runtimeSessionId = event.sessionId
        setExecuteSessionId(stateKey, event.sessionId)
        if (event.sessionId !== baselineSessionId) {
          baselineSessionId = event.sessionId
          baselineMap = buildSnapshotMap(await fetchTaskFiles(event.sessionId))
        }
      }

      if (event.type === 'text' && event.content) {
        accumulated += event.content
        if (card) await card.update(accumulated)
      }

      if (event.type === 'tool_use' && event.toolName && card) {
        await card.update(`${accumulated}\n\n🔧 ${event.toolName}...`)
      }

      if (event.type === 'error') {
        const msg = event.message || event.content || 'Execution error'
        if (card) await card.close(accumulated || msg)
        else await sendText(client, chatId, `❌ ${msg}`)
        throw new Error(msg)
      }

      if (event.type === 'done' || event.type === 'stopped' || event.type === 'aborted') {
        break
      }
    }

    if (card) {
      await card.close(accumulated || '✅ Execution completed')
    } else {
      await sendText(client, chatId, accumulated || '✅ Execution completed')
    }
    await sendArtifactsFromSession(client, chatId, runtimeSessionId, baselineMap)
  } finally {
    // session 仅在 /new (resetUser) 或 /stop (clearExecuteSessionId) 时清除
  }
}

function extractQuestionText(event: SseEvent): string {
  if (typeof event.content === 'string' && event.content.trim()) return event.content

  const questions = (event as any).questions
  if (Array.isArray(questions) && questions.length > 0) {
    return questions
      .map((q: any) => {
        const header = q?.header ? `【${q.header}】` : ''
        const question = typeof q?.question === 'string' ? q.question : ''
        const options = Array.isArray(q?.options)
          ? q.options.map((o: any, i: number) => `  ${i + 1}. ${o?.label || ''}${o?.description ? ` - ${o.description}` : ''}`).join('\n')
          : ''
        return `${header}${question}\n${options}`.trim()
      })
      .filter(Boolean)
      .join('\n\n')
  }

  return 'Please provide more information.'
}

function stripMentions(text: string, mentions?: Array<{ key: string }>): string {
  if (!mentions?.length) return text
  let result = text
  for (const mention of mentions) {
    if (mention?.key) {
      result = result.replace(mention.key, '').trim()
    }
  }
  return result
}

function tryExtractQuickTextCommand(event: FeishuMessageEvent): string {
  if (event.message.message_type !== 'text') return ''
  const rawContent = event.message.content || ''
  if (!rawContent.trim()) return ''
  try {
    const parsed = JSON.parse(rawContent) as { text?: unknown }
    if (typeof parsed.text === 'string') {
      return stripMentions(parsed.text, event.message.mentions).trim()
    }
  } catch {
    return stripMentions(rawContent, event.message.mentions).trim()
  }
  return ''
}

async function dispatchAction(
  client: Client,
  config: FeishuConfig,
  openId: string,
  chatId: string,
  stateKey: string,
  actionEvent: SseEvent,
  converseText: string,
  card: FeishuOutputSession,
  historySessionId: string,
  modelProfileIdOverride?: string,
): Promise<void> {
  const actionType = (actionEvent as any)?.action || ''
  const targetId = (actionEvent as any)?.targetId || ''
  const query = (actionEvent as any)?.query || converseText || ''

  if (actionType === 'send_file') {
    const rawPaths = Array.isArray((actionEvent as any)?.filePaths)
      ? (actionEvent as any).filePaths
      : []
    const filePaths = rawPaths
      .map((item: unknown) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 5)

    if (!filePaths.length) {
      const msg = '缺少可发送的文件路径，请提供完整绝对路径。'
      await appendExternalMessage(historySessionId, 'assistant', msg)
      await updateExternalSessionStatus(historySessionId, 'completed')
      await card.close(msg)
      return
    }

    await appendExternalMessage(
      historySessionId,
      'assistant',
      `已收到文件发送请求，共 ${filePaths.length} 个路径。`,
    )
    const result = await sendFilesByAbsolutePaths(client, chatId, filePaths)
    const summary = `文件发送结果：成功 ${result.sent}，失败 ${result.failed}，未找到 ${result.missing}。`
    const missingDetail = result.missingPaths.length > 0
      ? `未找到路径：${result.missingPaths.slice(0, 3).join('；')}${result.missingPaths.length > 3 ? '；...' : ''}`
      : ''
    const failedDetail = result.failedPaths.length > 0
      ? `发送失败：${result.failedPaths.slice(0, 3).join('；')}${result.failedPaths.length > 3 ? '；...' : ''}`
      : ''
    const detailParts = [summary, missingDetail, failedDetail].filter(Boolean)
    await appendExternalMessage(historySessionId, 'assistant', detailParts.join('\n'))
    await updateExternalSessionStatus(historySessionId, 'completed')
    await card.close(summary)
    return
  }

  if (actionType === 'recommend_capability' && targetId) {
    const resolved = await resolveExecutableSkillId(targetId, config.defaultSkillId)
    const notifyText = resolved.fallbackUsed
      ? `匹配技能 ${targetId} 失败，已回退到 ${resolved.skillId} 执行。`
      : `已匹配技能 ${targetId}，任务已开始执行。`
    await card.update(`Matched capability ${resolved.skillId}, executing...`)
    await appendExternalMessage(historySessionId, 'assistant', notifyText)
    await executeSkill(client, chatId, stateKey, resolved.skillId, query, card, modelProfileIdOverride)
    await updateExternalSessionStatus(historySessionId, 'completed')
    return
  }

  if (actionType === 'execute_generic') {
    const resolved = await resolveExecutableSkillId(config.defaultSkillId, '__generic__')
    await card.update('Executing in generic mode...')
    const hint = resolved.fallbackUsed && resolved.reason
      ? `已进入通用执行模式（${resolved.reason}）。`
      : '已进入通用执行模式，任务已开始。'
    await appendExternalMessage(historySessionId, 'assistant', hint)
    await executeSkill(client, chatId, stateKey, resolved.skillId, query, card, modelProfileIdOverride)
    await updateExternalSessionStatus(historySessionId, 'completed')
    return
  }

  if (actionType === 'create_capability') {
    const seedQuery = ((actionEvent as any)?.seedQuery || query || '').trim()
    if (!seedQuery) {
      const msg = '缺少技能创建需求，请补充你希望沉淀成技能的任务描述。'
      await appendExternalMessage(historySessionId, 'assistant', msg)
      await updateExternalSessionStatus(historySessionId, 'completed')
      await card.close(msg)
      return
    }

    await card.update('正在创建新技能...')
    const created = await createCapabilityFromSeed(stateKey, seedQuery, modelProfileIdOverride)
    if (!created.skillId) {
      const msg = `技能创建失败：${created.error || '未知错误'}`
      await appendExternalMessage(historySessionId, 'assistant', msg)
      await updateExternalSessionStatus(historySessionId, 'completed')
      await card.close(msg)
      return
    }

    const msg = [
      '新技能创建成功 ✅',
      `技能 ID：${created.skillId}`,
      '你现在可以直接 /skill <id> 执行，或继续说“每天/每周...”来创建定时任务。',
    ].join('\n')
    await appendExternalMessage(historySessionId, 'assistant', msg)
    await updateExternalSessionStatus(historySessionId, 'completed')
    await card.close(msg)
    return
  }

  if (actionType === 'setup_schedule') {
    const cronExpr = (actionEvent as any)?.cronExpr || ''
    const tz = (actionEvent as any)?.tz || FEISHU_DEFAULT_CRON_TZ
    const scheduleQuery = (actionEvent as any)?.targetQuery || query || ''
    let resolvedTargetId = targetId.trim()

    if (!cronExpr || !scheduleQuery.trim()) {
      const msg = '定时任务信息还不完整，请补充执行频率和执行内容。'
      await appendExternalMessage(historySessionId, 'assistant', msg)
      await updateExternalSessionStatus(historySessionId, 'completed')
      await card.close(msg)
      return
    }

    if (resolvedTargetId) {
      try {
        const exists = await skillExists(resolvedTargetId)
        if (!exists) {
          resolvedTargetId = ''
        }
      } catch (err) {
        const msg = `校验目标技能失败：${err instanceof Error ? err.message : String(err)}`
        await appendExternalMessage(historySessionId, 'assistant', msg)
        await updateExternalSessionStatus(historySessionId, 'completed')
        await card.close(msg)
        return
      }
    }

    if (!resolvedTargetId) {
      await card.update('未找到可用技能，正在先创建技能...')
      const created = await createCapabilityFromSeed(stateKey, scheduleQuery, modelProfileIdOverride)
      if (!created.skillId) {
        const msg = `定时任务创建失败：自动创建技能未成功（${created.error || '未知错误'}）`
        await appendExternalMessage(historySessionId, 'assistant', msg)
        await updateExternalSessionStatus(historySessionId, 'completed')
        await card.close(msg)
        return
      }
      resolvedTargetId = created.skillId
      await appendExternalMessage(
        historySessionId,
        'assistant',
        `已自动创建技能 ${resolvedTargetId}，继续创建定时任务。`,
      )
    }

    const scheduleFingerprint = [
      openId,
      cronExpr.trim(),
      (tz || FEISHU_DEFAULT_CRON_TZ).trim(),
      resolvedTargetId,
      scheduleQuery.trim(),
    ].join('::')
    if (!tryMarkScheduleCreateFingerprint(scheduleFingerprint)) {
      const msg = '检测到短时间内重复创建同一条定时任务，已自动忽略。'
      await appendExternalMessage(historySessionId, 'assistant', msg)
      await updateExternalSessionStatus(historySessionId, 'completed')
      await card.close(msg)
      return
    }

    await card.update('正在创建定时任务...')
    const result = await createFeishuCronJob(openId, chatId, {
      name: (actionEvent as any)?.name,
      cronExpr,
      tz,
      targetId: resolvedTargetId,
      targetQuery: scheduleQuery,
    })

    if (!result.job) {
      const msg = `定时任务创建失败：${result.error || '未知错误'}`
      await appendExternalMessage(historySessionId, 'assistant', msg)
      await updateExternalSessionStatus(historySessionId, 'completed')
      await card.close(msg)
      return
    }

    const summary = [
      `定时任务创建成功 ✅`,
      `任务名：${result.job.name}`,
      `任务 ID：${result.job.id}`,
      `调度：${formatCronScheduleLabel(result.job)}`,
      `目标技能：${result.job.targetId}`,
      result.job.nextRunAtMs ? `下次执行：${new Date(result.job.nextRunAtMs).toLocaleString('zh-CN')}` : '',
      '结果将通过飞书私聊主动通知你。',
    ].filter(Boolean).join('\n')
    await appendExternalMessage(historySessionId, 'assistant', summary)
    await updateExternalSessionStatus(historySessionId, 'completed')
    await card.close(summary)
    return
  }

  const resolved = await resolveExecutableSkillId(config.defaultSkillId, '__generic__')
  await card.update('Executing...')
  await executeSkill(client, chatId, stateKey, resolved.skillId, query, card, modelProfileIdOverride)
  await appendExternalMessage(historySessionId, 'assistant', '任务已开始执行。')
  await updateExternalSessionStatus(historySessionId, 'completed')
}

async function runConverse(
  client: Client,
  config: FeishuConfig,
  openId: string,
  chatId: string,
  stateKey: string,
  text: string,
  card: FeishuOutputSession,
  historySessionId: string,
  oneTimeModelProfileId?: string,
): Promise<void> {
  const state = getUserState(stateKey)
  const converseSessionId = state.converseSessionId || `feishu-conv-${randomUUID().slice(0, 12)}`
  setConverseSessionId(stateKey, converseSessionId)

  appendConverseMessage(stateKey, 'user', text)
  const latestState = getUserState(stateKey)

  // one-time override (#model=xxx) takes priority over persistent default
  const modelProfileId = oneTimeModelProfileId ?? state.defaultModelProfileId

  const response = await fetch(`${getAgentServiceUrl()}/converse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: converseSessionId,
      messages: latestState.converseMessages,
      source: 'feishu',
      modelProfileId,
      context: {
        channel: 'feishu',
        locale: 'zh-CN',
        capabilities: {
          canSendFile: true,
          canSendImage: true,
        },
      },
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => `HTTP ${response.status}`)
    throw new Error(`converse failed: ${errText}`)
  }

  let converseText = ''
  let action: SseEvent | null = null

  for await (const event of streamSse(response)) {
    if (event.type === 'text' && event.content) {
      converseText += event.content
      await card.update(converseText)
    }

    if (event.type === 'action') {
      action = event
    }

    if (event.type === 'question') {
      const questionText = extractQuestionText(event)
      await card.close(questionText)
      await appendExternalMessage(historySessionId, 'assistant', questionText)
      appendConverseMessage(stateKey, 'assistant', questionText)
      return
    }

    if (event.type === 'error') {
      const msg = event.message || event.content || 'Converse error'
      await card.close(`❌ ${msg}`)
      throw new Error(msg)
    }

    if (event.type === 'done') {
      break
    }
  }

  if (action) {
    await dispatchAction(client, config, openId, chatId, stateKey, action, converseText, card, historySessionId, modelProfileId)
    return
  }

  if (converseText.trim()) {
    appendConverseMessage(stateKey, 'assistant', converseText)
    await appendExternalMessage(historySessionId, 'assistant', converseText)
    await updateExternalSessionStatus(historySessionId, 'completed')
    await card.close(converseText)
    return
  }

  const fallback = '我还需要更多信息，请补充你的需求。'
  await appendExternalMessage(historySessionId, 'assistant', fallback)
  await updateExternalSessionStatus(historySessionId, 'completed')
  await card.close(fallback)
}

async function handleCommand(
  client: Client,
  config: FeishuConfig,
  openId: string,
  chatId: string,
  stateKey: string,
  text: string,
): Promise<boolean> {
  const trimmed = text.trim()

  if (trimmed === '/new') {
    resetUser(stateKey)
    await sendText(client, chatId, '✅ 会话已重置。')
    return true
  }

  if (trimmed === '/help') {
    await sendText(client, chatId, [
      `机器人：${config.botName}`,
      '',
      '直接发送消息 -> 智能匹配技能并执行',
      '/skill <id> [query] -> 指定技能执行',
      '/skills -> 查看可用技能',
      '/cron help -> 查看定时任务命令',
      '/model [name|id] -> 查看或切换模型配置',
      '/new -> 重置会话',
      '/stop -> 中止当前任务',
      '/help -> 查看帮助',
      '',
      '提示：消息前加 #model=<name 或 id> 可临时使用指定模型',
    ].join('\n'))
    return true
  }

  if (trimmed.startsWith('/cron')) {
    const args = parseCommandArgs(trimmed)
    const sub = (args[1] || '').toLowerCase()

    if (!sub || sub === 'help') {
      await sendText(client, chatId, [
        '定时任务命令：',
        '/cron create "<name>" "<cronExpr>" "<skillId>" "<query>" [tz]',
        '/cron quick <daily9|hourly|weekday9> <skillId> "<query>" [name] [tz]',
        '/cron list',
        '/cron delete <jobId>',
        '',
        '示例：',
        '/cron create "每日早报" "0 9 * * *" "news-digest" "抓取 AI 新闻并输出 300 字摘要" "Asia/Shanghai"',
        '/cron quick daily9 news-digest "抓取 AI 新闻并输出 300 字摘要" "每日早报"',
      ].join('\n'))
      return true
    }

    if (sub === 'create') {
      if (args.length < 6) {
        await sendText(client, chatId, '参数不足。用法：/cron create "<name>" "<cronExpr>" "<skillId>" "<query>" [tz]')
        return true
      }
      const [, , name, cronExpr, targetId, targetQuery, tz] = args
      try {
        const exists = await skillExists(targetId)
        if (!exists) {
          await sendText(client, chatId, `❌ 未找到技能：${targetId}`)
          return true
        }
      } catch (err) {
        await sendText(client, chatId, `❌ 校验技能失败：${err instanceof Error ? err.message : String(err)}`)
        return true
      }
      const result = await createFeishuCronJob(openId, chatId, {
        name,
        cronExpr,
        targetId,
        targetQuery,
        tz: tz || FEISHU_DEFAULT_CRON_TZ,
      })
      if (!result.job) {
        await sendText(client, chatId, `❌ 创建失败：${result.error || '未知错误'}`)
        return true
      }
      await sendText(client, chatId, [
        '✅ 定时任务已创建',
        `任务名：${result.job.name}`,
        `任务 ID：${result.job.id}`,
        `调度：${formatCronScheduleLabel(result.job)}`,
        result.job.nextRunAtMs ? `下次执行：${new Date(result.job.nextRunAtMs).toLocaleString('zh-CN')}` : '',
        '结果将推送到你的飞书私聊。',
      ].filter(Boolean).join('\n'))
      return true
    }

    if (sub === 'quick') {
      if (args.length < 5) {
        await sendText(client, chatId, '参数不足。用法：/cron quick <daily9|hourly|weekday9> <skillId> "<query>" [name] [tz]')
        return true
      }
      const [, , templateRaw, targetId, targetQuery, customName, customTz] = args
      const template = CRON_TEMPLATE_MAP[templateRaw.toLowerCase()]
      if (!template) {
        await sendText(client, chatId, '不支持的模板。可选：daily9、hourly、weekday9')
        return true
      }
      try {
        const exists = await skillExists(targetId)
        if (!exists) {
          await sendText(client, chatId, `❌ 未找到技能：${targetId}`)
          return true
        }
      } catch (err) {
        await sendText(client, chatId, `❌ 校验技能失败：${err instanceof Error ? err.message : String(err)}`)
        return true
      }
      const result = await createFeishuCronJob(openId, chatId, {
        name: customName || `${template.label} - ${targetQuery.slice(0, 20)}`,
        cronExpr: template.expr,
        targetId,
        targetQuery,
        tz: customTz || FEISHU_DEFAULT_CRON_TZ,
      })
      if (!result.job) {
        await sendText(client, chatId, `❌ 创建失败：${result.error || '未知错误'}`)
        return true
      }
      await sendText(client, chatId, [
        '✅ 快速定时任务已创建',
        `任务名：${result.job.name}`,
        `任务 ID：${result.job.id}`,
        `调度：${formatCronScheduleLabel(result.job)}`,
      ].join('\n'))
      return true
    }

    if (sub === 'list') {
      try {
        const jobs = await listOwnedCronJobs(openId)
        if (!jobs.length) {
          await sendText(client, chatId, '你还没有在飞书创建的定时任务。')
          return true
        }
        const lines = jobs.slice(0, 20).map((job) => {
          const enabled = job.enabled ? '启用' : '禁用'
          const nextRun = job.nextRunAtMs ? new Date(job.nextRunAtMs).toLocaleString('zh-CN') : '无'
          return `- ${job.id}\n  ${job.name} | ${enabled} | ${formatCronScheduleLabel(job)} | 下次：${nextRun}`
        })
        await sendText(client, chatId, ['你的飞书定时任务：', ...lines].join('\n'))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await sendText(client, chatId, `获取定时任务失败：${msg}`)
      }
      return true
    }

    if (sub === 'delete') {
      const jobId = args[2]?.trim()
      if (!jobId) {
        await sendText(client, chatId, '请提供要删除的任务 ID。用法：/cron delete <jobId>')
        return true
      }
      try {
        const job = await getCronJobDetail(jobId)
        if (!job) {
          await sendText(client, chatId, '任务不存在。')
          return true
        }
        if (job.sourceChannel !== 'feishu' || job.sourceFeishuOpenId !== openId) {
          await sendText(client, chatId, '你只能删除自己在飞书创建的任务。')
          return true
        }
        const result = await deleteCronJob(jobId)
        if (!result.success) {
          await sendText(client, chatId, `删除失败：${result.error || '未知错误'}`)
          return true
        }
        await sendText(client, chatId, `✅ 已删除任务：${job.name} (${job.id})`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await sendText(client, chatId, `删除失败：${msg}`)
      }
      return true
    }

    await sendText(client, chatId, '未知 /cron 子命令。输入 /cron help 查看用法。')
    return true
  }

  if (trimmed === '/skills') {
    try {
      const skills = await fetchSkillList()
      await sendSkillListInChunks(client, chatId, skills)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await sendText(client, chatId, `获取技能列表失败: ${msg}`)
    }
    return true
  }

  if (trimmed === '/stop') {
    const state = getUserState(stateKey)
    if (!state.executeSessionId) {
      await sendText(client, chatId, '当前没有正在执行的任务')
      return true
    }

    try {
      const res = await fetch(`${getSrcApiBaseUrl()}/skill/stop/${state.executeSessionId}`, { method: 'POST' })
      const payload: any = await res.json().catch(() => ({}))
      if (res.ok && payload?.success) {
        clearExecuteSessionId(stateKey)
        await sendText(client, chatId, '⏹️ 已发送中止请求')
      } else {
        await sendText(client, chatId, '中止失败：任务可能已结束')
      }
    } catch {
      await sendText(client, chatId, '中止请求失败')
    }
    return true
  }

  const modelMatch = trimmed.match(/^\/model(?:\s+(.+))?$/)
  if (modelMatch) {
    const profileAlias = modelMatch[1]?.trim()
    try {
      const profiles = await fetchModelProfiles()
      const currentId = getDefaultModelProfileId(stateKey)

      if (!profileAlias) {
        if (profiles.length === 0) {
          await sendText(client, chatId, '当前没有可用模型配置，将使用环境变量默认模型。')
          return true
        }
        const currentProfile = profiles.find((profile) => profile.id === currentId)
        const effectiveCurrent = currentProfile || profiles[0]
        const lines = profiles.map((profile, idx) => {
          const isCurrent = profile.id === effectiveCurrent.id
          return `${isCurrent ? '•' : '-'} ${profile.name}${idx === 0 ? '（默认）' : ''}`
        })
        await sendText(client, chatId, [
          `当前模型配置: ${effectiveCurrent.name}`,
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
        await sendText(client, chatId, `✅ 已切换到模型配置: ${profile.name}`)
      } else {
        const hint = profiles.slice(0, 5).map((item) => item.name).join('、')
        await sendText(client, chatId, hint
          ? `❌ 未找到模型配置: ${profileAlias}\n可用配置：${hint}\n使用 /model 查看完整列表`
          : `❌ 未找到模型配置: ${profileAlias}`)
      }
    } catch {
      await sendText(client, chatId, '❌ 切换模型配置失败，请稍后重试')
    }
    return true
  }

  const skillMatch = trimmed.match(/^\/skill\s+(\S+)\s*([\s\S]*)$/)
  if (skillMatch) {
    const skillId = skillMatch[1]
    const query = skillMatch[2]?.trim() || '请执行该技能'
    const commandText = `/skill ${skillId}${query ? ` ${query}` : ''}`

    try {
      const exists = await skillExists(skillId)
      if (!exists) {
        await sendText(client, chatId, `❌ 未找到技能：${skillId}。可先输入 /skills 查看可用技能。`)
        return true
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await sendText(client, chatId, `❌ 校验技能失败：${msg}`)
      return true
    }

    const userState = getUserState(stateKey)
    const historySessionId = userState.converseSessionId || `feishu-conv-${randomUUID().slice(0, 12)}`
    setConverseSessionId(stateKey, historySessionId)
    await upsertExternalSession(historySessionId, commandText, 'running')
    await appendExternalMessage(historySessionId, 'user', commandText)
    await appendExternalMessage(historySessionId, 'assistant', `已开始执行技能 ${skillId}。`)

    const card = new FeishuStreamingSession(client, config)
    const started = await card.start(chatId, `技能执行：${config.botName}`)
    if (started) {
      await card.update(`执行技能「${skillId}」...`)
    }

    try {
      await executeSkill(client, chatId, stateKey, skillId, query, started ? card : null)
      await updateExternalSessionStatus(historySessionId, 'completed')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await appendExternalMessage(historySessionId, 'error', msg)
      await updateExternalSessionStatus(historySessionId, 'failed')
      if (started) await card.close(`❌ ${msg}`)
      else await sendText(client, chatId, `❌ ${msg}`)
    }
    return true
  }

  return false
}

export async function handleFeishuMessage(
  larkClient: Client,
  event: unknown,
  config: FeishuConfig,
): Promise<void> {
  const normalized = normalizeIncomingEvent(event)
  if (!normalized) {
    console.warn('[Feishu] ignore malformed event payload')
    return
  }

  const chatId = normalized.message.chat_id
  const openId = normalized.sender.sender_id.open_id
  const stateKey = buildUserStateKey(openId, chatId)

  if (isDuplicateMessage(normalized.message.message_id)) {
    console.log(`[Feishu] ignore duplicate message: ${normalized.message.message_id}`)
    return
  }

  if (config.requireAllowlist && config.allowUsers.length === 0) {
    console.warn('[Feishu] allowlist required but empty; deny all inbound messages')
    return
  }
  if (config.allowUsers.length > 0 && !config.allowUsers.includes(openId)) {
    console.log(`[Feishu] user ${openId} is not in FEISHU_ALLOW_USERS`)
    return
  }

  // 快速通道：避免串行队列阻塞 /stop，保证中止命令能及时生效
  const quickCommand = tryExtractQuickTextCommand(normalized)
  if (quickCommand === '/stop') {
    await handleCommand(larkClient, config, openId, chatId, stateKey, quickCommand)
    return
  }

  await runSerialByStateKey(stateKey, async () => {
    const parsed = await parseMessageContent(larkClient, normalized)
    if (!parsed) {
      await sendText(larkClient, chatId, '暂不支持该消息类型，请发送文本、图片或文件。')
      return
    }

    let text = stripMentions(parsed.text, normalized.message.mentions)
    if (parsed.fileIds.length > 0) {
      const ids = parsed.fileIds.join(', ')
      text = text ? `${text}\n[LABORANY_FILE_IDS: ${ids}]` : `[LABORANY_FILE_IDS: ${ids}]`
    }

    if (!text.trim()) {
      await sendText(larkClient, chatId, '请发送文本消息或附带说明的文件。')
      return
    }

    if (await handleCommand(larkClient, config, openId, chatId, stateKey, text)) return

    // Parse #model=<name> prefix for one-time model override (not persisted)
    let oneTimeModelProfileId: string | undefined
    const modelPrefixMatch = text.match(/^#model=("[^"]+"|'[^']+'|\S+)\s*/i)
    if (modelPrefixMatch) {
      const profileAlias = normalizeProfileAlias(modelPrefixMatch[1])
      text = text.slice(modelPrefixMatch[0].length).trim()
      try {
        const profiles = await fetchModelProfiles()
        const profile = findModelProfileByAlias(profiles, profileAlias)
        if (profile) {
          oneTimeModelProfileId = profile.id
        } else {
          await sendText(larkClient, chatId, `⚠️ 未找到模型配置: ${profileAlias}，将使用默认模型继续执行`)
        }
      } catch {
        // ignore, fall back to default
      }
    }

    const userState = getUserState(stateKey)
    const historySessionId = userState.converseSessionId || `feishu-conv-${randomUUID().slice(0, 12)}`
    setConverseSessionId(stateKey, historySessionId)
    await upsertExternalSession(historySessionId, text, 'running')
    await appendExternalMessage(historySessionId, 'user', text)

    const streamingCard = new FeishuStreamingSession(larkClient, config)
    const started = await streamingCard.start(chatId, config.botName)
    const outputSession: FeishuOutputSession = started
      ? streamingCard
      : new FeishuTextSession(larkClient, chatId)

    if (!started) {
      await sendText(larkClient, chatId, '⚠️ 流式卡片不可用，已切换文本回复模式。')
    }
    await outputSession.update('正在分析你的需求...')

    try {
      await runConverse(
        larkClient,
        config,
        openId,
        chatId,
        stateKey,
        text,
        outputSession,
        historySessionId,
        oneTimeModelProfileId,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await appendExternalMessage(historySessionId, 'error', msg)
      await updateExternalSessionStatus(historySessionId, 'failed')
      console.error('[Feishu] message handling failed:', err)
      await outputSession.close(`❌ ${msg}`)
    }
  })
}
