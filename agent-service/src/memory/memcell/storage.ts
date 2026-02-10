import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { DATA_DIR } from '../../paths.js'
import type { MemCell, Message, ExtractedFact } from './extractor.js'

const CELLS_DIR = join(DATA_DIR, 'memory', 'cells')

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

function parseFactLine(line: string): ExtractedFact | null {
  if (!line.startsWith('- [')) return null
  const close = line.indexOf('] ')
  if (close < 0) return null

  const header = line.slice(3, close)
  const rest = line.slice(close + 2)
  const confMatch = rest.match(/\((?:置信度)[:：]?\s*([\d.]+)\)$/)
  if (!confMatch) return null

  const content = rest.slice(0, confMatch.index).trim()
  const confidence = Number.parseFloat(confMatch[1])
  if (!content || Number.isNaN(confidence)) return null

  const [rawType, rawSource, rawIntent] = header.split('|').map(item => item.trim())
  const type: ExtractedFact['type'] =
    rawType === 'preference' || rawType === 'fact' || rawType === 'correction' || rawType === 'context'
      ? rawType
      : 'context'
  const source: ExtractedFact['source'] =
    rawSource === 'user' || rawSource === 'assistant' || rawSource === 'event'
      ? rawSource
      : 'user'
  const intent: ExtractedFact['intent'] =
    rawIntent === 'preference'
    || rawIntent === 'fact'
    || rawIntent === 'correction'
    || rawIntent === 'context'
    || rawIntent === 'response_style'
      ? rawIntent
      : type

  return { type, content, confidence, source, intent }
}

export class MemCellStorage {
  private toMarkdown(cell: MemCell): string {
    const lines: string[] = []

    lines.push('---')
    lines.push(`id: ${cell.id}`)
    lines.push(`timestamp: ${cell.timestamp.toISOString()}`)
    lines.push(`skill_id: ${cell.skillId}`)
    lines.push(`summary: ${cell.summary}`)
    lines.push('---')
    lines.push('')

    lines.push('## 原始对话')
    lines.push('')
    for (const msg of cell.messages) {
      const time = msg.timestamp ? formatTime(msg.timestamp) : ''
      const role = msg.role === 'user' ? 'User' : 'Assistant'
      lines.push(`**${role}${time ? ` (${time})` : ''}**: ${msg.content}`)
      lines.push('')
    }

    if (cell.facts.length > 0) {
      lines.push('## 提取的事实')
      lines.push('')
      for (const fact of cell.facts) {
        const source = fact.source || 'user'
        const intent = fact.intent || fact.type
        lines.push(`- [${fact.type}|${source}|${intent}] ${fact.content} (置信度: ${fact.confidence})`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  private fromMarkdown(content: string): MemCell | null {
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

    const messages: Message[] = []
    const dialogMatch = content.match(/## 原始对话\n\n([\s\S]*?)(?=\n## |$)/)
    if (dialogMatch) {
      const msgRegex = /\*\*(User|Assistant)(?:\s*\(([^)]+)\))?\*\*:\s*(.+)/g
      let match: RegExpExecArray | null
      while ((match = msgRegex.exec(dialogMatch[1])) !== null) {
        messages.push({
          role: match[1].toLowerCase() as 'user' | 'assistant',
          content: match[3].trim(),
          timestamp: match[2] ? new Date(`1970-01-01T${match[2]}`) : undefined,
        })
      }
    }

    const facts: ExtractedFact[] = []
    const factsMatch = content.match(/## 提取的事实\n\n([\s\S]*?)(?=\n## |$)/)
    if (factsMatch) {
      for (const rawLine of factsMatch[1].split('\n')) {
        const line = rawLine.trim()
        if (!line) continue
        const fact = parseFactLine(line)
        if (fact) facts.push(fact)
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

  save(cell: MemCell): string {
    const dateStr = formatDate(cell.timestamp)
    const dir = join(CELLS_DIR, dateStr)
    ensureDir(dir)

    const filePath = join(dir, `${cell.id}.md`)
    const content = this.toMarkdown(cell)
    writeFileSync(filePath, content, 'utf-8')

    return filePath
  }

  load(id: string, date?: Date): MemCell | null {
    if (date) {
      const dateStr = formatDate(date)
      const filePath = join(CELLS_DIR, dateStr, `${id}.md`)
      if (existsSync(filePath)) {
        return this.fromMarkdown(readFileSync(filePath, 'utf-8'))
      }
      return null
    }

    if (!existsSync(CELLS_DIR)) return null
    for (const dateDir of readdirSync(CELLS_DIR)) {
      const filePath = join(CELLS_DIR, dateDir, `${id}.md`)
      if (existsSync(filePath)) {
        return this.fromMarkdown(readFileSync(filePath, 'utf-8'))
      }
    }
    return null
  }

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

export const memCellStorage = new MemCellStorage()
export { CELLS_DIR }

