/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         代码预览渲染器                                     ║
 * ║                                                                          ║
 * ║  使用 react-syntax-highlighter 实现语法高亮                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

import type { RendererProps } from '../../types'
import { getLang } from '../../utils'

export function CodeRenderer({ artifact }: RendererProps) {
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

  const lang = getLang(artifact.ext)

  return (
    <div className="h-full overflow-auto">
      <SyntaxHighlighter
        language={lang}
        style={oneDark}
        showLineNumbers
        customStyle={{
          margin: 0,
          padding: '1rem',
          fontSize: '13px',
          lineHeight: '1.5',
          minHeight: '100%',
        }}
      >
        {content}
      </SyntaxHighlighter>
    </div>
  )
}
