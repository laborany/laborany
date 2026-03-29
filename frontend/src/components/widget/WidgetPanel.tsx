/**
 * WidgetPanel — Right-side panel that renders generative UI widgets
 *
 * Uses a persistent iframe shell and postMessage-based updates so streaming
 * widget deltas do not rebuild the entire iframe on every chunk.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { WidgetState } from '../../types/message'
import {
  buildIframeShellDoc,
  readHostWidgetTheme,
  isPlainObject,
  isSerializablePayload,
} from './iframe-shell'

interface WidgetPanelProps {
  widget: WidgetState
  onClose: () => void
  onWidgetInteraction?: (widgetId: string, data: unknown) => void
  onFallbackToText?: () => void
}

export function WidgetPanel({ widget, onClose, onWidgetInteraction, onFallbackToText }: WidgetPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const lastInteractionRef = useRef(0)
  const frameLoadedRef = useRef(false)

  const shellDoc = useMemo(() => buildIframeShellDoc(widget.widgetId), [widget.widgetId])

  const postToFrame = useCallback((payload: Record<string, unknown>) => {
    const target = iframeRef.current?.contentWindow
    if (!frameLoadedRef.current || !target) return false
    target.postMessage({
      source: 'laborany-host',
      widgetId: widget.widgetId,
      ...payload,
    }, '*')
    return true
  }, [widget.widgetId])

  const syncTheme = useCallback(() => {
    return postToFrame({
      type: 'widget-theme',
      theme: readHostWidgetTheme(),
    })
  }, [postToFrame])

  const syncRender = useCallback(() => {
    if (!widget.html) return false
    return postToFrame({
      type: 'widget-render',
      html: widget.html,
      runScripts: widget.status === 'ready',
    })
  }, [postToFrame, widget.html, widget.status])

  useEffect(() => {
    frameLoadedRef.current = false
  }, [widget.widgetId])

  useEffect(() => {
    if (!frameLoadedRef.current) return
    syncRender()
  }, [syncRender])

  useEffect(() => {
    if (typeof document === 'undefined') return

    const root = document.documentElement
    const body = document.body
    const observer = new MutationObserver(() => {
      syncTheme()
    })

    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    })

    if (body) {
      observer.observe(body, {
        attributes: true,
        attributeFilter: ['class', 'style'],
      })
    }

    return () => observer.disconnect()
  }, [syncTheme])

  const handleIframeLoad = useCallback(() => {
    frameLoadedRef.current = true
    syncTheme()
    syncRender()
  }, [syncRender, syncTheme])

  const handleMessage = useCallback((event: MessageEvent) => {
    const iframeWindow = iframeRef.current?.contentWindow
    const data = event.data
    if (!iframeWindow || event.source !== iframeWindow) return
    if (!isPlainObject(data)) return

    // External link — open in system browser (checked before origin gate)
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

    if (event.origin !== 'null') return
    if (data.type !== 'widget_interaction' || data.source !== 'laborany-widget' || data.widgetId !== widget.widgetId) {
      return
    }
    if (!isSerializablePayload(data.payload)) return
    try {
      if (JSON.stringify(data.payload).length > 64_000) {
        console.warn('[WidgetPanel] Ignoring oversized postMessage payload')
        return
      }
    } catch {
      return
    }
    const now = Date.now()
    if (now - lastInteractionRef.current < 200) return
    lastInteractionRef.current = now
    onWidgetInteraction?.(widget.widgetId, data.payload)
  }, [onWidgetInteraction, widget.widgetId])

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  return (
    <div className="flex h-full flex-col border-l border-border bg-card">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-foreground">
              {widget.title}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {widget.status === 'ready'
                ? '交互式组件'
                : widget.status === 'error'
                  ? '渲染失败'
                  : '流式渲染中'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close widget panel"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {widget.status === 'loading' && !widget.html && (
          <div className="flex h-full items-center justify-center">
            <div className="space-y-3 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">正在生成组件...</p>
            </div>
          </div>
        )}

        {widget.status === 'error' && (
          <div className="flex h-full items-center justify-center p-4">
            <div className="space-y-3 text-center">
              <svg className="mx-auto h-8 w-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-destructive">{widget.errorMessage || 'Widget failed to render'}</p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
                >
                  关闭
                </button>
                {onFallbackToText && (
                  <button
                    type="button"
                    onClick={onFallbackToText}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    改为文本解释
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {(widget.status === 'ready' || Boolean(widget.html)) && (
          <>
            <iframe
              ref={iframeRef}
              className="h-full w-full border-0 bg-transparent"
              sandbox="allow-scripts"
              title={widget.title}
              srcDoc={shellDoc}
              onLoad={handleIframeLoad}
            />
            {widget.status === 'loading' && widget.html && (
              <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full border border-primary/20 bg-background/90 px-3 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  实时更新中
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
