/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       Word 文档预览渲染器                                  ║
 * ║                                                                          ║
 * ║  设计哲学：                                                               ║
 * ║  1. 使用 mammoth.js 将 DOCX 转换为 HTML                                   ║
 * ║  2. 支持图片、表格、列表、样式等完整功能                                    ║
 * ║  3. 保留修订追踪（Track Changes）显示能力                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useEffect, useState, useCallback } from 'react'
import mammoth from 'mammoth'
import type { RendererProps } from '../../types'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

interface DocxResult {
  html: string
  messages: mammoth.Message[]
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function DocxRenderer({ artifact }: RendererProps) {
  const [result, setResult] = useState<DocxResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDocx = useCallback(async () => {
    try {
      const response = await fetch(artifact.url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = await response.arrayBuffer()

      /* ┌────────────────────────────────────────────────────────────────────┐
       * │  使用 mammoth.js 转换 DOCX 为 HTML                                  │
       * │  支持：图片（内嵌 base64）、表格、列表、样式                          │
       * └────────────────────────────────────────────────────────────────────┘ */
      const mammothResult = await mammoth.convertToHtml(
        { arrayBuffer: buffer },
        {
          /* 样式映射：将 Word 样式映射为 HTML 元素 */
          styleMap: [
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
            "p[style-name='Heading 4'] => h4:fresh",
            "p[style-name='Title'] => h1.doc-title:fresh",
            "p[style-name='Subtitle'] => p.doc-subtitle:fresh",
            "p[style-name='Quote'] => blockquote:fresh",
            "r[style-name='Strong'] => strong",
            "r[style-name='Emphasis'] => em",
          ],
          /* 图片转换：内嵌为 base64 */
          convertImage: mammoth.images.imgElement(async (image) => {
            const imageBuffer = await image.read('base64')
            return {
              src: `data:${image.contentType};base64,${imageBuffer}`,
            }
          }),
        }
      )

      setResult({
        html: mammothResult.value,
        messages: mammothResult.messages,
      })
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

  if (loading) return <LoadingState />
  if (error || !result) {
    return <ErrorState name={artifact.name} error={error} url={artifact.url} />
  }

  /* 统计警告信息 */
  const warnings = result.messages.filter((m) => m.type === 'warning')

  return (
    <div className="flex h-full flex-col bg-background">
      {/* 警告提示（如果有） */}
      {warnings.length > 0 && <WarningBar count={warnings.length} />}

      {/* 文档内容 */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl p-8">
          <article
            className="docx-content prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: result.html }}
          />
        </div>
      </div>

      {/* 状态栏 */}
      <StatusBar name={artifact.name} />
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           子组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function WarningBar({ count }: { count: number }) {
  return (
    <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2">
      <p className="text-xs text-amber-600 dark:text-amber-400">
        ⚠️ 文档转换时有 {count} 个警告，部分内容可能显示不完整
      </p>
    </div>
  )
}

function StatusBar({ name }: { name: string }) {
  return (
    <div className="shrink-0 border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground flex justify-between">
      <span>{name}</span>
      <span>由 mammoth.js 渲染</span>
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
        <p className="mb-4 text-sm text-muted-foreground">{error || '无法加载文档'}</p>
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
