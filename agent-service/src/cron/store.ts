/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Cron 定时任务 - 数据库存储                            ║
 * ║                                                                          ║
 * ║  使用 better-sqlite3 实现同步 SQLite 操作                                 ║
 * ║  设计哲学：扁平化存储，避免 JSON 解析，便于查询和索引                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync, existsSync } from 'fs'
import { v4 as uuid } from 'uuid'
import type {
  CronJob,
  CronRun,
  CreateJobRequest,
  UpdateJobRequest,
  Schedule
} from './types.js'
import { flattenSchedule } from './types.js'
import { computeNextRunAtMs } from './schedule.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '../../../data')
const DB_PATH = join(DATA_DIR, 'cron.db')

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           数据库初始化                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (db) return db

  // 确保数据目录存在
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }

  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  initTables(db)
  return db
}

function initTables(db: Database.Database): void {
  db.exec(`
    /* ════════════════════════════════════════════════════════════════════════
     * cron_jobs 表：定时任务定义
     * ════════════════════════════════════════════════════════════════════════ */
    CREATE TABLE IF NOT EXISTS cron_jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      enabled INTEGER DEFAULT 1,

      -- 调度配置（扁平化）
      schedule_kind TEXT NOT NULL,
      schedule_at_ms INTEGER,
      schedule_every_ms INTEGER,
      schedule_cron_expr TEXT,
      schedule_cron_tz TEXT,

      -- 执行目标
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_query TEXT NOT NULL,

      -- 运行状态
      next_run_at_ms INTEGER,
      last_run_at_ms INTEGER,
      last_status TEXT,
      last_error TEXT,
      running_session_id TEXT,

      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    /* ════════════════════════════════════════════════════════════════════════
     * cron_runs 表：执行历史记录
     * ════════════════════════════════════════════════════════════════════════ */
    CREATE TABLE IF NOT EXISTS cron_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      session_id TEXT,
      status TEXT NOT NULL,
      error TEXT,
      duration_ms INTEGER,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (job_id) REFERENCES cron_jobs(id) ON DELETE CASCADE
    );

    -- 索引：按下次执行时间查询
    CREATE INDEX IF NOT EXISTS idx_jobs_next_run ON cron_jobs(next_run_at_ms)
      WHERE enabled = 1 AND next_run_at_ms IS NOT NULL;

    -- 索引：按任务 ID 查询执行历史
    CREATE INDEX IF NOT EXISTS idx_runs_job_id ON cron_runs(job_id);

    /* ════════════════════════════════════════════════════════════════════════
     * notifications 表：通知记录
     * ════════════════════════════════════════════════════════════════════════ */
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      read INTEGER DEFAULT 0,
      job_id TEXT,
      session_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 索引：按已读状态查询
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
  `)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Job CRUD 操作                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/** 获取所有任务 */
export function listJobs(): CronJob[] {
  const rows = getDb().prepare('SELECT * FROM cron_jobs ORDER BY created_at DESC').all()
  return rows.map(rowToJob)
}

/** 获取单个任务 */
export function getJob(id: string): CronJob | null {
  const row = getDb().prepare('SELECT * FROM cron_jobs WHERE id = ?').get(id)
  return row ? rowToJob(row) : null
}

/** 创建任务 */
export function createJob(req: CreateJobRequest): CronJob {
  const id = uuid()
  const now = new Date().toISOString()
  const scheduleFields = flattenSchedule(req.schedule)
  const nextRunAtMs = computeNextRunAtMs(req.schedule)

  getDb().prepare(`
    INSERT INTO cron_jobs (
      id, name, description, enabled,
      schedule_kind, schedule_at_ms, schedule_every_ms, schedule_cron_expr, schedule_cron_tz,
      target_type, target_id, target_query,
      next_run_at_ms, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    req.name,
    req.description || null,
    req.enabled !== false ? 1 : 0,
    scheduleFields.scheduleKind,
    scheduleFields.scheduleAtMs || null,
    scheduleFields.scheduleEveryMs || null,
    scheduleFields.scheduleCronExpr || null,
    scheduleFields.scheduleCronTz || null,
    req.target.type,
    req.target.id,
    req.target.query,
    nextRunAtMs,
    now,
    now
  )

  return getJob(id)!
}

/** 更新任务 */
export function updateJob(id: string, req: UpdateJobRequest): CronJob | null {
  const existing = getJob(id)
  if (!existing) return null

  const updates: string[] = []
  const values: unknown[] = []

  if (req.name !== undefined) {
    updates.push('name = ?')
    values.push(req.name)
  }

  if (req.description !== undefined) {
    updates.push('description = ?')
    values.push(req.description)
  }

  if (req.enabled !== undefined) {
    updates.push('enabled = ?')
    values.push(req.enabled ? 1 : 0)
  }

  if (req.schedule !== undefined) {
    const fields = flattenSchedule(req.schedule)
    updates.push('schedule_kind = ?', 'schedule_at_ms = ?', 'schedule_every_ms = ?', 'schedule_cron_expr = ?', 'schedule_cron_tz = ?')
    values.push(
      fields.scheduleKind,
      fields.scheduleAtMs || null,
      fields.scheduleEveryMs || null,
      fields.scheduleCronExpr || null,
      fields.scheduleCronTz || null
    )
    // 重新计算下次执行时间
    const nextRunAtMs = computeNextRunAtMs(req.schedule)
    updates.push('next_run_at_ms = ?')
    values.push(nextRunAtMs)
  }

  if (req.target !== undefined) {
    updates.push('target_type = ?', 'target_id = ?', 'target_query = ?')
    values.push(req.target.type, req.target.id, req.target.query)
  }

  if (updates.length === 0) return existing

  updates.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(id)

  getDb().prepare(`UPDATE cron_jobs SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  return getJob(id)
}

/** 删除任务 */
export function deleteJob(id: string): boolean {
  const result = getDb().prepare('DELETE FROM cron_jobs WHERE id = ?').run(id)
  return result.changes > 0
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           执行状态更新                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/** 标记任务开始执行（获取锁） */
export function markJobRunning(id: string, sessionId: string): boolean {
  const result = getDb().prepare(`
    UPDATE cron_jobs
    SET running_session_id = ?, updated_at = ?
    WHERE id = ? AND running_session_id IS NULL
  `).run(sessionId, new Date().toISOString(), id)
  return result.changes > 0
}

/** 标记任务执行完成 */
export function markJobCompleted(
  id: string,
  status: 'ok' | 'error',
  error?: string
): void {
  const job = getJob(id)
  if (!job) return

  const now = Date.now()
  const schedule = jobToSchedule(job)
  const nextRunAtMs = computeNextRunAtMs(schedule, now)

  getDb().prepare(`
    UPDATE cron_jobs
    SET running_session_id = NULL,
        last_run_at_ms = ?,
        last_status = ?,
        last_error = ?,
        next_run_at_ms = ?,
        updated_at = ?
    WHERE id = ?
  `).run(now, status, error || null, nextRunAtMs, new Date().toISOString(), id)
}

/** 获取待执行的任务（下次执行时间 <= 当前时间） */
export function getDueJobs(): CronJob[] {
  const now = Date.now()
  const rows = getDb().prepare(`
    SELECT * FROM cron_jobs
    WHERE enabled = 1
      AND next_run_at_ms IS NOT NULL
      AND next_run_at_ms <= ?
      AND running_session_id IS NULL
    ORDER BY next_run_at_ms ASC
  `).all(now)
  return rows.map(rowToJob)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           执行历史记录                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/** 记录执行开始 */
export function createRun(jobId: string, sessionId: string): number {
  const result = getDb().prepare(`
    INSERT INTO cron_runs (job_id, session_id, status, started_at)
    VALUES (?, ?, 'running', ?)
  `).run(jobId, sessionId, new Date().toISOString())
  return result.lastInsertRowid as number
}

/** 记录执行完成 */
export function completeRun(
  runId: number,
  status: 'ok' | 'error',
  error?: string,
  durationMs?: number
): void {
  getDb().prepare(`
    UPDATE cron_runs
    SET status = ?, error = ?, duration_ms = ?, completed_at = ?
    WHERE id = ?
  `).run(status, error || null, durationMs || null, new Date().toISOString(), runId)
}

/** 获取任务的执行历史 */
export function getJobRuns(jobId: string, limit = 20): CronRun[] {
  const rows = getDb().prepare(`
    SELECT * FROM cron_runs
    WHERE job_id = ?
    ORDER BY started_at DESC
    LIMIT ?
  `).all(jobId, limit)
  return rows.map(rowToRun)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           辅助函数                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function rowToJob(row: unknown): CronJob {
  const r = row as Record<string, unknown>
  return {
    id: r.id as string,
    name: r.name as string,
    description: r.description as string | undefined,
    enabled: r.enabled === 1,
    scheduleKind: r.schedule_kind as CronJob['scheduleKind'],
    scheduleAtMs: r.schedule_at_ms as number | undefined,
    scheduleEveryMs: r.schedule_every_ms as number | undefined,
    scheduleCronExpr: r.schedule_cron_expr as string | undefined,
    scheduleCronTz: r.schedule_cron_tz as string | undefined,
    targetType: r.target_type as CronJob['targetType'],
    targetId: r.target_id as string,
    targetQuery: r.target_query as string,
    nextRunAtMs: r.next_run_at_ms as number | undefined,
    lastRunAtMs: r.last_run_at_ms as number | undefined,
    lastStatus: r.last_status as CronJob['lastStatus'],
    lastError: r.last_error as string | undefined,
    runningSessionId: r.running_session_id as string | undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

function rowToRun(row: unknown): CronRun {
  const r = row as Record<string, unknown>
  return {
    id: r.id as number,
    jobId: r.job_id as string,
    sessionId: r.session_id as string | undefined,
    status: r.status as CronRun['status'],
    error: r.error as string | undefined,
    durationMs: r.duration_ms as number | undefined,
    startedAt: r.started_at as string,
    completedAt: r.completed_at as string | undefined,
  }
}

function jobToSchedule(job: CronJob): Schedule {
  if (job.scheduleKind === 'at') {
    return { kind: 'at', atMs: job.scheduleAtMs! }
  }
  if (job.scheduleKind === 'every') {
    return { kind: 'every', everyMs: job.scheduleEveryMs! }
  }
  return {
    kind: 'cron',
    expr: job.scheduleCronExpr!,
    tz: job.scheduleCronTz
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           通知系统                                        │
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
  const row = getDb().prepare('SELECT COUNT(*) as count FROM notifications WHERE read = 0').get() as { count: number }
  return row.count
}

/** 标记单个通知为已读 */
export function markNotificationRead(id: number): boolean {
  const result = getDb().prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id)
  return result.changes > 0
}

/** 标记所有通知为已读 */
export function markAllNotificationsRead(): number {
  const result = getDb().prepare('UPDATE notifications SET read = 1 WHERE read = 0').run()
  return result.changes
}

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
