/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         会话历史 API 路由                                 ║
 * ║                                                                          ║
 * ║  端点：列表、详情                                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Hono } from 'hono'
import { dbHelper } from '../core/database.js'

const session = new Hono()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取会话列表                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
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

  return c.json(sessions)
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取会话详情                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
session.get('/:sessionId', (c) => {
  const sessionId = c.req.param('sessionId')

  const sessionData = dbHelper.get<{
    id: string
    skill_id: string
    query: string
    status: string
    cost: number
    created_at: string
  }>(`
    SELECT id, skill_id, query, status, cost, created_at
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

  // 格式化消息
  const formattedMessages = messages.map(msg => ({
    id: msg.id,
    type: msg.type,
    content: msg.content,
    toolName: msg.tool_name,
    toolInput: msg.tool_input ? JSON.parse(msg.tool_input) : null,
    toolResult: msg.tool_result,
    createdAt: msg.created_at
  }))

  return c.json({
    ...sessionData,
    messages: formattedMessages
  })
})

export default session
