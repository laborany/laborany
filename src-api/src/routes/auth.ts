/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         认证 API 路由                                     ║
 * ║                                                                          ║
 * ║  端点：注册、登录、获取当前用户                                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Hono } from 'hono'
import { v4 as uuid } from 'uuid'
import { runQuery, getOne, saveDb } from '../core/database.js'
import {
  hashPassword,
  verifyPassword,
  createAccessToken,
  extractUserIdFromHeader,
} from '../lib/security.js'

const auth = new Hono()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           注册                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
auth.post('/register', async (c) => {
  const { email, password, name } = await c.req.json()

  if (!email || !password || !name) {
    return c.json({ error: '缺少必要参数' }, 400)
  }

  // 检查邮箱是否已存在
  const existing = getOne<{ id: string }>('SELECT id FROM users WHERE email = ?', [email])
  if (existing) {
    return c.json({ error: '邮箱已被注册' }, 400)
  }

  // 创建用户
  const userId = uuid()
  const passwordHash = hashPassword(password)

  runQuery(
    'INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)',
    [userId, email, passwordHash, name]
  )

  const token = await createAccessToken(userId)
  return c.json({ access_token: token, token_type: 'bearer' })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           登录                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json()

  if (!email || !password) {
    return c.json({ error: '缺少必要参数' }, 400)
  }

  const user = getOne<{ id: string; password_hash: string }>(
    'SELECT id, password_hash FROM users WHERE email = ?',
    [email]
  )

  if (!user || !verifyPassword(password, user.password_hash)) {
    return c.json({ error: '邮箱或密码错误' }, 401)
  }

  const token = await createAccessToken(user.id)
  return c.json({ access_token: token, token_type: 'bearer' })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           获取当前用户                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
auth.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization')
  const userId = await extractUserIdFromHeader(authHeader)

  if (!userId) {
    return c.json({ error: '无效的认证凭证' }, 401)
  }

  const user = getOne<{ id: string; email: string; name: string; balance: number }>(
    'SELECT id, email, name, balance FROM users WHERE id = ?',
    [userId]
  )

  if (!user) {
    return c.json({ error: '用户不存���' }, 404)
  }

  return c.json(user)
})

export default auth
