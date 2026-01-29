/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         PDF 预览渲染器                                    ║
 * ║                                                                          ║
 * ║  使用浏览器原生 PDF 渲染能力，通过 iframe 嵌入                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { RendererProps } from '../types'

export function PdfRenderer({ artifact }: RendererProps) {
  return (
    <div className="h-full w-full">
      <iframe
        src={artifact.url}
        title={artifact.name}
        className="h-full w-full border-0"
      />
    </div>
  )
}
