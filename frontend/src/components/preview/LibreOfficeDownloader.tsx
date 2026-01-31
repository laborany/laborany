/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    LibreOffice 下载提示组件                               ║
 * ║                                                                          ║
 * ║  当 LibreOffice 未安装时显示，提供一键下载功能                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect, useCallback } from 'react'
import { API_BASE } from '../../config'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

interface DownloadProgress {
  status: 'idle' | 'downloading' | 'extracting' | 'complete' | 'error'
  progress: number
  downloadedMB: number
  totalMB: number
  message: string
  error?: string
}

interface Props {
  onComplete?: () => void
  onSkip?: () => void
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function LibreOfficeDownloader({ onComplete, onSkip }: Props) {
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [polling, setPolling] = useState(false)

  /* 轮询下载进度 */
  useEffect(() => {
    if (!polling) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/libreoffice/progress`)
        const data = await res.json()
        setProgress(data)

        if (data.status === 'complete') {
          setPolling(false)
          onComplete?.()
        } else if (data.status === 'error') {
          setPolling(false)
        }
      } catch { /* ignore */ }
    }, 1000)

    return () => clearInterval(interval)
  }, [polling, onComplete])

  const startDownload = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/libreoffice/download`, { method: 'POST' })
      setPolling(true)
    } catch (err) {
      setProgress({
        status: 'error',
        progress: 0,
        downloadedMB: 0,
        totalMB: 0,
        message: '启动下载失败',
        error: String(err),
      })
    }
  }, [])

  /* 下载中状态 */
  if (progress && (progress.status === 'downloading' || progress.status === 'extracting')) {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <div className="text-4xl">📥</div>
        <h3 className="text-lg font-medium text-foreground">{progress.message}</h3>
        <div className="w-64">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {progress.downloadedMB} MB / {progress.totalMB} MB
          </p>
        </div>
      </div>
    )
  }

  /* 下载完成 */
  if (progress?.status === 'complete') {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <div className="text-4xl">✅</div>
        <h3 className="text-lg font-medium text-foreground">LibreOffice 安装完成</h3>
        <p className="text-sm text-muted-foreground">现在可以高质量预览 Office 文档了</p>
      </div>
    )
  }

  /* 下载失败 */
  if (progress?.status === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <div className="text-4xl">❌</div>
        <h3 className="text-lg font-medium text-foreground">下载失败</h3>
        <p className="text-sm text-muted-foreground">{progress.error}</p>
        <div className="flex gap-2">
          <button
            onClick={startDownload}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            重试
          </button>
          {onSkip && (
            <button
              onClick={onSkip}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground"
            >
              使用基础预览
            </button>
          )}
        </div>
      </div>
    )
  }

  /* 初始状态：提示下载 */
  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <div className="text-4xl">📦</div>
      <h3 className="text-lg font-medium text-foreground">需要 LibreOffice</h3>
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        为了高质量预览 PowerPoint 文档，需要下载 LibreOffice（约 300MB）。
        下载后将自动安装到本地。
      </p>
      <div className="flex gap-2">
        <button
          onClick={startDownload}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          下载 LibreOffice
        </button>
        {onSkip && (
          <button
            onClick={onSkip}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground"
          >
            使用基础预览
          </button>
        )}
      </div>
    </div>
  )
}
