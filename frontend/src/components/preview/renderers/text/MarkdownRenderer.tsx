/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       Markdown 预览渲染器                                 ║
 * ║                                                                          ║
 * ║  使用 react-markdown + remark-gfm 渲染 GitHub 风格 Markdown               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { RendererProps } from '../../types'

export function MarkdownRenderer({ artifact }: RendererProps) {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    if (artifact.content) {
      setContent(artifact.content)
      setLoading(false)
      return
    }

    fetch(artifact.url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.text()
      })
      .then(text => {
        if (!cancelled) {
          setContent(text)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [artifact.url, artifact.content])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-muted-foreground">加载中...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-destructive">加载失败: {error}</span>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-6">
      <article className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </article>
    </div>
  )
}
