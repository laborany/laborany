# ╔══════════════════════════════════════════════════════════════════════════╗
# ║                         数据库连接模块                                     ║
# ║                                                                          ║
# ║  使用 aiosqlite 实现异步 SQLite 操作                                       ║
# ╚══════════════════════════════════════════════════════════════════════════╝

import aiosqlite
from pathlib import Path

DB_PATH = Path(__file__).parent.parent.parent / "data" / "laborany.db"

# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           数据库初始化                                     │
# └──────────────────────────────────────────────────────────────────────────┘
async def init_db():
    """初始化数据库，创建必要的表"""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    async with aiosqlite.connect(DB_PATH) as db:
        # 用户表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                balance REAL DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)

        # 会话表
        await db.execute("""
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
        """)

        # 消息表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                type TEXT NOT NULL,
                content TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            )
        """)

        # 文件表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                size INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)

        # ┌──────────────────────────────────────────────────────────────────┐
        # │                       工作流相关表                                 │
        # └──────────────────────────────────────────────────────────────────┘

        # 工作流定义表
        await db.execute("""
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
        """)

        # 工作流执行记录表
        await db.execute("""
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
        """)

        # 步骤执行记录表
        await db.execute("""
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
        """)

        await db.commit()


# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           数据库连接获取                                   │
# └──────────────────────────────────────────────────────────────────────────┘
async def get_db():
    """获取数据库连接（用于依赖注入）"""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()
