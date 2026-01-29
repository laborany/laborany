/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         图片预览渲染器                                     ║
 * ║                                                                          ║
 * ║  简洁至上：一个 img 标签，居中显示，自适应容器                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { RendererProps } from '../types'

export function ImageRenderer({ artifact }: RendererProps) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted/20 p-4">
      <img
        src={artifact.url}
        alt={artifact.name}
        className="max-h-full max-w-full rounded-lg object-contain shadow-sm"
      />
    </div>
  )
}
