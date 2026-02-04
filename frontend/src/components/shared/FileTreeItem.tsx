/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         FileTreeItem 组件                                 ║
 * ║                                                                          ║
 * ║  递归文件树项组件，支持文件夹展开/收起、文件预览、下载                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, ReactNode } from 'react'
import { formatSize } from '../preview/utils'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface TreeFile {
  name: string
  path: string
  type: 'file' | 'folder'
  ext?: string
  size?: number
  children?: TreeFile[]
  stepIndex?: number    // 兼容工作流步骤索引
  stepName?: string     // 兼容工作流步骤名称
}

interface FileTreeItemProps {
  file: TreeFile
  depth?: number
  onPreview?: (file: TreeFile) => void
  onDownload?: (file: TreeFile) => void
  getFileUrl?: (path: string) => string
  isPreviewable?: (ext: string) => boolean
  renderIcon?: (file: TreeFile) => ReactNode
  defaultExpanded?: boolean
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           默认图标映射                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const FILE_ICONS: Record<string, string> = {
  html: '🌐', htm: '🌐',
  pdf: '📕',
  doc: '📘', docx: '📘',
  xls: '📗', xlsx: '📗',
  ppt: '📙', pptx: '📙',
  png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️',
  txt: '📄', md: '📝',
  json: '📋', csv: '📊',
  py: '🐍', js: '📜', ts: '📜', tsx: '📜', jsx: '📜',
}

function getDefaultIcon(file: TreeFile): string {
  if (file.type === 'folder') return '📁'
  return FILE_ICONS[file.ext || ''] || '📄'
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           组件实现                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function FileTreeItem({
  file,
  depth = 0,
  onPreview,
  onDownload,
  getFileUrl,
  isPreviewable = () => false,
  renderIcon,
  defaultExpanded = true,
}: FileTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const icon = renderIcon ? renderIcon(file) : getDefaultIcon(file)
  const size = file.size ? formatSize(file.size) : ''
  const canPreview = file.type === 'file' && isPreviewable(file.ext || '')

  /* ────────────────────────────────────────────────────────────────────────
   * 文件夹渲染
   * ──────────────────────────────────────────────────────────────────────── */
  if (file.type === 'folder') {
    return (
      <div style={{ marginLeft: depth * 16 }}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex w-full items-center gap-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg
            className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span>{icon}</span>
          <span>{file.name}</span>
        </button>
        {isExpanded && file.children && (
          <div className="space-y-0.5">
            {file.children.map((child) => (
              <FileTreeItem
                key={child.path}
                file={child}
                depth={depth + 1}
                onPreview={onPreview}
                onDownload={onDownload}
                getFileUrl={getFileUrl}
                isPreviewable={isPreviewable}
                renderIcon={renderIcon}
                defaultExpanded={defaultExpanded}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 文件渲染
   * ──────────────────────────────────────────────────────────────────────── */
  const downloadUrl = getFileUrl ? getFileUrl(file.path) : undefined

  return (
    <div
      style={{ marginLeft: depth * 16 }}
      className="-mx-2 flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span>{icon}</span>
        <span className="truncate text-foreground">{file.name}</span>
        {size && <span className="text-xs text-muted-foreground">({size})</span>}
      </div>
      <div className="ml-2 flex items-center gap-2">
        {canPreview && onPreview && (
          <button
            onClick={() => onPreview(file)}
            className="text-xs text-primary transition-colors hover:text-primary/80"
          >
            预览
          </button>
        )}
        {downloadUrl && (
          <a
            href={downloadUrl}
            download={file.name}
            onClick={(e) => {
              if (onDownload) {
                e.preventDefault()
                onDownload(file)
              }
            }}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            下载
          </a>
        )}
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           FileTree 容器组件                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface FileTreeProps {
  files: TreeFile[]
  onPreview?: (file: TreeFile) => void
  onDownload?: (file: TreeFile) => void
  getFileUrl?: (path: string) => string
  isPreviewable?: (ext: string) => boolean
  renderIcon?: (file: TreeFile) => ReactNode
  defaultExpanded?: boolean
  className?: string
}

export function FileTree({
  files,
  onPreview,
  onDownload,
  getFileUrl,
  isPreviewable,
  renderIcon,
  defaultExpanded = true,
  className = '',
}: FileTreeProps) {
  return (
    <div className={`space-y-0.5 ${className}`}>
      {files.map((file) => (
        <FileTreeItem
          key={file.path}
          file={file}
          depth={0}
          onPreview={onPreview}
          onDownload={onDownload}
          getFileUrl={getFileUrl}
          isPreviewable={isPreviewable}
          renderIcon={renderIcon}
          defaultExpanded={defaultExpanded}
        />
      ))}
    </div>
  )
}
