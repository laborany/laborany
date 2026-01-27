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
    content: string
    created_at: string
  }>(`
    SELECT id, type, content, created_at
    FROM messages
    WHERE session_id = ?
    ORDER BY created_at ASC
  `, [sessionId])

  // 解析 JSON content
  const parsedMessages = messages.map(msg => ({
    ...msg,
    content: msg.content ? JSON.parse(msg.content) : null
  }))

  return c.json({
    ...sessionData,
    messages: parsedMessages
  })
})

export default session
