import { useMemo } from 'react'
import { FileIcon } from './FileIcon'

export interface TreeFile {
  name: string
  path: string
  type: 'file' | 'folder'
  category?: string
  ext?: string
  size?: number
  children?: TreeFile[]
}

export function FileTree({
  files,
  onPreview,
  defaultExpanded,
}: {
  files: TreeFile[]
  onPreview: (file: TreeFile) => void
  getFileUrl?: (path: string) => string
  isPreviewable?: (ext: string) => boolean
  defaultExpanded?: boolean
}) {
  const sortedFiles = useMemo(() => {
    const list = [...files]
    list.sort((left, right) => {
      const leftFolder = Array.isArray(left.children) && left.children.length > 0
      const rightFolder = Array.isArray(right.children) && right.children.length > 0
      if (leftFolder !== rightFolder) return leftFolder ? -1 : 1
      return left.name.localeCompare(right.name, 'zh-CN')
    })
    return list
  }, [files])

  return (
    <div className="space-y-1">
      {sortedFiles.map((file) => (
        <FileTreeItem
          key={file.path}
          file={file}
          depth={0}
          onPreview={onPreview}
          defaultExpanded={defaultExpanded}
        />
      ))}
    </div>
  )
}

export function FileTreeItem({
  file,
  depth,
  onPreview,
  defaultExpanded,
}: {
  file: TreeFile
  depth?: number
  selectedPath?: string
  onPreview: (file: TreeFile) => void
  defaultExpanded?: boolean
}) {
  const level = depth || 0
  const isFolder = Array.isArray(file.children) && file.children.length > 0
  const isSelected = false
  const expanded = defaultExpanded ?? false

  return (
    <div>
      <button
        type="button"
        onClick={() => !isFolder && onPreview(file)}
        className={
          'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors ' +
          (isSelected
            ? 'bg-primary/10 text-primary'
            : 'text-foreground hover:bg-muted/50')
        }
        style={{ paddingLeft: `${level * 14 + 8}px` }}
      >
        <span className="shrink-0">
          {isFolder ? '📁' : <FileIcon type={file.ext || file.type || ''} />}
        </span>
        <span className="truncate">{file.name}</span>
      </button>

      {isFolder && expanded && file.children?.map((child) => (
        <FileTreeItem
          key={child.path}
          file={child}
          depth={level + 1}
          onPreview={onPreview}
          defaultExpanded={defaultExpanded}
        />
      ))}
    </div>
  )
}
