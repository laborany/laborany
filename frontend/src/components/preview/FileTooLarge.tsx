/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       文件过大提示组件                                    ║
 * ║                                                                          ║
 * ║  设计哲学：                                                               ║
 * ║  1. 统一的大文件处理界面                                                   ║
 * ║  2. 从 artifact 自动获取文件大小，消除冗余参数                              ║
 * ║  3. 内置外部打开功能，无需外部传入回调                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { FileArtifact } from './types'
import { formatSize, openFileExternal } from './utils'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           组件接口                                        │
 * │                                                                          │
 * │  好品味：只需 artifact，其他信息自动推导                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface FileTooLargeProps {
  artifact: FileArtifact
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           文件过大提示                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function FileTooLarge({ artifact }: FileTooLargeProps) {
  const fileSize = artifact.size ?? 0
  const hasPath = !!artifact.path

  const handleOpenExternal = () => {
    if (artifact.path) {
      openFileExternal(artifact.path)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-muted/20 p-8">
      <div className="flex max-w-md flex-col items-center text-center">
        {/* 图标 */}
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-xl border border-border bg-background">
          <span className="text-4xl text-muted-foreground">📄</span>
        </div>

        {/* 文件名 */}
        <h3 className="mb-2 text-lg font-medium text-foreground">{artifact.name}</h3>

        {/* 文件大小 */}
        <p className="mb-1 text-sm text-muted-foreground">文件大小: {formatSize(fileSize)}</p>

        {/* 提示信息 */}
        <p className="mb-6 text-sm text-muted-foreground">此文件过大，无法在应用内预览</p>

        {/* 操作按钮 */}
        <div className="flex gap-3">
          {hasPath && (
            <button
              onClick={handleOpenExternal}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              用系统应用打开
            </button>
          )}
          <a
            href={artifact.url}
            download={artifact.name}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            下载文件
          </a>
        </div>
      </div>
    </div>
  )
}
