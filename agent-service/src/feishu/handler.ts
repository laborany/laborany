import { randomUUID } from 'crypto'
import { createWriteStream, existsSync, mkdirSync } from 'fs'
import { dirname, extname, join } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { Client } from '@larksuiteoapi/node-sdk'
import { DATA_DIR } from '../paths.js'
import type { FeishuConfig } from './config.js'
import {
  appendConverseMessage,
  clearExecuteSessionId,
  getUserState,
  resetUser,
  setConverseSessionId,
  setExecuteSessionId,
} from './index.js'
import { FeishuStreamingSession } from './streaming.js'

const SRC_API_BASE_URL = (process.env.SRC_API_BASE_URL || 'http://127.0.0.1:3620/api').replace(/\/+$/, '')
const AGENT_SERVICE_URL = (process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '')
const FEISHU_HISTORY_SKILL_ID = process.env.FEISHU_HISTORY_SKILL_ID?.trim() || '__generic__'

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
  questions?: unknown[]
}

type FeishuResourceType = 'image' | 'file' | 'audio' | 'video'
type ExternalSessionStatus = 'running' | 'completed' | 'failed' | 'stopped' | 'aborted'

interface SkillListItem {
  id: string
  name: string
  description?: string
}

const PROCESSED_MESSAGE_TTL_MS = 10 * 60 * 1000
const MAX_PROCESSED_MESSAGES = 2000
const processedMessageIds = new Map<string, number>()

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

async function fetchSkillList(): Promise<SkillListItem[]> {
  const res = await fetch(`${SRC_API_BASE_URL}/skill/list`)
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

async function upsertExternalSession(
  sessionId: string,
  query: string,
  status: ExternalSessionStatus = 'running',
): Promise<void> {
  try {
    await fetch(`${SRC_API_BASE_URL}/sessions/external/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        query,
        status,
        skillId: FEISHU_HISTORY_SKILL_ID,
      }),
    })
  } catch (err) {
    console.warn('[Feishu] failed to upsert external session:', err)
  }
}

async function appendExternalMessage(
  sessionId: string,
  type: 'user' | 'assistant' | 'error' | 'system',
  content: string,
): Promise<void> {
  if (!content.trim()) return
  try {
    await fetch(`${SRC_API_BASE_URL}/sessions/external/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, type, content }),
    })
  } catch (err) {
    console.warn('[Feishu] failed to append external message:', err)
  }
}

async function updateExternalSessionStatus(
  sessionId: string,
  status: ExternalSessionStatus,
): Promise<void> {
  try {
    await fetch(`${SRC_API_BASE_URL}/sessions/external/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, status }),
    })
  } catch (err) {
    console.warn('[Feishu] failed to update external session status:', err)
  }
}

async function executeSkill(
  client: Client,
  chatId: string,
  openId: string,
  skillId: string,
  query: string,
  card: FeishuStreamingSession | null,
): Promise<void> {
  const executeSessionId = `feishu-${randomUUID().slice(0, 12)}`
  setExecuteSessionId(openId, executeSessionId)

  try {
    const response = await fetch(`${SRC_API_BASE_URL}/skill/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skill_id: skillId,
        query,
        sessionId: executeSessionId,
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => `HTTP ${response.status}`)
      throw new Error(`skill/execute failed: ${errText}`)
    }

    let accumulated = ''
    for await (const event of streamSse(response)) {
      if (event.type === 'session' && event.sessionId) {
        setExecuteSessionId(openId, event.sessionId)
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
        return
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
  } finally {
    clearExecuteSessionId(openId)
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

async function dispatchAction(
  client: Client,
  config: FeishuConfig,
  chatId: string,
  openId: string,
  actionEvent: SseEvent,
  converseText: string,
  card: FeishuStreamingSession,
  historySessionId: string,
): Promise<void> {
  const actionType = (actionEvent as any)?.action || ''
  const targetId = (actionEvent as any)?.targetId || ''
  const query = (actionEvent as any)?.query || converseText || ''

  if (actionType === 'recommend_capability' && targetId) {
    await card.update(`Matched capability ${targetId}, executing...`)
    await appendExternalMessage(historySessionId, 'assistant', `已匹配技能 ${targetId}，任务已开始执行。`)
    await executeSkill(client, chatId, openId, targetId, query, card)
    await updateExternalSessionStatus(historySessionId, 'completed')
    return
  }

  if (actionType === 'execute_generic') {
    await card.update('Executing in generic mode...')
    await appendExternalMessage(historySessionId, 'assistant', '已进入通用执行模式，任务已开始。')
    await executeSkill(client, chatId, openId, config.defaultSkillId, query, card)
    await updateExternalSessionStatus(historySessionId, 'completed')
    return
  }

  if (actionType === 'create_capability') {
    const msg = '该任务需要创建新技能，请在桌面端完成创建。'
    await appendExternalMessage(historySessionId, 'assistant', msg)
    await updateExternalSessionStatus(historySessionId, 'completed')
    await card.close(msg)
    return
  }

  if (actionType === 'setup_schedule') {
    const msg = '定时任务请在桌面端配置。'
    await appendExternalMessage(historySessionId, 'assistant', msg)
    await updateExternalSessionStatus(historySessionId, 'completed')
    await card.close(msg)
    return
  }

  await card.update('Executing...')
  await executeSkill(client, chatId, openId, config.defaultSkillId, query, card)
  await appendExternalMessage(historySessionId, 'assistant', '任务已开始执行。')
  await updateExternalSessionStatus(historySessionId, 'completed')
}

async function runConverse(
  client: Client,
  config: FeishuConfig,
  chatId: string,
  openId: string,
  text: string,
  card: FeishuStreamingSession,
  historySessionId: string,
): Promise<void> {
  const state = getUserState(openId)
  const converseSessionId = state.converseSessionId || `feishu-conv-${randomUUID().slice(0, 12)}`
  setConverseSessionId(openId, converseSessionId)

  appendConverseMessage(openId, 'user', text)

  const response = await fetch(`${AGENT_SERVICE_URL}/converse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: converseSessionId,
      messages: state.converseMessages,
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
      appendConverseMessage(openId, 'assistant', questionText)
      await appendExternalMessage(historySessionId, 'assistant', questionText)
      await updateExternalSessionStatus(historySessionId, 'completed')
      return
    }

    if (event.type === 'error') {
      const msg = event.message || event.content || 'Converse error'
      await appendExternalMessage(historySessionId, 'error', `Converse error: ${msg}`)
      await updateExternalSessionStatus(historySessionId, 'failed')
      await card.close(`❌ ${msg}`)
      return
    }

    if (event.type === 'done') {
      break
    }
  }

  if (action) {
    await dispatchAction(client, config, chatId, openId, action, converseText, card, historySessionId)
    return
  }

  if (converseText.trim()) {
    appendConverseMessage(openId, 'assistant', converseText)
    await card.close(converseText)
    await appendExternalMessage(historySessionId, 'assistant', converseText)
    await updateExternalSessionStatus(historySessionId, 'completed')
    return
  }

  const fallback = '我还需要更多信息，请补充你的需求。'
  await card.close(fallback)
  await appendExternalMessage(historySessionId, 'assistant', fallback)
  await updateExternalSessionStatus(historySessionId, 'completed')
}

async function handleCommand(
  client: Client,
  config: FeishuConfig,
  chatId: string,
  openId: string,
  text: string,
): Promise<boolean> {
  const trimmed = text.trim()

  if (trimmed === '/new') {
    resetUser(openId)
    await sendText(client, chatId, '✅ 会话已重置。')
    return true
  }

  if (trimmed === '/help') {
    await sendText(client, chatId, [
      `🤻 ${config.botName}`,
      '',
      '直接发送消息 -> 智能匹配技能并执行',
      '/skill <id> [query] -> 指定技能执行',
      '/skills -> 查看可用技能',
      '/new -> 重置会话',
      '/stop -> 中止当前任务',
      '/help -> 查看帮助',
    ].join('\n'))
    return true
  }

  if (trimmed === '/skills') {
    try {
      const skills = await fetchSkillList()
      const list = skills.map(s => `- ${s.id} - ${s.name}`).join('\n')
      await sendText(client, chatId, list || '暂无可用技能')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await sendText(client, chatId, `获取技能列表失败: ${msg}`)
    }
    return true
  }

  if (trimmed === '/stop') {
    const state = getUserState(openId)
    if (!state.executeSessionId) {
      await sendText(client, chatId, '当前没有正在执行的任务')
      return true
    }

    try {
      const res = await fetch(`${SRC_API_BASE_URL}/skill/stop/${state.executeSessionId}`, { method: 'POST' })
      const payload: any = await res.json().catch(() => ({}))
      if (res.ok && payload?.success) {
        clearExecuteSessionId(openId)
        await sendText(client, chatId, '⏹️ 已发送中止请求')
      } else {
        await sendText(client, chatId, '中止失败：任务可能已结束')
      }
    } catch {
      await sendText(client, chatId, '中止请求失败')
    }
    return true
  }

  const skillMatch = trimmed.match(/^\/skill\s+(\S+)\s*([\s\S]*)$/)
  if (skillMatch) {
    const skillId = skillMatch[1]
    const query = skillMatch[2]?.trim() || '请执行该技能'

    const card = new FeishuStreamingSession(client, config)
    const started = await card.start(chatId, `🎯 ${config.botName}`)
    if (started) {
      await card.update(`执行技能「${skillId}」...`)
    }

    try {
      await executeSkill(client, chatId, openId, skillId, query, started ? card : null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
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

  if (await handleCommand(larkClient, config, chatId, openId, text)) return

  const historySessionId = `feishu-msg-${randomUUID().slice(0, 12)}`
  await upsertExternalSession(historySessionId, text, 'running')
  await appendExternalMessage(historySessionId, 'user', text)

  const card = new FeishuStreamingSession(larkClient, config)
  const started = await card.start(chatId, `🤻 ${config.botName}`)
  if (!started) {
    await appendExternalMessage(historySessionId, 'assistant', '已开始执行任务，请查看执行结果。')
    try {
      await executeSkill(larkClient, chatId, openId, config.defaultSkillId, text, null)
      await updateExternalSessionStatus(historySessionId, 'completed')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await appendExternalMessage(historySessionId, 'error', msg)
      await updateExternalSessionStatus(historySessionId, 'failed')
      await sendText(larkClient, chatId, `❌ ${msg}`)
    }
    return
  }

  await card.update('正在分析你的需求...')
  try {
    await runConverse(larkClient, config, chatId, openId, text, card, historySessionId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await appendExternalMessage(historySessionId, 'error', msg)
    await updateExternalSessionStatus(historySessionId, 'failed')
    console.error('[Feishu] message handling failed:', err)
    if (card.isActive()) await card.close(`❌ ${msg}`)
    else await sendText(larkClient, chatId, `❌ ${msg}`)
  }
}
