/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Episode 存储器                                        ║
 * ║                                                                          ║
 * ║  职责：Episode 的持久化存储和读取                                          ║
 * ║  格式：Markdown 文件                                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { DATA_DIR } from '../../paths.js'
import type { Episode } from './cluster.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           路径常量                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const EPISODES_DIR = join(DATA_DIR, 'memory', 'episodes')

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     工具函数                                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     Episode 存储器类                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class EpisodeStorage {
  constructor() {
    ensureDir(EPISODES_DIR)
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  将 Episode 转换为 Markdown
   * ──────────────────────────────────────────────────────────────────────── */
  private toMarkdown(ep: Episode): string {
    const lines: string[] = []

    // YAML frontmatter
    lines.push('---')
    lines.push(`id: ${ep.id}`)
    lines.push(`subject: ${ep.subject}`)
    lines.push(`cell_ids: [${ep.cellIds.join(', ')}]`)
    lines.push(`created_at: ${ep.createdAt.toISOString()}`)
    lines.push(`updated_at: ${ep.updatedAt.toISOString()}`)
    lines.push('---')
    lines.push('')

    // 情节摘要
    lines.push('## 情节摘要')
    lines.push('')
    lines.push(ep.summary)
    lines.push('')

    // 关键词
    lines.push('## 关键词')
    lines.push('')
    lines.push(ep.centroid.join(', '))
    lines.push('')

    // 关键事实
    if (ep.keyFacts.length > 0) {
      lines.push('## 关键事实')
      lines.push('')
      lines.push('| 事实 | 证据来源 |')
      lines.push('|------|----------|')
      for (const { fact, source } of ep.keyFacts) {
        lines.push(`| ${fact} | ${source} |`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  从 Markdown 解析 Episode
   * ──────────────────────────────────────────────────────────────────────── */
  private fromMarkdown(content: string): Episode | null {
    // 解析 YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
    if (!frontmatterMatch) return null

    const frontmatter = frontmatterMatch[1]
    const meta: Record<string, string> = {}
    for (const line of frontmatter.split('\n')) {
      const colonIdx = line.indexOf(':')
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim()
        const value = line.slice(colonIdx + 1).trim()
        meta[key] = value
      }
    }

    // 解析 cell_ids
    const cellIdsMatch = meta.cell_ids?.match(/\[(.*)\]/)
    const cellIds = cellIdsMatch
      ? cellIdsMatch[1].split(',').map(s => s.trim()).filter(Boolean)
      : []

    // 解析摘要
    const summaryMatch = content.match(/## 情节摘要\n\n([\s\S]*?)(?=\n## |$)/)
    const summary = summaryMatch ? summaryMatch[1].trim() : ''

    // 解析关键词
    const keywordsMatch = content.match(/## 关键词\n\n([\s\S]*?)(?=\n## |$)/)
    const centroid = keywordsMatch
      ? keywordsMatch[1].trim().split(',').map(s => s.trim())
      : []

    // 解析关键事实
    const keyFacts: Episode['keyFacts'] = []
    const factsMatch = content.match(/## 关键事实\n\n[\s\S]*?\n\|---.*\|\n([\s\S]*?)(?=\n## |$)/)
    if (factsMatch) {
      const rows = factsMatch[1].trim().split('\n')
      for (const row of rows) {
        const cells = row.split('|').map(s => s.trim()).filter(Boolean)
        if (cells.length >= 2) {
          keyFacts.push({ fact: cells[0], source: cells[1] })
        }
      }
    }

    return {
      id: meta.id || '',
      subject: meta.subject || '',
      cellIds,
      centroid,
      summary,
      keyFacts,
      createdAt: new Date(meta.created_at || Date.now()),
      updatedAt: new Date(meta.updated_at || Date.now()),
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  保存 Episode
   * ──────────────────────────────────────────────────────────────────────── */
  save(ep: Episode): string {
    const filePath = join(EPISODES_DIR, `${ep.id}.md`)
    const content = this.toMarkdown(ep)
    writeFileSync(filePath, content, 'utf-8')
    return filePath
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  读取单个 Episode
   * ──────────────────────────────────────────────────────────────────────── */
  load(id: string): Episode | null {
    const filePath = join(EPISODES_DIR, `${id}.md`)
    if (!existsSync(filePath)) return null
    return this.fromMarkdown(readFileSync(filePath, 'utf-8'))
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  列出所有 Episode
   * ──────────────────────────────────────────────────────────────────────── */
  listAll(): Episode[] {
    if (!existsSync(EPISODES_DIR)) return []

    const episodes: Episode[] = []
    for (const file of readdirSync(EPISODES_DIR)) {
      if (!file.endsWith('.md')) continue
      const content = readFileSync(join(EPISODES_DIR, file), 'utf-8')
      const ep = this.fromMarkdown(content)
      if (ep) episodes.push(ep)
    }

    return episodes.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  根据 MemCell ID 查找相关 Episode
   * ──────────────────────────────────────────────────────────────────────── */
  findByCellId(cellId: string): Episode[] {
    return this.listAll().filter(ep => ep.cellIds.includes(cellId))
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出单例                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const episodeStorage = new EpisodeStorage()
export { EPISODES_DIR }