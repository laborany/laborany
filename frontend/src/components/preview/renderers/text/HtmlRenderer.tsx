/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         HTML 预览渲染器                                   ║
 * ║                                                                          ║
 * ║  设计哲学：                                                               ║
 * ║  1. 自动内联 CSS/JS 资源，实现 Static Preview                             ║
 * ║  2. 使用 iframe 沙箱隔离，安全地渲染 HTML 内容                              ║
 * ║  3. 支持相对路径资源的自动解析                                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import type { RendererProps } from '../../types'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       资源内联逻辑                                        │
 * │                                                                          │
 * │  好品味：将外部 CSS/JS 引用替换为内联代码，消除跨域问题                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function inlineAssets(html: string, baseUrl: string): Promise<string> {
  let result = html

  /* ── 提取基础路径 ── */
  const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1)

  /* ── 内联 CSS 文件 ── */
  const cssRegex = /<link[^>]*href=["']([^"']+\.css)["'][^>]*>/gi
  const cssMatches = [...html.matchAll(cssRegex)]

  for (const match of cssMatches) {
    const [fullMatch, filename] = match
    if (filename.startsWith('http') || filename.startsWith('//')) continue

    try {
      const cssUrl = filename.startsWith('/') ? filename : basePath + filename
      const res = await fetch(cssUrl)
      if (res.ok) {
        const cssContent = await res.text()
        result = result.replace(
          fullMatch,
          `<style>/* Inlined from ${filename} */\n${cssContent}</style>`
        )
      }
    } catch {
      /* 静默失败，保留原始引用 */
    }
  }

  /* ── 内联 JS 文件 ── */
  const jsRegex = /<script[^>]*src=["']([^"']+\.js)["'][^>]*><\/script>/gi
  const jsMatches = [...html.matchAll(jsRegex)]

  for (const match of jsMatches) {
    const [fullMatch, filename] = match
    if (filename.startsWith('http') || filename.startsWith('//')) continue

    try {
      const jsUrl = filename.startsWith('/') ? filename : basePath + filename
      const res = await fetch(jsUrl)
      if (res.ok) {
        const jsContent = await res.text()
        result = result.replace(
          fullMatch,
          `<script>/* Inlined from ${filename} */\n${jsContent}</script>`
        )
      }
    } catch {
      /* 静默失败，保留原始引用 */
    }
  }

  return result
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       HTML 渲染器组件                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function HtmlRenderer({ artifact }: RendererProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* ── 加载并内联资源 ── */
  useEffect(() => {
    let cancelled = false

    async function loadAndInline() {
      setIsLoading(true)
      setError(null)

      try {
        /* 获取 HTML 内容 */
        const res = await fetch(artifact.url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const html = await res.text()

        /* 内联 CSS/JS 资源 */
        const inlinedHtml = await inlineAssets(html, artifact.url)

        if (cancelled) return

        /* 创建 Blob URL */
        const blob = new Blob([inlinedHtml], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        setBlobUrl(url)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载失败')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadAndInline()

    return () => {
      cancelled = true
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [artifact.url])

  /* ── 清理 Blob URL ── */
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [blobUrl])

  /* ── 加载中状态 ── */
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/20">
        <div className="text-center">
          <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">正在加载预览...</p>
        </div>
      </div>
    )
  }

  /* ── 错误状态 ── */
  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/20">
        <div className="text-center">
          <p className="mb-2 text-sm text-destructive">加载失败: {error}</p>
          <p className="text-xs text-muted-foreground">请尝试使用 Live Preview</p>
        </div>
      </div>
    )
  }

  /* ── 正常渲染 ── */
  return (
    <div className="h-full w-full bg-white">
      <iframe
        src={blobUrl || artifact.url}
        title={artifact.name}
        className="h-full w-full border-0"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  )
}
