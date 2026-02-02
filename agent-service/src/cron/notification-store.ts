/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     通知系统 - 独立存储模块                               ║
 * ║                                                                          ║
 * ║  职责：管理通知的创建、查询、标记已读                                      ║
 * ║  设计：从 store.ts 拆分，遵循单一职责原则                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import Database from './db.js'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'
import { DATA_DIR } from '../paths.js'

const DB_PATH = join(DATA_DIR, 'cron.db')

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export interface Notification {
  id: number
  type: 'cron_success' | 'cron_error' | 'task_success' | 'task_error'
  title: string
  content?: string
  read: boolean
  jobId?: string
  sessionId?: string
  createdAt: string
}

export interface CreateNotificationRequest {
  type: 'cron_success' | 'cron_error' | 'task_success' | 'task_error'
  title: string
  content?: string
  jobId?: string
  sessionId?: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           数据库连接                                      │
 * │  复用 cron.db，通知表已在 store.ts 中创建                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (db) return db

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }

  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  return db
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           通知 CRUD 操作                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/** 创建通知 */
export function createNotification(req: CreateNotificationRequest): number {
  const result = getDb().prepare(`
    INSERT INTO notifications (type, title, content, job_id, session_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.type, req.title, req.content || null, req.jobId || null, req.sessionId || null)
  return result.lastInsertRowid as number
}

/** 获取通知列表 */
export function listNotifications(limit = 50): Notification[] {
  const rows = getDb().prepare(`
    SELECT * FROM notifications
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit)
  return rows.map(rowToNotification)
}

/** 获取未读通知数量 */
export function getUnreadCount(): number {
  const row = getDb().prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE read = 0'
  ).get() as { count: number }
  return row.count
}

/** 标记单个通知为已读 */
export function markNotificationRead(id: number): boolean {
  const result = getDb().prepare(
    'UPDATE notifications SET read = 1 WHERE id = ?'
  ).run(id)
  return result.changes > 0
}

/** 标记所有通知为已读 */
export function markAllNotificationsRead(): number {
  const result = getDb().prepare(
    'UPDATE notifications SET read = 1 WHERE read = 0'
  ).run()
  return result.changes
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           辅助函数                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function rowToNotification(row: unknown): Notification {
  const r = row as Record<string, unknown>
  return {
    id: r.id as number,
    type: r.type as Notification['type'],
    title: r.title as string,
    content: r.content as string | undefined,
    read: r.read === 1,
    jobId: r.job_id as string | undefined,
    sessionId: r.session_id as string | undefined,
    createdAt: r.created_at as string,
  }
}
