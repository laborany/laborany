/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         数据库模块 - SQLite (sql.js)                     ║
 * ║                                                                          ║
 * ║  使用 sql.js 实现纯 JS SQLite 操作（无需编译原生模块）                      ║
 * ║  数据存储在用户 AppData 目录                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import initSqlJs, { type Database, type BindParams } from 'sql.js'
import { join } from 'path'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { getAppHomeDir } from '../lib/app-home.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           数据库路径                                      │
 * │                                                                          │
 * │  使用 process.pkg 检测打包环境，与其他模块保持一致                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getDbPath(): string {
  const appDataDir = getAppHomeDir()
  if (!existsSync(appDataDir)) {
    mkdirSync(appDataDir, { recursive: true })
  }
  return join(appDataDir, 'laborany.db')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           数据库实例                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
let db: Database | null = null
let dbPath: string = ''

export async function initDb(): Promise<Database> {
  if (db) return db

  const SQL = await initSqlJs()
  dbPath = getDbPath()

  // 尝试加载现有数据库
  if (existsSync(dbPath)) {
    const fileBuffer = readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  // 初始化表结构
  createTables(db)

  return db
}

export function getDb(): Database {
  if (!db) {
    throw new Error('数据库未初始化，请先调用 initDb()')
  }
  return db
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           保存数据库到文件                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function saveDb(): void {
  if (!db || !dbPath) return
  const data = db.export()
  const buffer = Buffer.from(data)
  writeFileSync(dbPath, buffer)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           数据库初始化                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function createTables(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      balance REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      work_id TEXT,
      skill_id TEXT NOT NULL,
      query TEXT NOT NULL,
      status TEXT DEFAULT 'running',
      cost REAL DEFAULT 0,
      work_dir TEXT,
      model_profile_id TEXT,
      model_profile_name TEXT,
      model_name TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS works (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      status TEXT DEFAULT 'running',
      phase TEXT DEFAULT 'assistant_running',
      source TEXT DEFAULT 'desktop',
      current_owner_skill_id TEXT,
      primary_session_id TEXT,
      latest_session_id TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT,
      tool_name TEXT,
      tool_input TEXT,
      tool_result TEXT,
      meta TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      size INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  // 数据库迁移：为旧表添加新字段
  migrateDatabase(db)

  // 创建索引
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_work_id ON sessions(work_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_works_user_id ON works(user_id)`)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           数据库迁移                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function migrateDatabase(db: Database): void {
  // 检查 sessions 表是否有新增列
  try {
    const messageTableInfo = db.exec('PRAGMA table_info(messages)')
    const messageColumns = messageTableInfo[0]?.values.map(row => row[1]) || []
    if (!messageColumns.includes('meta')) {
      db.run('ALTER TABLE messages ADD COLUMN meta TEXT')
      console.log('[DB] 迁移：添加 messages.meta 列')
    }

    const tableInfo = db.exec('PRAGMA table_info(sessions)')
    const columns = tableInfo[0]?.values.map(row => row[1]) || []
    if (!columns.includes('work_dir')) {
      db.run('ALTER TABLE sessions ADD COLUMN work_dir TEXT')
      console.log('[DB] 迁移：添加 sessions.work_dir 列')
    }
    if (!columns.includes('work_id')) {
      db.run('ALTER TABLE sessions ADD COLUMN work_id TEXT')
      console.log('[DB] 迁移：添加 sessions.work_id 列')
    }
    if (!columns.includes('model_profile_id')) {
      db.run('ALTER TABLE sessions ADD COLUMN model_profile_id TEXT')
      console.log('[DB] 迁移：添加 sessions.model_profile_id 列')
    }
    if (!columns.includes('model_profile_name')) {
      db.run('ALTER TABLE sessions ADD COLUMN model_profile_name TEXT')
      console.log('[DB] 迁移：添加 sessions.model_profile_name 列')
    }
    if (!columns.includes('model_name')) {
      db.run('ALTER TABLE sessions ADD COLUMN model_name TEXT')
      console.log('[DB] 迁移：添加 sessions.model_name 列')
    }
    if (!columns.includes('updated_at')) {
      db.run('ALTER TABLE sessions ADD COLUMN updated_at TEXT')
      console.log('[DB] 迁移：添加 sessions.updated_at 列')
    }
    if (!columns.includes('source')) {
      db.run("ALTER TABLE sessions ADD COLUMN source TEXT DEFAULT 'desktop'")
      console.log('[DB] 迁移：添加 sessions.source 列')
    }
    if (!columns.includes('source_meta')) {
      db.run('ALTER TABLE sessions ADD COLUMN source_meta TEXT')
      console.log('[DB] 迁移：添加 sessions.source_meta 列')
    }
    db.run(`
      UPDATE sessions
      SET updated_at = COALESCE(updated_at, created_at, datetime('now'))
      WHERE updated_at IS NULL OR updated_at = ''
    `)

    const workTable = db.exec(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'works'`)
    if (!workTable.length) {
      db.run(`
        CREATE TABLE works (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          summary TEXT,
          status TEXT DEFAULT 'running',
          phase TEXT DEFAULT 'assistant_running',
          source TEXT DEFAULT 'desktop',
          current_owner_skill_id TEXT,
          primary_session_id TEXT,
          latest_session_id TEXT,
          updated_at TEXT DEFAULT (datetime('now')),
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `)
      console.log('[DB] 迁移：创建 works 表')
    }
  } catch (err) {
    console.warn('[DB] 迁移检查失败:', err)
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           关闭数据库                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function closeDb(): void {
  if (db) {
    saveDb()
    db.close()
    db = null
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           辅助函数                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function runQuery(sql: string, params: BindParams = []): void {
  const database = getDb()
  database.run(sql, params)
  saveDb()
}

export function insertQuery(sql: string, params: BindParams = []): number {
  const database = getDb()
  database.run(sql, params)

  const result = database.exec('SELECT last_insert_rowid() AS id')
  saveDb()

  const rawId = result[0]?.values?.[0]?.[0]
  return typeof rawId === 'number' ? rawId : Number(rawId || 0)
}

export function getOne<T>(sql: string, params: BindParams = []): T | undefined {
  const database = getDb()
  const stmt = database.prepare(sql)
  stmt.bind(params)
  if (stmt.step()) {
    const row = stmt.getAsObject() as T
    stmt.free()
    return row
  }
  stmt.free()
  return undefined
}

export function getAll<T>(sql: string, params: BindParams = []): T[] {
  const database = getDb()
  const stmt = database.prepare(sql)
  stmt.bind(params)
  const results: T[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T)
  }
  stmt.free()
  return results
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           便捷 dbHelper 对象                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const dbHelper = {
  query: <T>(sql: string, params: BindParams = []): T[] => getAll<T>(sql, params),
  get: <T>(sql: string, params: BindParams = []): T | undefined => getOne<T>(sql, params),
  run: (sql: string, params: BindParams = []): void => runQuery(sql, params),
  insert: (sql: string, params: BindParams = []): number => insertQuery(sql, params),
}
