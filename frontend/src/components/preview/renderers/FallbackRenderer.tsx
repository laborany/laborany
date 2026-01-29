/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         回退预览渲染器                                     ║
 * ║                                                                          ║
 * ║  当文件类型不支持预览时，显示下载提示                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { RendererProps } from '../types'
import { formatSize } from '../utils'

export function FallbackRenderer({ artifact }: RendererProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="mb-4 text-6xl">📄</div>
      <h3 className="mb-2 text-lg font-medium text-foreground">{artifact.name}</h3>
      {artifact.size && (
        <p className="mb-4 text-sm text-muted-foreground">{formatSize(artifact.size)}</p>
      )}
      <p className="mb-6 text-sm text-muted-foreground">此文件类型暂不支持预览</p>
      <a
        href={artifact.url}
        download={artifact.name}
        className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
      >
        下载文件
      </a>
    </div>
  )
}
