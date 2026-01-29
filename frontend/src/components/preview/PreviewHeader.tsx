/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         预览头部工具栏                                     ║
 * ║                                                                          ║
 * ║  提供：文件名显示、下载、关闭 三个核心功能                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { FileArtifact } from './types'

interface Props {
  artifact: FileArtifact
  onClose: () => void
}

export function PreviewHeader({ artifact, onClose }: Props) {
  return (
    <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
      {/* 文件名 */}
      <h3 className="truncate font-medium text-foreground">{artifact.name}</h3>

      {/* 操作按钮 */}
      <div className="flex items-center gap-3">
        {/* 下载 */}
        <a
          href={artifact.url}
          download={artifact.name}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          下载
        </a>

        {/* 关闭 */}
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
