/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       Word 文档预览渲染器                                  ║
 * ║                                                                          ║
 * ║  设计哲学：用 jszip 解压 DOCX，直接解析 XML，轻量无依赖                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useEffect, useState } from 'react'
import JSZip from 'jszip'
import type { RendererProps } from '../../types'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └─────────────────────────────────────────────────────────��────────────────┘ */
interface DocxParagraph {
  text: string
  isHeading?: boolean
  headingLevel?: number
  isBold?: boolean
  isItalic?: boolean
}

export function DocxRenderer({ artifact }: RendererProps) {
  const [paragraphs, setParagraphs] = useState<DocxParagraph[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadDocx()
  }, [artifact.url])

  const loadDocx = async () => {
    try {
      const response = await fetch(artifact.url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = await response.arrayBuffer()

      const zip = await JSZip.loadAsync(buffer)
      const xml = await zip.file('word/document.xml')?.async('string')
      if (!xml) throw new Error('无效的 DOCX 文件')

      const parsed = parseDocxXml(xml)
      setParagraphs(parsed)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <LoadingState />
  if (error || paragraphs.length === 0) return <ErrorState name={artifact.name} error={error} url={artifact.url} />

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-3xl">
          {paragraphs.map((para, idx) => (
            <Paragraph key={idx} para={para} />
          ))}
        </div>
      </div>
      <div className="shrink-0 border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        {paragraphs.length} 段落
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           辅助函数                                        │
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

    const textElements = pEl.querySelectorAll('w\\:t, t')
    let text = ''
    textElements.forEach(t => { text += t.textContent || '' })

    const rPr = pEl.querySelector('w\\:rPr, rPr')
    const isBold = !!rPr?.querySelector('w\\:b, b')
    const isItalic = !!rPr?.querySelector('w\\:i, i')

    if (text.trim()) {
      parsed.push({ text, isHeading, headingLevel, isBold, isItalic })
    }
  })
  return parsed
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           子组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */

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
        <a href={url} download={name} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          下载文件
        </a>
      </div>
    </div>
  )
}

function Paragraph({ para }: { para: DocxParagraph }) {
  if (para.isHeading) {
    const level = para.headingLevel || 2
    const className = `font-bold text-foreground mb-4 ${
      level === 1 ? 'text-3xl mt-8' :
      level === 2 ? 'text-2xl mt-6' :
      level === 3 ? 'text-xl mt-4' : 'text-lg mt-4'
    }`
    const Tag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements
    return <Tag className={className}>{para.text}</Tag>
  }

  return (
    <p className={`mb-4 text-base leading-relaxed text-foreground/90 ${para.isBold ? 'font-semibold' : ''} ${para.isItalic ? 'italic' : ''}`}>
      {para.text}
    </p>
  )
}
