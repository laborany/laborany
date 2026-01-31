/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       Word 文档预览渲染器                                  ║
 * ║                                                                          ║
 * ║  设计哲学：用 jszip 解压 DOCX，直接解析 XML，轻量无依赖                      ║
 * ║  增强功能：支持修订追踪（Track Changes）和批注显示                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useEffect, useState, useMemo, useCallback } from 'react'
import JSZip from 'jszip'
import type { RendererProps } from '../../types'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

interface TrackedChange {
  type: 'insert' | 'delete'
  text: string
  author?: string
  date?: string
}

interface TextRun {
  text: string
  isBold?: boolean
  isItalic?: boolean
  change?: TrackedChange
}

interface DocxParagraph {
  runs: TextRun[]
  isHeading?: boolean
  headingLevel?: number
}

interface Comment {
  id: string
  author: string
  date: string
  text: string
}

interface DocxData {
  paragraphs: DocxParagraph[]
  comments: Map<string, Comment>
  hasChanges: boolean
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function DocxRenderer({ artifact }: RendererProps) {
  const [data, setData] = useState<DocxData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showChanges, setShowChanges] = useState(true)

  const loadDocx = useCallback(async () => {
    try {
      const response = await fetch(artifact.url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = await response.arrayBuffer()

      const zip = await JSZip.loadAsync(buffer)
      const xml = await zip.file('word/document.xml')?.async('string')
      if (!xml) throw new Error('无效的 DOCX 文件')

      // 解析批注（如果存在）
      const commentsXml = await zip.file('word/comments.xml')?.async('string')
      const comments = commentsXml ? parseComments(commentsXml) : new Map()

      const paragraphs = parseDocxXml(xml)
      const hasChanges = paragraphs.some(p => p.runs.some(r => r.change))

      setData({ paragraphs, comments, hasChanges })
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [artifact.url])

  useEffect(() => {
    loadDocx()
  }, [loadDocx])

  // 统计修改数量
  const changeStats = useMemo(() => {
    if (!data) return { insertions: 0, deletions: 0 }
    let insertions = 0, deletions = 0
    data.paragraphs.forEach(p => {
      p.runs.forEach(r => {
        if (r.change?.type === 'insert') insertions++
        if (r.change?.type === 'delete') deletions++
      })
    })
    return { insertions, deletions }
  }, [data])

  if (loading) return <LoadingState />
  if (error || !data || data.paragraphs.length === 0) {
    return <ErrorState name={artifact.name} error={error} url={artifact.url} />
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* 工具栏 */}
      {data.hasChanges && (
        <Toolbar
          showChanges={showChanges}
          onToggle={() => setShowChanges(!showChanges)}
          stats={changeStats}
        />
      )}

      {/* 文档内容 */}
      <div className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-3xl">
          {data.paragraphs.map((para, idx) => (
            <Paragraph key={idx} para={para} showChanges={showChanges} />
          ))}
        </div>
      </div>

      {/* 状态栏 */}
      <StatusBar paragraphCount={data.paragraphs.length} stats={changeStats} />
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           XML 解析函数                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function parseDocxXml(xml: string): DocxParagraph[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  const pElements = doc.querySelectorAll('w\\:p, p')
  const parsed: DocxParagraph[] = []

  pElements.forEach(pEl => {
    const pStyle = pEl.querySelector('w\\:pStyle, pStyle')
    const styleName = pStyle?.getAttribute('w:val') || ''
    const isHeading = /heading|title|h\d/i.test(styleName)
    const levelMatch = styleName.match(/(\d)/)
    const headingLevel = levelMatch ? parseInt(levelMatch[1]) : undefined

    const runs = parseRuns(pEl)
    if (runs.length > 0 && runs.some(r => r.text.trim())) {
      parsed.push({ runs, isHeading, headingLevel })
    }
  })
  return parsed
}

function parseRuns(pEl: Element): TextRun[] {
  const runs: TextRun[] = []
  const children = pEl.childNodes

  children.forEach(child => {
    if (child.nodeType !== Node.ELEMENT_NODE) return
    const el = child as Element
    const tagName = el.tagName.toLowerCase()

    // 处理插入标记 <w:ins>
    if (tagName === 'w:ins' || tagName === 'ins') {
      const author = el.getAttribute('w:author') || undefined
      const date = el.getAttribute('w:date') || undefined
      el.querySelectorAll('w\\:r, r').forEach(rEl => {
        const run = parseRunElement(rEl)
        if (run.text) {
          run.change = { type: 'insert', text: run.text, author, date }
          runs.push(run)
        }
      })
      return
    }

    // 处理删除标记 <w:del>
    if (tagName === 'w:del' || tagName === 'del') {
      const author = el.getAttribute('w:author') || undefined
      const date = el.getAttribute('w:date') || undefined
      el.querySelectorAll('w\\:r, r').forEach(rEl => {
        const delText = rEl.querySelector('w\\:delText, delText')?.textContent || ''
        if (delText) {
          runs.push({
            text: delText,
            change: { type: 'delete', text: delText, author, date }
          })
        }
      })
      return
    }

    // 处理普通 run <w:r>
    if (tagName === 'w:r' || tagName === 'r') {
      const run = parseRunElement(el)
      if (run.text) runs.push(run)
    }
  })

  return runs
}

function parseRunElement(rEl: Element): TextRun {
  const textEl = rEl.querySelector('w\\:t, t')
  const text = textEl?.textContent || ''

  const rPr = rEl.querySelector('w\\:rPr, rPr')
  const isBold = !!rPr?.querySelector('w\\:b, b')
  const isItalic = !!rPr?.querySelector('w\\:i, i')

  return { text, isBold, isItalic }
}

function parseComments(xml: string): Map<string, Comment> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  const comments = new Map<string, Comment>()

  doc.querySelectorAll('w\\:comment, comment').forEach(el => {
    const id = el.getAttribute('w:id') || ''
    const author = el.getAttribute('w:author') || ''
    const date = el.getAttribute('w:date') || ''
    const text = el.textContent || ''
    if (id) comments.set(id, { id, author, date, text })
  })

  return comments
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           子组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function Toolbar({
  showChanges,
  onToggle,
  stats
}: {
  showChanges: boolean
  onToggle: () => void
  stats: { insertions: number; deletions: number }
}) {
  return (
    <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-2 flex items-center gap-4">
      <button
        onClick={onToggle}
        className={`px-3 py-1 text-sm rounded-md transition-colors ${
          showChanges
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground hover:bg-muted/80'
        }`}
      >
        {showChanges ? '隐藏修订' : '显示修订'}
      </button>
      {showChanges && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-green-500/20 border border-green-500" />
            插入: {stats.insertions}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-red-500/20 border border-red-500" />
            删除: {stats.deletions}
          </span>
        </div>
      )}
    </div>
  )
}

function StatusBar({
  paragraphCount,
  stats
}: {
  paragraphCount: number
  stats: { insertions: number; deletions: number }
}) {
  const total = stats.insertions + stats.deletions
  return (
    <div className="shrink-0 border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground flex justify-between">
      <span>{paragraphCount} 段落</span>
      {total > 0 && <span>{total} 处修订</span>}
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex h-full items-center justify-center bg-muted/20 p-8">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">加载文档...</p>
      </div>
    </div>
  )
}

function ErrorState({ name, error, url }: { name: string; error: string | null; url: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-muted/20 p-8">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-xl border border-border bg-background">
          <span className="text-4xl">📄</span>
        </div>
        <h3 className="mb-2 text-lg font-medium text-foreground">{name}</h3>
        <p className="mb-4 text-sm text-muted-foreground">{error || '无内容'}</p>
        <a
          href={url}
          download={name}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          下载文件
        </a>
      </div>
    </div>
  )
}

function Paragraph({ para, showChanges }: { para: DocxParagraph; showChanges: boolean }) {
  // 过滤掉不显示的删除内容
  const visibleRuns = showChanges
    ? para.runs
    : para.runs.filter(r => r.change?.type !== 'delete')

  if (para.isHeading) {
    const level = para.headingLevel || 2
    const className = `font-bold text-foreground mb-4 ${
      level === 1 ? 'text-3xl mt-8' :
      level === 2 ? 'text-2xl mt-6' :
      level === 3 ? 'text-xl mt-4' : 'text-lg mt-4'
    }`
    const Tag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements
    return (
      <Tag className={className}>
        {visibleRuns.map((run, idx) => (
          <TextSpan key={idx} run={run} showChanges={showChanges} />
        ))}
      </Tag>
    )
  }

  return (
    <p className="mb-4 text-base leading-relaxed text-foreground/90">
      {visibleRuns.map((run, idx) => (
        <TextSpan key={idx} run={run} showChanges={showChanges} />
      ))}
    </p>
  )
}

function TextSpan({ run, showChanges }: { run: TextRun; showChanges: boolean }) {
  let className = ''
  if (run.isBold) className += 'font-semibold '
  if (run.isItalic) className += 'italic '

  // 修订样式
  if (showChanges && run.change) {
    if (run.change.type === 'insert') {
      className += 'bg-green-500/20 text-green-700 dark:text-green-400 underline decoration-green-500 '
    } else if (run.change.type === 'delete') {
      className += 'bg-red-500/20 text-red-700 dark:text-red-400 line-through decoration-red-500 '
    }
  }

  // 不显示修订时，插入的内容正常显示
  if (!showChanges && run.change?.type === 'insert') {
    className = run.isBold ? 'font-semibold ' : ''
    if (run.isItalic) className += 'italic '
  }

  const title = run.change
    ? `${run.change.type === 'insert' ? '插入' : '删除'}${run.change.author ? ` by ${run.change.author}` : ''}${run.change.date ? ` (${new Date(run.change.date).toLocaleDateString()})` : ''}`
    : undefined

  return (
    <span className={className.trim()} title={title}>
      {run.text}
    </span>
  )
}
