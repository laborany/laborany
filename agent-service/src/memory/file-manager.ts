/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Memory File Manager                                   ║
 * ║                                                                          ║
 * ║  职责：管理 Memory 文件的读写操作                                          ║
 * ║  设计：纯 Markdown 文件，文件系统为 source of truth                        ║
 * ║  存储：使用 DATA_DIR（可写目录），避免打包后权限问题                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'fs'
import { join, dirname } from 'path'
import { DATA_DIR } from '../paths.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           路径常量                                        │
 * │  所有 Memory 文件存储在 DATA_DIR，确保可写                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const MEMORY_DIR = join(DATA_DIR, 'memory')
const GLOBAL_MEMORY_DIR = join(MEMORY_DIR, 'global')
const SKILLS_MEMORY_DIR = join(MEMORY_DIR, 'skills')
const BOSS_MD_PATH = join(DATA_DIR, 'BOSS.md')
const GLOBAL_MEMORY_MD_PATH = join(DATA_DIR, 'MEMORY.md')

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export type MemoryScope = 'global' | 'skill'

interface AppendDailyParams {
  scope: MemoryScope
  skillId?: string
  content: string
  timestamp?: Date
}

interface AppendLongTermParams {
  scope: MemoryScope
  skillId?: string
  section: string
  content: string
}

interface RecentDailyParams {
  scope: MemoryScope
  skillId?: string
  days?: number
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           工具函数                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 5)
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function getSkillMemoryDir(skillId: string): string {
  return join(SKILLS_MEMORY_DIR, skillId)
}

function getDailyPath(scope: MemoryScope, skillId?: string, date?: Date): string {
  const dateStr = formatDate(date || new Date())
  const baseDir = scope === 'global' ? GLOBAL_MEMORY_DIR : getSkillMemoryDir(skillId!)
  return join(baseDir, `${dateStr}.md`)
}

function getLongTermPath(scope: MemoryScope, skillId?: string): string {
  if (scope === 'global') return GLOBAL_MEMORY_MD_PATH
  return join(getSkillMemoryDir(skillId!), 'MEMORY.md')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     Memory File Manager 类                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class MemoryFileManager {
  /* ────────────────────────────────────────────────────────────────────────
   *  读取文件内容
   * ──────────────────────────────────────────────────────────────────────── */
  readFile(path: string): string | null {
    if (!existsSync(path)) return null
    return readFileSync(path, 'utf-8')
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  读取 BOSS.md
   * ──────────────────────────────────────────────────────────────────────── */
  readBossMd(): string | null {
    return this.readFile(BOSS_MD_PATH)
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  读取全局长期记忆
   * ──────────────────────────────────────────────────────────────────────── */
  readGlobalMemory(): string | null {
    return this.readFile(GLOBAL_MEMORY_MD_PATH)
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  读取 Skill 长期记忆
   * ──────────────────────────────────────────────────────────────────────── */
  readSkillMemory(skillId: string): string | null {
    const path = getLongTermPath('skill', skillId)
    return this.readFile(path)
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  追加到每日日志
   * ──────────────────────────────────────────────────────────────────────── */
  appendToDaily(params: AppendDailyParams): void {
    const { scope, skillId, content, timestamp = new Date() } = params
    const path = getDailyPath(scope, skillId, timestamp)

    ensureDir(dirname(path))

    const timeStr = formatTime(timestamp)
    const entry = `\n## ${timeStr}\n${content}\n`

    // 如果文件不存在，先写入标题
    if (!existsSync(path)) {
      const dateStr = formatDate(timestamp)
      const header = `# ${dateStr} 工作记忆\n`
      appendFileSync(path, header, 'utf-8')
    }

    appendFileSync(path, entry, 'utf-8')
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  获取最近几天的每日记忆路径
   * ──────────────────────────────────────────────────────────────────────── */
  getRecentDailyPaths(params: RecentDailyParams): string[] {
    const { scope, skillId, days = 2 } = params
    const paths: string[] = []
    const now = new Date()

    for (let i = 0; i < days; i++) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const path = getDailyPath(scope, skillId, date)
      if (existsSync(path)) {
        paths.push(path)
      }
    }

    return paths
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  读取最近几天的每日记忆内容
   * ──────────────────────────────────────────────────────────────────────── */
  readRecentDaily(params: RecentDailyParams): string {
    const paths = this.getRecentDailyPaths(params)
    const contents: string[] = []

    for (const path of paths) {
      const content = this.readFile(path)
      if (content) contents.push(content)
    }

    return contents.join('\n\n---\n\n')
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  确保 Skill 记忆目录存在
   * ──────────────────────────────────────────────────────────────────────── */
  ensureSkillMemoryDir(skillId: string): void {
    ensureDir(getSkillMemoryDir(skillId))
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出单例                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const memoryFileManager = new MemoryFileManager()
export { BOSS_MD_PATH, GLOBAL_MEMORY_MD_PATH, MEMORY_DIR, SKILLS_MEMORY_DIR }
