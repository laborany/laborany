/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║         GlobalKnowledge — 全局调研经验管理                              ║
 * ║                                                                        ║
 * ║  存储不针对特定站点的通用调研策略和技巧                                    ║
 * ║  数据文件: {DATA_DIR}/web-research/global-research-notes.md             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'

const LOG_PREFIX = '[GlobalKnowledge]'
const MAX_NOTES_PER_CATEGORY = 15
const NOTE_LINE_RE = /^- \[[\d-]+\] (.+)$/

interface NoteEntry {
  date: string
  content: string
  raw: string
}

/**
 * 全局调研经验管理器
 *
 * 以 Markdown 文件存储通用调研经验，按 category 分组。
 * 每个 category 最多保留 MAX_NOTES_PER_CATEGORY 条（FIFO）。
 */
export class GlobalKnowledge {
  private filePath: string
  private categories: Map<string, NoteEntry[]> = new Map()
  private initialized = false

  constructor(dataDir: string) {
    this.filePath = join(dataDir, 'web-research', 'global-research-notes.md')
  }

  async init(): Promise<void> {
    if (this.initialized) return
    await mkdir(dirname(this.filePath), { recursive: true })
    await this.load()
    this.initialized = true
  }

  /**
   * 添加一条全局调研笔记
   * 自动去重、限制每个 category 最多 MAX_NOTES_PER_CATEGORY 条
   */
  async addNote(category: string, note: string): Promise<{ added: boolean; reason?: string }> {
    await this.init()

    const trimmedNote = note.trim()
    if (!trimmedNote) {
      return { added: false, reason: '笔记内容为空' }
    }

    const normalizedCategory = category.trim() || '调研技巧'
    const date = new Date().toISOString().slice(0, 7) // YYYY-MM

    const entries = this.categories.get(normalizedCategory) || []

    // De-duplicate: check if an existing entry has the same content
    const isDuplicate = entries.some(
      (entry) => entry.content.toLowerCase() === trimmedNote.toLowerCase(),
    )
    if (isDuplicate) {
      return { added: false, reason: '该经验已存在' }
    }

    const newEntry: NoteEntry = {
      date,
      content: trimmedNote,
      raw: `- [${date}] ${trimmedNote}`,
    }

    entries.push(newEntry)

    // Cap: remove oldest entries if over limit
    const trimmedEntries = entries.length > MAX_NOTES_PER_CATEGORY
      ? entries.slice(entries.length - MAX_NOTES_PER_CATEGORY)
      : entries

    this.categories.set(normalizedCategory, trimmedEntries)
    await this.save()

    console.log(`${LOG_PREFIX} Added note to "${normalizedCategory}": ${trimmedNote}`)
    return { added: true }
  }

  /**
   * 获取所有全局经验，格式化为可读文本
   */
  getAllNotes(): string {
    if (this.categories.size === 0) {
      return ''
    }

    const sections: string[] = []
    for (const [category, entries] of this.categories) {
      if (entries.length === 0) continue
      sections.push(`## ${category}`)
      for (const entry of entries) {
        sections.push(entry.raw)
      }
      sections.push('')
    }

    return sections.join('\n').trim()
  }

  /**
   * 获取统计信息
   */
  getStats(): { categoryCount: number; totalNotes: number } {
    let totalNotes = 0
    for (const entries of this.categories.values()) {
      totalNotes += entries.length
    }
    return { categoryCount: this.categories.size, totalNotes }
  }

  // ── Internal ──

  private async load(): Promise<void> {
    this.categories.clear()

    let content: string
    try {
      content = await readFile(this.filePath, 'utf-8')
    } catch {
      // File doesn't exist yet — that's fine
      return
    }

    let currentCategory = ''
    for (const line of content.split('\n')) {
      const trimmed = line.trim()

      // Heading: ## Category Name
      if (trimmed.startsWith('## ')) {
        currentCategory = trimmed.slice(3).trim()
        if (!this.categories.has(currentCategory)) {
          this.categories.set(currentCategory, [])
        }
        continue
      }

      // Note line: - [YYYY-MM] content
      const match = trimmed.match(/^- \[([\d-]+)\] (.+)$/)
      if (match && currentCategory) {
        const entries = this.categories.get(currentCategory) || []
        entries.push({
          date: match[1],
          content: match[2],
          raw: trimmed,
        })
        this.categories.set(currentCategory, entries)
      }
    }

    const stats = this.getStats()
    console.log(
      `${LOG_PREFIX} Loaded ${stats.totalNotes} notes across ${stats.categoryCount} categories`,
    )
  }

  private async save(): Promise<void> {
    const content = this.getAllNotes()
    await writeFile(this.filePath, content ? `${content}\n` : '', 'utf-8')
  }
}
