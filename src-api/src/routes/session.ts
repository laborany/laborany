import { Hono } from 'hono'
import { existsSync } from 'fs'
import { dbHelper } from '../core/database.js'
import { getTaskDir, runtimeTaskManager } from '../core/agent/index.js'

const session = new Hono()
const ALLOWED_SESSION_STATUS = new Set(['running', 'completed', 'failed', 'stopped', 'aborted'])
const ALLOWED_MESSAGE_TYPES = new Set(['user', 'assistant', 'tool_use', 'tool_result', 'error', 'system'])

type SessionSource = 'desktop' | 'converse' | 'cron' | 'feishu'

function inferSessionSource(sessionId: string, skillId: string): SessionSource {
  const sid = (sessionId || '').toLowerCase()
  if (sid.startsWith('cron-') || sid.startsWith('cron-manual-')) return 'cron'
  if (sid.startsWith('feishu-') || sid.startsWith('feishu-conv-')) return 'feishu'
  if (skillId === '__converse__') return 'converse'
  return 'desktop'
}

function getRunningSkillName(source: SessionSource, fallbackSkillName: string, skillId: string): string {
  if (source === 'cron') return '定时任务'
  if (source === 'feishu') return skillId === '__converse__' ? '飞书对话分派' : '飞书任务执行'
  if (source === 'converse') return '首页对话分派'
  return fallbackSkillName || skillId
}

session.get('/', (c) => {
  const sessions = dbHelper.query<{
    id: string
    skill_id: string
    query: string
    status: string
    cost: number
    created_at: string
  }>(`
    SELECT id, skill_id, query, status, cost, created_at
    FROM sessions
    ORDER BY created_at DESC
    LIMIT 100
  `)

  return c.json(
    sessions.map((item) => ({
      ...item,
      source: inferSessionSource(item.id, item.skill_id),
    })),
  )
})

session.get('/running-tasks', (c) => {
  const runtimeTasks = runtimeTaskManager.getRunningTasks().map((task) => {
    const sessionMeta = dbHelper.get<{
      skill_id: string
      query: string
    }>(`
      SELECT skill_id, query
      FROM sessions
      WHERE id = ?
    `, [task.sessionId])

    const effectiveSkillId = sessionMeta?.skill_id || task.skillId
    const source = inferSessionSource(task.sessionId, effectiveSkillId)

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
  }>(`
    SELECT id, query, created_at
    FROM sessions
    WHERE status = 'running' AND skill_id = '__converse__'
    ORDER BY created_at DESC
    LIMIT 50
  `)
    .filter((item) => !runtimeSessionIds.has(item.id))
    .map((item) => {
      const source = inferSessionSource(item.id, '__converse__')
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

  const sessionData = dbHelper.get<{
    id: string
    skill_id: string
    query: string
    status: string
    cost: number
    work_dir: string | null
    created_at: string
  }>(`
    SELECT id, skill_id, query, status, cost, work_dir, created_at
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
    source: inferSessionSource(sessionData.id, sessionData.skill_id),
    work_dir: workDir,
    messages: formattedMessages,
  })
})

session.get('/:sessionId/live-status', (c) => {
  const sessionId = c.req.param('sessionId')

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

  return c.json({
    sessionId,
    dbStatus: sessionData.status,
    isRunning,
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
       SET skill_id = ?, query = ?, status = ?, work_dir = COALESCE(?, work_dir)
       WHERE id = ?`,
      [skillId, query, status, workDir, sessionId],
    )
    return c.json({ success: true, created: false, sessionId })
  }

  dbHelper.run(
    `INSERT INTO sessions (id, user_id, skill_id, query, status, work_dir)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, userId, skillId, query, status, workDir],
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
    `UPDATE sessions SET status = ? WHERE id = ?`,
    [status, sessionId],
  )

  return c.json({ success: true })
})

export default session
