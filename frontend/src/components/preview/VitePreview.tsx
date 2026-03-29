/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       VitePreview 组件                                    ║
 * ║                                                                          ║
 * ║  Live Preview UI：显示 Vite 开发服务器的 iframe 预览                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState } from 'react'
import type { PreviewStatus } from '../../hooks/useVitePreview'
import { openUrlExternal } from '../../lib/system-open'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Props 定义                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface VitePreviewProps {
  status: PreviewStatus
  previewUrl: string | null
  error: string | null
  onStart: () => void
  onStop: () => void
}

export function VitePreview({ status, previewUrl, error, onStart, onStop }: VitePreviewProps) {
  const [iframeKey, setIframeKey] = useState(0)

  const handleRefresh = () => setIframeKey(k => k + 1)
  const handleOpenExternal = async () => {
    if (!previewUrl) return
    try {
      await openUrlExternal(previewUrl)
    } catch (openError) {
      console.error('[VitePreview] Failed to open preview externally:', openError)
      window.open(previewUrl, '_blank', 'noopener,noreferrer')
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 空闲状态：显示启动按钮
   * ──────────────────────────────────────────────────────────────────────── */
  if (status === 'idle' || status === 'stopped') {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-muted/20 p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <span className="text-2xl">🚀</span>
          </div>
          <h3 className="mb-2 text-lg font-medium text-foreground">Live Preview</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            启动 Vite 开发服务器，支持 HMR 热更新
          </p>
          <button
            onClick={onStart}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            启动预览
          </button>
        </div>
      </div>
    )
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 启动中：显示加载动画
   * ──────────────────────────────────────────────────────────────────────── */
  if (status === 'starting') {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-muted/20 p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <h3 className="mb-2 text-lg font-medium text-foreground">正在启动...</h3>
          <p className="text-sm text-muted-foreground">
            首次启动需要安装依赖，请耐心等待
          </p>
        </div>
      </div>
    )
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 错误状态：显示错误信息和重试按钮
   * ──────────────────────────────────────────────────────────────────────── */
  if (status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-muted/20 p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <span className="text-2xl">❌</span>
          </div>
          <h3 className="mb-2 text-lg font-medium text-foreground">启动失败</h3>
          <p className="mb-4 max-w-md text-sm text-muted-foreground">{error}</p>
          <button
            onClick={onStart}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 运行中：显示 iframe 和工具栏
   * ──────────────────────────────────────────────────────────────────────── */
  return (
    <div className="flex h-full flex-col">
      {/* 工具栏 */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span>Live Preview</span>
          {previewUrl && (
            <span className="text-xs opacity-60">{previewUrl}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="刷新"
          >
            🔄
          </button>
          <button
            type="button"
            onClick={handleOpenExternal}
            disabled={!previewUrl}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="用系统浏览器打开"
          >
            🔗
          </button>
          <button
            onClick={onStop}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="停止"
          >
            ⏹️
          </button>
        </div>
      </div>

      {/* iframe */}
      <div className="flex-1 overflow-hidden">
        {previewUrl && (
          <iframe
            key={iframeKey}
            src={previewUrl}
            className="h-full w-full border-0"
            title="Live Preview"
          />
        )}
      </div>
    </div>
  )
}
