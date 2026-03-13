import { Hono } from 'hono'
import { existsSync } from 'fs'
import { dbHelper } from '../core/database.js'
import { getTaskDir, runtimeTaskManager } from '../core/agent/index.js'
import { looksLikeWaitingInputMessage } from '../lib/skill-interaction.js'

const session = new Hono()
const ALLOWED_SESSION_STATUS = new Set(['running', 'waiting_input', 'completed', 'failed', 'stopped', 'aborted'])
const ALLOWED_MESSAGE_TYPES = new Set(['user', 'assistant', 'tool_use', 'tool_result', 'error', 'system'])
const CONVERSE_HEARTBEAT_STALE_MS = 90 * 1000

type SessionSource = 'desktop' | 'converse' | 'cron' | 'feishu' | 'qq'

function inferSessionSource(sessionId: string, skillId: string, dbSource?: string): SessionSource {
  // 先根据 sessionId 推断，兼容历史数据中 source 被错误写成 desktop 的场景
  const sid = (sessionId || '').toLowerCase()
  if (sid.startsWith('cron-') || sid.startsWith('cron-manual-')) return 'cron'
  if (sid.startsWith('feishu-') || sid.startsWith('feishu-conv-')) return 'feishu'
  if (sid.startsWith('qq-') || sid.startsWith('qq-conv-')) return 'qq'

  // 其次使用数据库中的 source 字段
  if (dbSource && ['desktop', 'feishu', 'qq', 'cron', 'converse'].includes(dbSource)) {
    return dbSource as SessionSource
  }

  if (skillId === '__converse__') return 'converse'
  return 'desktop'
}

function getRunningSkillName(source: SessionSource, fallbackSkillName: string, skillId: string): string {
  if (source === 'cron') return '定时任务'
  if (source === 'feishu') return skillId === '__converse__' ? '飞书对话分派' : '飞书任务执行'
  if (source === 'qq') return skillId === '__converse__' ? 'QQ 对话分派' : 'QQ 任务执行'
  if (source === 'converse') return '首页对话分派'
  return fallbackSkillName || skillId
}

function toUtcMs(value?: string | null): number {
  const text = (value || '').trim()
  if (!text) return 0
  if (/z$/i.test(text) || /[+-]\d{2}:\d{2}$/i.test(text)) {
    return Date.parse(text) || 0
  }
  return Date.parse(text.replace(' ', 'T') + 'Z') || 0
}

function inferRecoveredConverseStatus(lastType?: string, lastContent?: string | null): string {
  if (lastType === 'error') return 'failed'
  if (lastType === 'assistant') {
    return looksLikeWaitingInputMessage(lastContent) ? 'waiting_input' : 'completed'
  }
  return 'failed'
}

function reconcileStaleConverseSessions(sessionIds: string[] = []): void {
  const filteredIds = sessionIds.map(id => id.trim()).filter(Boolean)
  const params: string[] = []
  const clauses = [`skill_id = '__converse__'`, `status = 'running'`]

  if (filteredIds.length > 0) {
    clauses.push(`id IN (${filteredIds.map(() => '?').join(', ')})`)
    params.push(...filteredIds)
  }

  const candidates = dbHelper.query<{
    id: string
    created_at: string
    updated_at?: string | null
  }>(`
    SELECT id, created_at, updated_at
    FROM sessions
    WHERE ${clauses.join(' AND ')}
  `, params)

  const now = Date.now()
  for (const candidate of candidates) {
    if (runtimeTaskManager.isRunning(candidate.id)) continue

    const lastActiveAt = toUtcMs(candidate.updated_at) || toUtcMs(candidate.created_at)
    if (lastActiveAt > 0 && now - lastActiveAt <= CONVERSE_HEARTBEAT_STALE_MS) {
      continue
    }

    const latestMessage = dbHelper.get<{
      type: string
      content: string | null
    }>(`
      SELECT type, content
      FROM messages
      WHERE session_id = ?
      ORDER BY id DESC
      LIMIT 1
    `, [candidate.id])

    const nextStatus = inferRecoveredConverseStatus(latestMessage?.type, latestMessage?.content)
    dbHelper.run(
      `UPDATE sessions
       SET status = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [nextStatus, candidate.id],
    )
  }
}

session.get('/', (c) => {
  reconcileStaleConverseSessions()

  const sessions = dbHelper.query<{
    id: string
    skill_id: string
    query: string
    status: string
    cost: number
    created_at: string
    source?: string
  }>(`
    SELECT id, skill_id, query, status, cost, created_at, source
    FROM sessions
    ORDER BY created_at DESC
    LIMIT 100
  `)

  return c.json(
    sessions.map((item) => ({
      ...item,
      source: inferSessionSource(item.id, item.skill_id, item.source),
    })),
  )
})

session.get('/running-tasks', (c) => {
  reconcileStaleConverseSessions()

  const runtimeTasks = runtimeTaskManager.getRunningTasks().map((task) => {
    const sessionMeta = dbHelper.get<{
      skill_id: string
      query: string
      source?: string
    }>(`
      SELECT skill_id, query, source
      FROM sessions
      WHERE id = ?
    `, [task.sessionId])

    const effectiveSkillId = sessionMeta?.skill_id || task.skillId
    const source = inferSessionSource(task.sessionId, effectiveSkillId, sessionMeta?.source)

    return {
      ...task,
      source,
      skillName: getRunningSkillName(source, task.skillName, effectiveSkillId),
      query: sessionMeta?.query || '',
    }
  })

  const runtimeSessionIds = new Set(runtimeTasks.map((task) => task.sessionId))
  const converseTasks = dbHelper.query<{
    id: string
    query: string
    created_at: string
    source?: string
  }>(`
    SELECT id, query, created_at, source
    FROM sessions
    WHERE status = 'running' AND skill_id = '__converse__'
    ORDER BY created_at DESC
    LIMIT 50
  `)
    .filter((item) => !runtimeSessionIds.has(item.id))
    .map((item) => {
      const source = inferSessionSource(item.id, '__converse__', item.source)
      return {
        sessionId: item.id,
        skillId: '__converse__',
        skillName: getRunningSkillName(source, '', '__converse__'),
        startedAt: item.created_at,
        source,
        query: item.query || '',
      }
    })

  const tasks = [...runtimeTasks, ...converseTasks]
  tasks.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))

  return c.json({ tasks, count: tasks.length })
})

session.get('/:sessionId', (c) => {
  const sessionId = c.req.param('sessionId')
  reconcileStaleConverseSessions([sessionId])

  const sessionData = dbHelper.get<{
    id: string
    skill_id: string
    query: string
    status: string
    cost: number
    work_dir: string | null
    created_at: string
    source?: string
  }>(`
    SELECT id, skill_id, query, status, cost, work_dir, created_at, source
    FROM sessions
    WHERE id = ?
  `, [sessionId])

  if (!sessionData) {
    return c.json({ error: '会话不存在' }, 404)
  }

  const messages = dbHelper.query<{
    id: number
    type: string
    content: string | null
    tool_name: string | null
    tool_input: string | null
    tool_result: string | null
    created_at: string
  }>(`
    SELECT id, type, content, tool_name, tool_input, tool_result, created_at
    FROM messages
    WHERE session_id = ?
    ORDER BY created_at ASC
  `, [sessionId])

  const formattedMessages = messages.map((msg) => ({
    id: msg.id,
    type: msg.type,
    content: msg.content,
    toolName: msg.tool_name,
    toolInput: msg.tool_input ? JSON.parse(msg.tool_input) : null,
    toolResult: msg.tool_result,
    createdAt: msg.created_at,
  }))

  const runtimeSnapshot = runtimeTaskManager.getLiveSnapshot(sessionId)
  if (runtimeSnapshot?.isRunning) {
    const runtimeQuery = runtimeSnapshot.query.trim()
    if (runtimeQuery) {
      const lastUserMessage = [...formattedMessages]
        .reverse()
        .find((msg) => msg.type === 'user')
      const lastUserContent = (lastUserMessage?.content || '').trim()
      if (lastUserContent !== runtimeQuery) {
        formattedMessages.push({
          id: -1,
          type: 'user',
          content: runtimeQuery,
          toolName: null,
          toolInput: null,
          toolResult: null,
          createdAt: runtimeSnapshot.startedAt,
        })
      }
    }

    const liveAssistant = runtimeSnapshot.assistantContent.trim()
    if (liveAssistant) {
      const lastAssistantMessage = [...formattedMessages]
        .reverse()
        .find((msg) => msg.type === 'assistant')
      const lastAssistantContent = (lastAssistantMessage?.content || '').trim()
      if (lastAssistantContent !== liveAssistant) {
        formattedMessages.push({
          id: -2,
          type: 'assistant',
          content: liveAssistant,
          toolName: null,
          toolInput: null,
          toolResult: null,
          createdAt: runtimeSnapshot.lastEventAt || runtimeSnapshot.startedAt,
        })
      }
    }
  }

  let workDir = sessionData.work_dir
  if (!workDir) {
    const computedDir = getTaskDir(sessionId)
    if (existsSync(computedDir)) {
      workDir = computedDir
    }
  }

  return c.json({
    ...sessionData,
    source: inferSessionSource(sessionData.id, sessionData.skill_id, sessionData.source),
    work_dir: workDir,
    messages: formattedMessages,
  })
})

session.get('/:sessionId/live-status', (c) => {
  const sessionId = c.req.param('sessionId')
  reconcileStaleConverseSessions([sessionId])

  const sessionData = dbHelper.get<{
    id: string
    status: string
    created_at: string
  }>(`
    SELECT id, status, created_at
    FROM sessions
    WHERE id = ?
  `, [sessionId])

  if (!sessionData) {
    return c.json({ error: '会话不存在' }, 404)
  }

  const runtimeStatus = runtimeTaskManager.getStatus(sessionId)
  const isRunning = runtimeStatus?.isRunning === true
  const needsInput = runtimeStatus?.requiresInput === true || sessionData.status === 'waiting_input'

  return c.json({
    sessionId,
    dbStatus: sessionData.status,
    isRunning,
    needsInput,
    source: runtimeStatus ? 'runtime' : 'database',
    startedAt: runtimeStatus?.startedAt || sessionData.created_at,
    lastEventAt: runtimeStatus?.lastEventAt,
    canAttach: runtimeTaskManager.has(sessionId),
    runtimeStatus: runtimeStatus?.status,
  })
})

session.post('/external/upsert', async (c) => {
  let body: Record<string, unknown> = {}
  try {
    body = await c.req.json<Record<string, unknown>>()
  } catch {
    return c.json({ error: '请求体格式错误' }, 400)
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  const skillId = typeof body.skillId === 'string' && body.skillId.trim()
    ? body.skillId.trim()
    : '__generic__'
  const query = typeof body.query === 'string' ? body.query.trim() : ''
  const statusCandidate = typeof body.status === 'string' ? body.status.trim() : 'running'
  const status = ALLOWED_SESSION_STATUS.has(statusCandidate) ? statusCandidate : 'running'
  const userId = typeof body.userId === 'string' && body.userId.trim()
    ? body.userId.trim()
    : 'default'
  const workDir = typeof body.workDir === 'string' && body.workDir.trim()
    ? body.workDir.trim()
    : null
  const sourceRaw = typeof body.source === 'string' ? body.source.trim() : ''
  const source = ['desktop', 'feishu', 'qq', 'cron', 'converse'].includes(sourceRaw)
    ? sourceRaw
    : (skillId === '__converse__' ? 'converse' : 'desktop')

  if (!sessionId || !query) {
    return c.json({ error: '缺少 sessionId 或 query 参数' }, 400)
  }

  const existing = dbHelper.get<{ id: string }>(
    `SELECT id FROM sessions WHERE id = ?`,
    [sessionId],
  )

  if (existing) {
    dbHelper.run(
      `UPDATE sessions
       SET skill_id = ?, query = ?, status = ?, work_dir = COALESCE(?, work_dir), source = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [skillId, query, status, workDir, source, sessionId],
    )
    return c.json({ success: true, created: false, sessionId })
  }

  dbHelper.run(
    `INSERT INTO sessions (id, user_id, skill_id, query, status, work_dir, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, userId, skillId, query, status, workDir, source],
  )

  return c.json({ success: true, created: true, sessionId })
})

session.post('/external/message', async (c) => {
  let body: Record<string, unknown> = {}
  try {
    body = await c.req.json<Record<string, unknown>>()
  } catch {
    return c.json({ error: '请求体格式错误' }, 400)
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  const typeCandidate = typeof body.type === 'string' ? body.type.trim() : ''
  const type = ALLOWED_MESSAGE_TYPES.has(typeCandidate) ? typeCandidate : ''

  const content = typeof body.content === 'string' ? body.content : null
  const toolName = typeof body.toolName === 'string' ? body.toolName : null
  const toolResult = typeof body.toolResult === 'string' ? body.toolResult : null
  const toolInput = body.toolInput && typeof body.toolInput === 'object'
    ? JSON.stringify(body.toolInput)
    : null

  if (!sessionId || !type) {
    return c.json({ error: '缺少 sessionId 或 type 参数' }, 400)
  }

  const sessionExists = dbHelper.get<{ id: string }>(
    `SELECT id FROM sessions WHERE id = ?`,
    [sessionId],
  )
  if (!sessionExists) {
    return c.json({ error: '会话不存在' }, 404)
  }

  if (!content && !toolName && !toolResult) {
    return c.json({ error: '消息内容不能为空' }, 400)
  }

  dbHelper.run(
    `INSERT INTO messages (session_id, type, content, tool_name, tool_input, tool_result)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, type, content, toolName, toolInput, toolResult],
  )
  dbHelper.run(
    `UPDATE sessions SET updated_at = datetime('now') WHERE id = ?`,
    [sessionId],
  )

  return c.json({ success: true })
})

session.post('/external/status', async (c) => {
  let body: Record<string, unknown> = {}
  try {
    body = await c.req.json<Record<string, unknown>>()
  } catch {
    return c.json({ error: '请求体格式错误' }, 400)
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  const statusCandidate = typeof body.status === 'string' ? body.status.trim() : ''
  const status = ALLOWED_SESSION_STATUS.has(statusCandidate) ? statusCandidate : ''

  if (!sessionId || !status) {
    return c.json({ error: '缺少 sessionId 或 status 参数' }, 400)
  }

  const sessionExists = dbHelper.get<{ id: string }>(
    `SELECT id FROM sessions WHERE id = ?`,
    [sessionId],
  )
  if (!sessionExists) {
    return c.json({ error: '会话不存在' }, 404)
  }

  dbHelper.run(
    `UPDATE sessions SET status = ?, updated_at = datetime('now') WHERE id = ?`,
    [status, sessionId],
  )

  return c.json({ success: true })
})

session.delete('/:sessionId', (c) => {
  const sessionId = c.req.param('sessionId')

  const sessionExists = dbHelper.get<{ id: string }>(
    `SELECT id FROM sessions WHERE id = ?`,
    [sessionId],
  )

  if (!sessionExists) {
    return c.json({ error: '会话不存在' }, 404)
  }

  // 检查会话是否正在运行
  const runtimeStatus = runtimeTaskManager.getStatus(sessionId)
  if (runtimeStatus?.isRunning) {
    return c.json({ error: '无法删除正在运行的会话，请先停止任务' }, 400)
  }

  // 删除会话相关的消息
  dbHelper.run(`DELETE FROM messages WHERE session_id = ?`, [sessionId])

  // 删除会话记录
  dbHelper.run(`DELETE FROM sessions WHERE id = ?`, [sessionId])

  return c.json({ success: true, message: '会话已删除' })
})

export default session
