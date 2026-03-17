/**
 * WidgetPanel — Right-side panel that renders generative UI widgets
 *
 * Displays the active widget in a sandboxed iframe.
 * Shows skeleton loading state while widget is being generated.
 */

import { useCallback, useEffect, useRef } from 'react'
import type { WidgetState } from '../../types/message'

interface WidgetPanelProps {
  widget: WidgetState
  onClose: () => void
  onWidgetInteraction?: (widgetId: string, data: unknown) => void
  onFallbackToText?: () => void
}

/** CSS variables injected into the iframe to match the host theme */
const THEME_CSS = `
:root {
  --color-bg: #ffffff;
  --color-surface: #f8f9fa;
  --color-text: #1a1a2e;
  --color-text-muted: #6b7280;
  --color-accent: #7c3aed;
  --color-border: #e5e7eb;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
}
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #1a1a2e;
    --color-surface: #252540;
    --color-text: #e5e7eb;
    --color-text-muted: #9ca3af;
    --color-accent: #a78bfa;
    --color-border: #374151;
    --color-success: #34d399;
    --color-warning: #fbbf24;
    --color-danger: #f87171;
  }
}
body {
  margin: 0;
  padding: 16px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: system-ui, -apple-system, sans-serif;
}
`

const IFRAME_CSP = [
  "default-src 'none'",
  "img-src data: blob: https:",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
].join('; ')

function stripScripts(html: string): string {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, '')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function isSerializablePayload(value: unknown, depth = 0): boolean {
  if (depth > 8) return false
  if (value == null) return true
  const valueType = typeof value
  if (valueType === 'string' || valueType === 'boolean') return true
  if (valueType === 'number') return Number.isFinite(value as number)
  if (Array.isArray(value)) {
    return value.length <= 200 && value.every((item) => isSerializablePayload(item, depth + 1))
  }
  if (!isPlainObject(value)) return false
  const entries = Object.entries(value)
  if (entries.length > 200) return false
  return entries.every(([key, item]) => key.length <= 200 && isSerializablePayload(item, depth + 1))
}

function buildIframeDoc(widgetId: string, html: string, includeScripts: boolean): string {
  const bodyHtml = includeScripts ? html : stripScripts(html)
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${IFRAME_CSP}">
<style>${THEME_CSS}</style>
<script>
(function() {
  var isSandboxStorageError = function(value) {
    var message = String(value || '');
    return /Failed to read the '(?:localStorage|sessionStorage)' property from 'Window'/i.test(message)
      || /document is sandboxed and lacks the 'allow-same-origin' flag/i.test(message);
  };
  var createMemoryStorage = function() {
    var store = Object.create(null);
    return {
      get length() {
        return Object.keys(store).length;
      },
      clear: function() {
        store = Object.create(null);
      },
      getItem: function(key) {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      key: function(index) {
        var keys = Object.keys(store);
        return typeof index === 'number' && index >= 0 && index < keys.length ? keys[index] : null;
      },
      removeItem: function(key) {
        delete store[key];
      },
      setItem: function(key, value) {
        store[String(key)] = String(value);
      }
    };
  };
  try {
    var memoryLocalStorage = createMemoryStorage();
    var memorySessionStorage = createMemoryStorage();
    window.__laboranyLocalStorage = memoryLocalStorage;
    window.__laboranySessionStorage = memorySessionStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      enumerable: false,
      value: memoryLocalStorage
    });
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      enumerable: false,
      value: memorySessionStorage
    });
  } catch (error) {
    // Ignore shim install failures and let the sandbox defaults apply.
  }
  window.addEventListener('error', function(event) {
    var message = event && (event.message || (event.error && event.error.message));
    if (!isSandboxStorageError(message)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  window.addEventListener('unhandledrejection', function(event) {
    var reason = event && event.reason;
    var message = reason && (reason.message || String(reason));
    if (!isSandboxStorageError(message)) return;
    event.preventDefault();
  }, true);
  var userActivated = false;
  var markActivated = function(event) {
    if (!event || event.isTrusted !== true) return;
    userActivated = true;
  };
  ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'input', 'change', 'click'].forEach(function(type) {
    document.addEventListener(type, markActivated, true);
  });
  window.sendToAgent = function(data) {
    if (!userActivated) return;
    window.parent.postMessage(
      {
        type: 'widget_interaction',
        source: 'laborany-widget',
        widgetId: ${JSON.stringify(widgetId)},
        payload: data
      },
      '*'
    );
  };
})();
</script>
</head><body>
${bodyHtml}
</body></html>`
}

export function WidgetPanel({ widget, onClose, onWidgetInteraction, onFallbackToText }: WidgetPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const lastInteractionRef = useRef(0)

  useEffect(() => {
    if (!widget.html || !iframeRef.current) return
    const doc = buildIframeDoc(widget.widgetId, widget.html, widget.status === 'ready')
    const blob = new Blob([doc], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    iframeRef.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [widget.html, widget.status, widget.widgetId])

  const handleMessage = useCallback((event: MessageEvent) => {
    const iframeWindow = iframeRef.current?.contentWindow
    const data = event.data
    if (!iframeWindow || event.source !== iframeWindow) return
    if (event.origin !== 'null') return
    if (!isPlainObject(data)) return
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
    <div className="flex flex-col h-full border-l border-border bg-card">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-medium text-foreground truncate">
          {widget.title}
        </h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
          aria-label="Close widget panel"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {widget.status === 'loading' && !widget.html && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground">Generating widget...</p>
            </div>
          </div>
        )}

        {widget.status === 'error' && (
          <div className="flex items-center justify-center h-full p-4">
            <div className="text-center space-y-3">
              <svg className="w-8 h-8 text-destructive mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-destructive">{widget.errorMessage || 'Widget failed to render'}</p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-md text-sm border border-border text-muted-foreground hover:bg-accent transition-colors"
                >
                  关闭
                </button>
                {onFallbackToText && (
                  <button
                    type="button"
                    onClick={onFallbackToText}
                    className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    改为文本解释
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {(widget.status === 'ready' || Boolean(widget.html)) && (
          <iframe
            ref={iframeRef}
            className="w-full h-full border-0"
            sandbox="allow-scripts"
            title={widget.title}
          />
        )}
      </div>
    </div>
  )
}
