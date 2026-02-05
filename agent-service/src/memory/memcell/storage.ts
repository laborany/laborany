/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     MemCell 存储器                                        ║
 * ║                                                                          ║
 * ║  职责：MemCell 的持久化存储和读取                                          ║
 * ║  格式：Markdown 文件，按日期组织                                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { DATA_DIR } from '../../paths.js'
import type { MemCell, Message, ExtractedFact } from './extractor.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           路径常量                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const CELLS_DIR = join(DATA_DIR, 'memory', 'cells')

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     工具函数                                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function formatTime(date: Date): string {
  return date.toISOString().split('T')[1].slice(0, 8)
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     MemCell 存储器类                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class MemCellStorage {
  /* ────────────────────────────────────────────────────────────────────────
   *  将 MemCell 转换为 Markdown
   * ──────────────────────────────────────────────────────────────────────── */
  private toMarkdown(cell: MemCell): string {
    const lines: string[] = []

    // YAML frontmatter
    lines.push('---')
    lines.push(`id: ${cell.id}`)
    lines.push(`timestamp: ${cell.timestamp.toISOString()}`)
    lines.push(`skill_id: ${cell.skillId}`)
    lines.push(`summary: ${cell.summary}`)
    lines.push('---')
    lines.push('')

    // 原始对话
    lines.push('## 原始对话')
    lines.push('')
    for (const msg of cell.messages) {
      const time = msg.timestamp ? formatTime(msg.timestamp) : ''
      const role = msg.role === 'user' ? 'User' : 'Assistant'
      lines.push(`**${role}${time ? ` (${time})` : ''}**: ${msg.content}`)
      lines.push('')
    }

    // 提取的事实
    if (cell.facts.length > 0) {
      lines.push('## 提取的事实')
      lines.push('')
      for (const fact of cell.facts) {
        lines.push(`- [${fact.type}] ${fact.content} (置信度: ${fact.confidence})`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  从 Markdown 解析 MemCell
   * ──────────────────────────────────────────────────────────────────────── */
  private fromMarkdown(content: string): MemCell | null {
    // 解析 YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
    if (!frontmatterMatch) return null

    const frontmatter = frontmatterMatch[1]
    const meta: Record<string, string> = {}
    for (const line of frontmatter.split('\n')) {
      const [key, ...valueParts] = line.split(':')
      if (key && valueParts.length > 0) {
        meta[key.trim()] = valueParts.join(':').trim()
      }
    }

    // 解析对话
    const messages: Message[] = []
    const dialogMatch = content.match(/## 原始对话\n\n([\s\S]*?)(?=\n## |$)/)
    if (dialogMatch) {
      const msgRegex = /\*\*(User|Assistant)(?:\s*\(([^)]+)\))?\*\*:\s*(.+)/g
      let match
      while ((match = msgRegex.exec(dialogMatch[1])) !== null) {
        messages.push({
          role: match[1].toLowerCase() as 'user' | 'assistant',
          content: match[3].trim(),
          timestamp: match[2] ? new Date(`1970-01-01T${match[2]}`) : undefined,
        })
      }
    }

    // 解析事实
    const facts: ExtractedFact[] = []
    const factsMatch = content.match(/## 提取的事实\n\n([\s\S]*?)(?=\n## |$)/)
    if (factsMatch) {
      const factRegex = /- \[(\w+)\] (.+?) \(置信度: ([\d.]+)\)/g
      let match
      while ((match = factRegex.exec(factsMatch[1])) !== null) {
        facts.push({
          type: match[1] as ExtractedFact['type'],
          content: match[2],
          confidence: parseFloat(match[3]),
        })
      }
    }

    return {
      id: meta.id || '',
      timestamp: new Date(meta.timestamp || Date.now()),
      skillId: meta.skill_id || '',
      summary: meta.summary || '',
      messages,
      facts,
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  保存 MemCell
   * ──────────────────────────────────────────────────────────────────────── */
  save(cell: MemCell): string {
    const dateStr = formatDate(cell.timestamp)
    const dir = join(CELLS_DIR, dateStr)
    ensureDir(dir)

    const filePath = join(dir, `${cell.id}.md`)
    const content = this.toMarkdown(cell)
    writeFileSync(filePath, content, 'utf-8')

    return filePath
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  读取单个 MemCell
   * ──────────────────────────────────────────────────────────────────────── */
  load(id: string, date?: Date): MemCell | null {
    // 如果提供了日期，直接定位
    if (date) {
      const dateStr = formatDate(date)
      const filePath = join(CELLS_DIR, dateStr, `${id}.md`)
      if (existsSync(filePath)) {
        return this.fromMarkdown(readFileSync(filePath, 'utf-8'))
      }
      return null
    }

    // 否则遍历所有日期目录
    if (!existsSync(CELLS_DIR)) return null
    for (const dateDir of readdirSync(CELLS_DIR)) {
      const filePath = join(CELLS_DIR, dateDir, `${id}.md`)
      if (existsSync(filePath)) {
        return this.fromMarkdown(readFileSync(filePath, 'utf-8'))
      }
    }
    return null
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  列出指定日期的所有 MemCell
   * ──────────────────────────────────────────────────────────────────────── */
  listByDate(date: Date): MemCell[] {
    const dateStr = formatDate(date)
    const dir = join(CELLS_DIR, dateStr)
    if (!existsSync(dir)) return []

    const cells: MemCell[] = []
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.md')) continue
      const content = readFileSync(join(dir, file), 'utf-8')
      const cell = this.fromMarkdown(content)
      if (cell) cells.push(cell)
    }

    return cells.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  列出最近 N 天的所有 MemCell
   * ──────────────────────────────────────────────────────────────────────── */
  listRecent(days = 7): MemCell[] {
    const cells: MemCell[] = []
    const now = new Date()

    for (let i = 0; i < days; i++) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      cells.push(...this.listByDate(date))
    }

    return cells.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出单例                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const memCellStorage = new MemCellStorage()
export { CELLS_DIR }