/**
 * InlineWidget — Renders a widget inline within the conversation message flow.
 *
 * Reuses the shared iframe shell from iframe-shell.ts with height reporting
 * so the iframe grows to match its content naturally within the chat.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildIframeShellDoc,
  readHostWidgetTheme,
  isPlainObject,
  isSerializablePayload,
} from './iframe-shell'

interface InlineWidgetProps {
  widgetId: string
  title: string
  html: string
  status: 'loading' | 'ready' | 'error'
  errorMessage?: string
  onExpand?: (widgetId: string) => void
  onInteraction?: (widgetId: string, data: unknown) => void
  onFallbackToText?: () => void
}

export function InlineWidget({
  widgetId,
  title,
  html,
  status,
  errorMessage,
  onExpand,
  onInteraction,
  onFallbackToText,
}: InlineWidgetProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const frameLoadedRef = useRef(false)
  const lastInteractionRef = useRef(0)
  const [iframeHeight, setIframeHeight] = useState(80)

  const shellDoc = useMemo(
    () => buildIframeShellDoc(widgetId, { reportHeight: true }),
    [widgetId],
  )

  const postToFrame = useCallback((payload: Record<string, unknown>) => {
    const target = iframeRef.current?.contentWindow
    if (!frameLoadedRef.current || !target) return false
    target.postMessage({
      source: 'laborany-host',
      widgetId,
      ...payload,
    }, '*')
    return true
  }, [widgetId])

  const syncTheme = useCallback(() => {
    return postToFrame({
      type: 'widget-theme',
      theme: readHostWidgetTheme(),
    })
  }, [postToFrame])

  const syncRender = useCallback(() => {
    if (!html) return false
    return postToFrame({
      type: 'widget-render',
      html,
      runScripts: status === 'ready',
    })
  }, [postToFrame, html, status])

  // Reset frame loaded state when widget changes
  useEffect(() => {
    frameLoadedRef.current = false
    setIframeHeight(80)
  }, [widgetId])

  // Sync render when html/status changes
  useEffect(() => {
    if (!frameLoadedRef.current) return
    syncRender()
  }, [syncRender])

  // Observe host theme changes
  useEffect(() => {
    if (typeof document === 'undefined') return

    const root = document.documentElement
    const body = document.body
    const observer = new MutationObserver(() => { syncTheme() })

    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style'] })
    if (body) {
      observer.observe(body, { attributes: true, attributeFilter: ['class', 'style'] })
    }

    return () => observer.disconnect()
  }, [syncTheme])

  const handleIframeLoad = useCallback(() => {
    frameLoadedRef.current = true
    syncTheme()
    syncRender()
  }, [syncRender, syncTheme])

  // Listen for resize and interaction messages from iframe
  const handleMessage = useCallback((event: MessageEvent) => {
    const iframeWindow = iframeRef.current?.contentWindow
    const data = event.data
    if (!iframeWindow || event.source !== iframeWindow) return
    if (!isPlainObject(data)) return

    // External link — open in system browser
    if (
      data.type === 'external-link'
      && data.source === 'laborany-widget'
      && typeof data.url === 'string'
    ) {
      const url = data.url as string
      if (url.startsWith('http:') || url.startsWith('https:')) {
        window.open(url, '_blank')
      }
      return
    }

    // Height resize
    if (
      data.type === 'widget-resize'
      && data.source === 'laborany-widget'
      && data.widgetId === widgetId
      && typeof data.height === 'number'
    ) {
      const h = Math.max(40, data.height as number)
      setIframeHeight(h)
      return
    }

    // Widget interaction
    if (
      data.type === 'widget_interaction'
      && data.source === 'laborany-widget'
      && data.widgetId === widgetId
    ) {
      if (event.origin !== 'null') return
      if (!isSerializablePayload(data.payload)) return
      try {
        if (JSON.stringify(data.payload).length > 64_000) return
      } catch { return }
      const now = Date.now()
      if (now - lastInteractionRef.current < 200) return
      lastInteractionRef.current = now
      onInteraction?.(widgetId, data.payload)
    }
  }, [widgetId, onInteraction])

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  // Loading skeleton (no html yet)
  if (status === 'loading' && !html) {
    return (
      <div className="animate-in slide-in-from-bottom-1 fade-in duration-200 rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
          <span className="text-xs font-medium text-muted-foreground truncate">{title}</span>
        </div>
        <div className="flex items-center justify-center py-6">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-xs text-muted-foreground">正在生成组件...</span>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="animate-in slide-in-from-bottom-1 fade-in duration-200 rounded-lg border border-destructive/30 bg-destructive/5 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-destructive/20">
          <span className="text-xs font-medium text-destructive truncate">{title}</span>
        </div>
        <div className="space-y-3 px-3 py-4">
          <div className="flex items-center justify-center gap-2">
            <svg className="h-5 w-5 text-destructive shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs text-destructive">{errorMessage || '组件渲染失败'}</span>
          </div>
          {onFallbackToText && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={onFallbackToText}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground transition-colors hover:bg-primary/90"
              >
                改为文本解释
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Streaming or ready — render iframe
  return (
    <div className="animate-in slide-in-from-bottom-1 fade-in duration-200 rounded-lg border border-border bg-card overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          {status === 'loading' && html && (
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
          )}
          <span className="text-xs font-medium text-muted-foreground truncate">{title}</span>
        </div>
        {onExpand && status === 'ready' && (
          <button
            type="button"
            onClick={() => onExpand(widgetId)}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50"
            aria-label="展开到面板"
            title="展开"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        )}
      </div>

      {/* iframe */}
      <iframe
        ref={iframeRef}
        className="w-full border-0 bg-transparent"
        style={{ height: iframeHeight }}
        sandbox="allow-scripts"
        title={title}
        srcDoc={shellDoc}
        onLoad={handleIframeLoad}
      />
    </div>
  )
}
