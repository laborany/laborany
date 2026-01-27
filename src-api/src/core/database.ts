/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         数据库模块 - SQLite (sql.js)                     ║
 * ║                                                                          ║
 * ║  使用 sql.js 实现纯 JS SQLite 操作（无需编译原生模块）                      ║
 * ║  数据存储在用户 AppData 目录                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import initSqlJs, { type Database, type BindParams } from 'sql.js'
import { join } from 'path'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           数据库路径                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getDbPath(): string {
  const isProduction = process.env.NODE_ENV === 'production'

  if (isProduction) {
    const appDataDir = process.platform === 'win32'
      ? join(homedir(), 'AppData', 'Roaming', 'LaborAny')
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support', 'LaborAny')
        : join(homedir(), '.config', 'laborany')

    if (!existsSync(appDataDir)) {
      mkdirSync(appDataDir, { recursive: true })
    }
    return join(appDataDir, 'laborany.db')
  }

  const dataDir = join(process.cwd(), 'data')
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }
  return join(dataDir, 'laborany.db')
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
      skill_id TEXT NOT NULL,
      query TEXT NOT NULL,
      status TEXT DEFAULT 'running',
      cost REAL DEFAULT 0,
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

  db.run(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      definition TEXT NOT NULL,
      user_id TEXT NOT NULL,
      is_public INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT DEFAULT 'running',
      input TEXT NOT NULL,
      context TEXT,
      current_step INTEGER DEFAULT 0,
      total_steps INTEGER NOT NULL,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS workflow_step_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      skill_id TEXT NOT NULL,
      session_id TEXT,
      status TEXT DEFAULT 'pending',
      output TEXT,
      error TEXT,
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (run_id) REFERENCES workflow_runs(id)
    )
  `)

  // 创建索引
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs(workflow_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_workflow_step_runs_run_id ON workflow_step_runs(run_id)`)
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
}
