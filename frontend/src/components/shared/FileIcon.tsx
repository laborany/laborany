/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      文件图标组件                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

const FILE_ICONS: Record<string, string> = {
  md: '📄',
  yaml: '⚙️',
  py: '🐍',
  folder: '📁',
}

interface FileIconProps {
  type: string
}

export function FileIcon({ type }: FileIconProps) {
  return <span>{FILE_ICONS[type] || '📄'}</span>
}
