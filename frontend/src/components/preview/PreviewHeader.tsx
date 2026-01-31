/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         预览头部工具栏                                     ║
 * ║                                                                          ║
 * ║  设计哲学：                                                               ║
 * ║  1. 简洁至上 —— 只展示必要的操作按钮                                        ║
 * ║  2. 统一交互 —— 所有按钮使用一致的样式和反馈                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { FileArtifact } from './types'
import { openFileExternal, formatSize } from './utils'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Props 定义                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface Props {
  artifact: FileArtifact
  onClose: () => void
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function PreviewHeader({ artifact, onClose }: Props) {
  const handleOpenExternal = () => {
    if (artifact.path) {
      openFileExternal(artifact.path)
    }
  }

  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
      {/* 文件信息 */}
      <div className="flex items-center gap-2 min-w-0">
        <h3 className="truncate font-medium text-foreground">{artifact.name}</h3>
        {artifact.size && (
          <span className="shrink-0 text-xs text-muted-foreground">
            ({formatSize(artifact.size)})
          </span>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex shrink-0 items-center gap-2">
        {/* 外部打开 */}
        {artifact.path && (
          <button
            onClick={handleOpenExternal}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="用默认应用打开"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        )}

        {/* 下载 */}
        <a
          href={artifact.url}
          download={artifact.name}
          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="下载文件"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </a>

        {/* 关闭 */}
        <button
          onClick={onClose}
          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="关闭预览"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
