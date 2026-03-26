/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║         GlobalKnowledge — 全局调研经验管理                              ║
 * ║                                                                        ║
 * ║  存储不针对特定站点的通用调研策略和技巧                                    ║
 * ║  兼容旧文件名 global-notes.md 与新文件名 global-research-notes.md        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

const LOG_PREFIX = '[GlobalKnowledge]'
const MAX_NOTES_PER_CATEGORY = 15
const DATED_NOTE_RE = /^- \[([\d-]+)\] (.+)$/
const PLAIN_NOTE_RE = /^- (.+)$/

interface NoteEntry {
  date: string
  content: string
  raw: string
}

export class GlobalKnowledge {
  private readonly legacyFilePath: string
  private readonly filePath: string
  private categories: Map<string, NoteEntry[]> = new Map()
  private initialized = false

  constructor(dataDir: string) {
    const rootDir = join(dataDir, 'web-research')
    this.filePath = join(rootDir, 'global-research-notes.md')
    this.legacyFilePath = join(rootDir, 'global-notes.md')
  }

  async init(): Promise<void> {
    if (this.initialized) return
    await mkdir(dirname(this.filePath), { recursive: true })
    await this.migrateLegacyFileIfNeeded()
    await this.load()
    this.initialized = true
  }

  async addNote(
    category: string,
    note: string,
  ): Promise<{ added: boolean; reason?: string }> {
    await this.init()

    const normalizedCategory = category.trim() || '调研技巧'
    const normalizedNote = normalizeNote(note)
    if (!normalizedNote) {
      return { added: false, reason: '笔记内容为空' }
    }

    const entries = this.categories.get(normalizedCategory) || []
    const isDuplicate = entries.some(
      (entry) => entry.content.toLowerCase() === normalizedNote.toLowerCase(),
    )
    if (isDuplicate) {
      return { added: false, reason: '该经验已存在' }
    }

    const date = new Date().toISOString().slice(0, 7)
    const nextEntry: NoteEntry = {
      date,
      content: normalizedNote,
      raw: `- [${date}] ${normalizedNote}`,
    }

    const nextEntries = [...entries, nextEntry]
      .slice(-MAX_NOTES_PER_CATEGORY)
    this.categories.set(normalizedCategory, nextEntries)
    await this.save()

    console.log(`${LOG_PREFIX} Added note to "${normalizedCategory}": ${normalizedNote}`)
    return { added: true }
  }

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

  getStats(): { categoryCount: number; totalNotes: number } {
    let totalNotes = 0
    for (const entries of this.categories.values()) {
      totalNotes += entries.length
    }
    return {
      categoryCount: this.categories.size,
      totalNotes,
    }
  }

  private async migrateLegacyFileIfNeeded(): Promise<void> {
    try {
      await readFile(this.filePath, 'utf-8')
      return
    } catch {
      // continue
    }

    try {
      const legacy = await readFile(this.legacyFilePath, 'utf-8')
      await writeFile(this.filePath, legacy, 'utf-8')
      await rename(this.legacyFilePath, `${this.legacyFilePath}.migrated`)
      console.log(`${LOG_PREFIX} Migrated legacy notes file to ${this.filePath}`)
    } catch {
      // no legacy file, ignore
    }
  }

  private async load(): Promise<void> {
    this.categories.clear()

    let content: string
    try {
      content = await readFile(this.filePath, 'utf-8')
    } catch {
      return
    }

    let currentCategory = ''
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim()
      if (!line) continue
      if (line.startsWith('# ')) continue

      if (line.startsWith('## ')) {
        currentCategory = line.slice(3).trim() || '调研技巧'
        if (!this.categories.has(currentCategory)) {
          this.categories.set(currentCategory, [])
        }
        continue
      }

      if (!currentCategory) continue

      const datedMatch = line.match(DATED_NOTE_RE)
      if (datedMatch) {
        this.pushEntry(currentCategory, {
          date: datedMatch[1],
          content: normalizeNote(datedMatch[2]),
          raw: line,
        })
        continue
      }

      const plainMatch = line.match(PLAIN_NOTE_RE)
      if (plainMatch) {
        const content = normalizeNote(plainMatch[1])
        if (!content) continue
        this.pushEntry(currentCategory, {
          date: 'legacy',
          content,
          raw: `- [legacy] ${content}`,
        })
      }
    }

    const stats = this.getStats()
    console.log(
      `${LOG_PREFIX} Loaded ${stats.totalNotes} notes across ${stats.categoryCount} categories`,
    )
  }

  private pushEntry(category: string, entry: NoteEntry): void {
    if (!entry.content) return
    const entries = this.categories.get(category) || []
    if (entries.some((item) => item.content.toLowerCase() === entry.content.toLowerCase())) {
      return
    }
    entries.push(entry)
    this.categories.set(category, entries.slice(-MAX_NOTES_PER_CATEGORY))
  }

  private async save(): Promise<void> {
    const content = this.getAllNotes()
    await writeFile(this.filePath, content ? `${content}\n` : '', 'utf-8')
  }
}

function normalizeNote(note: string): string {
  return note.replace(/\s+/g, ' ').trim()
}
