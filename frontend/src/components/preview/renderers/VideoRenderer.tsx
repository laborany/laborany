/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       视频预览渲染器                                      ║
 * ║                                                                          ║
 * ║  设计哲学：简洁至上，使用原生 video 控件，大文件提示下载                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { RendererProps } from '../types'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           配置常量                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const MAX_SIZE = 50 * 1024 * 1024 // 50MB

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function VideoRenderer({ artifact }: RendererProps) {
  // 文件过大时显示下载提示
  if (artifact.size && artifact.size > MAX_SIZE) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-muted/20 p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-xl border border-border bg-background">
            <span className="text-4xl">🎬</span>
          </div>
          <h3 className="mb-2 text-lg font-medium text-foreground">{artifact.name}</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            文件较大 ({formatSize(artifact.size)})，建议下载后播放
          </p>
          <a
            href={artifact.url}
            download={artifact.name}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            下载视频
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-4xl">
        <video
          src={artifact.url}
          controls
          className="h-auto max-h-[70vh] w-full rounded-lg bg-black shadow-xl"
          preload="metadata"
        >
          您的浏览器不支持视频播放
        </video>
        <div className="mt-3 text-center text-sm text-muted-foreground">
          {artifact.name}
        </div>
      </div>
    </div>
  )
}
