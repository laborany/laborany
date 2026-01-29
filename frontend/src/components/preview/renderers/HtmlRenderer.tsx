/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         HTML 预览渲染器                                   ║
 * ║                                                                          ║
 * ║  使用 iframe 沙箱隔离，安全地渲染 HTML 内容                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { RendererProps } from '../types'

export function HtmlRenderer({ artifact }: RendererProps) {
  return (
    <div className="h-full w-full bg-white">
      <iframe
        src={artifact.url}
        title={artifact.name}
        className="h-full w-full border-0"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  )
}
