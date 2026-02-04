/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         RightSidebar 组件                                ║
 * ║                                                                          ║
 * ║  设计哲学：                                                               ║
 * ║  1. 简洁至上 —— 只展示必要信息，不堆砌功能                                   ║
 * ║  2. 消除分支 —— 用 Map 映射替代 switch/case                                ║
 * ║  3. 单一职责 —— 每个子组件只做一件事                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useCallback } from 'react'
import type { AgentMessage, TaskFile } from '../../types'
import type { FileArtifact } from '../preview'
import { getExt, getCategory, isPreviewable, getFileIcon } from '../preview'
import { CollapsibleSection } from './CollapsibleSection'
import { FileTree, type TreeFile } from './FileTreeItem'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface RightSidebarProps {
  messages: AgentMessage[]
  isRunning: boolean
  artifacts: TaskFile[]
  selectedArtifact: FileArtifact | null
  onSelectArtifact: (artifact: FileArtifact) => void
  getFileUrl: (path: string) => string
  workDir: string | null
}

interface ToolUsage {
  id: string
  name: string
  input?: Record<string, unknown>
  timestamp: Date
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      工具名称 → 显示名称 映射                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const TOOL_DISPLAY_MAP: Record<string, string> = {
  Read: '读取文件',
  Write: '写入文件',
  Edit: '编辑文件',
  Bash: '执行命令',
  Glob: '搜索文件',
  Grep: '搜索内容',
  WebFetch: '获取网页',
  WebSearch: '搜索网络',
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      工具名称 → 图标 映射                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const TOOL_ICON_MAP: Record<string, string> = {
  Read: '📖',
  Write: '✏️',
  Edit: '🔧',
  Bash: '💻',
  Glob: '🔍',
  Grep: '🔎',
  WebFetch: '🌐',
  WebSearch: '🔍',
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      从消息中提取工具使用记录                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function extractToolUsages(messages: AgentMessage[]): ToolUsage[] {
  return messages
    .filter((m) => m.type === 'tool' && m.toolName)
    .map((m) => ({
      id: m.id,
      name: m.toolName!,
      input: m.toolInput,
      timestamp: m.timestamp,
    }))
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      TaskFile → TreeFile 转换                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function toTreeFile(file: TaskFile): TreeFile {
  return {
    name: file.name,
    path: file.path,
    type: file.type,
    ext: file.ext,
    size: file.size,
    children: file.children?.map(toTreeFile),
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      TaskFile → FileArtifact 转换                         │
 * │                                                                          │
 * │  注意：path 字段需要是绝对路径，用于 PDF 转换等需要文件系统路径的场景         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function toFileArtifact(
  file: TaskFile,
  getFileUrl: (path: string) => string,
  workDir: string | null,
): FileArtifact {
  const ext = file.ext || getExt(file.name)
  // 构建绝对路径：workDir + 相对路径
  const fullPath = workDir ? `${workDir}/${file.path}`.replace(/\\/g, '/') : file.path
  return {
    name: file.name,
    path: fullPath,
    ext,
    category: getCategory(ext),
    size: file.size,
    url: getFileUrl(file.path),
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      空状态组件                                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-2 py-2 text-muted-foreground">
      <span className="text-lg">{icon}</span>
      <span className="text-sm">{text}</span>
    </div>
  )
}

/* ┌────────────────────────────────────────────────────────────────���─────────┐
 * │                      工具使用项组件                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ToolItem({ tool }: { tool: ToolUsage }) {
  const icon = TOOL_ICON_MAP[tool.name] || '🔧'
  const displayName = TOOL_DISPLAY_MAP[tool.name] || tool.name
  const filePath = tool.input?.file_path as string | undefined
  const command = tool.input?.command as string | undefined

  // 提取简短描述
  const getDescription = (): string => {
    if (filePath) {
      const fileName = filePath.split('/').pop() || filePath
      return fileName.length > 30 ? fileName.slice(0, 27) + '...' : fileName
    }
    if (command) {
      return command.length > 30 ? command.slice(0, 27) + '...' : command
    }
    return ''
  }

  const desc = getDescription()

  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/50">
      <span>{icon}</span>
      <span className="text-foreground">{displayName}</span>
      {desc && <span className="truncate text-xs text-muted-foreground">({desc})</span>}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      产物列表项组件                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ArtifactItem({
  file,
  isSelected,
  onClick,
}: {
  file: TaskFile
  isSelected: boolean
  onClick: () => void
}) {
  const ext = file.ext || getExt(file.name)
  const icon = getFileIcon(ext)

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
        isSelected ? 'bg-accent' : 'hover:bg-accent/50'
      }`}
    >
      <span>{icon}</span>
      <span className="truncate text-foreground">{file.name}</span>
    </button>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      递归收集所有文件（扁平化）                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function collectAllFiles(files: TaskFile[]): TaskFile[] {
  const result: TaskFile[] = []
  for (const file of files) {
    if (file.type === 'file') {
      result.push(file)
    }
    if (file.children) {
      result.push(...collectAllFiles(file.children))
    }
  }
  return result
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      主组件                                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function RightSidebar({
  messages,
  isRunning,
  artifacts,
  selectedArtifact,
  onSelectArtifact,
  getFileUrl,
  workDir,
}: RightSidebarProps) {
  const [showAllTools, setShowAllTools] = useState(false)

  // 提取工具使用记录
  const toolUsages = extractToolUsages(messages)
  const visibleTools = showAllTools ? toolUsages : toolUsages.slice(-5)

  // 扁平化文件列表（用于产物列表）
  const allFiles = collectAllFiles(artifacts)

  // 处理文件预览
  const handlePreview = useCallback(
    (file: TreeFile) => {
      const taskFile: TaskFile = {
        name: file.name,
        path: file.path,
        type: file.type,
        ext: file.ext,
        size: file.size,
      }
      onSelectArtifact(toFileArtifact(taskFile, getFileUrl, workDir))
    },
    [onSelectArtifact, getFileUrl, workDir]
  )

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-border bg-background">
      {/* ────────────────────────────────────────────────────────────────────
       * 产物列表
       * ──────────────────────────────────────────────────────────────────── */}
      <CollapsibleSection title="产物列表" badge={allFiles.length} defaultExpanded={true}>
        {allFiles.length === 0 ? (
          <EmptyState icon="📦" text="暂无产出文件" />
        ) : (
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {allFiles.map((file) => (
              <ArtifactItem
                key={file.path}
                file={file}
                isSelected={selectedArtifact?.path === file.path}
                onClick={() => onSelectArtifact(toFileArtifact(file, getFileUrl, workDir))}
              />
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* ────────────────────────────────────────────────────────────────────
       * 文件树
       * ──────────────────────────────────────────────────────────────────── */}
      <CollapsibleSection title="工作区文件" defaultExpanded={true}>
        {artifacts.length === 0 ? (
          <EmptyState icon="📁" text="暂无文件" />
        ) : (
          <div className="max-h-64 overflow-y-auto">
            <FileTree
              files={artifacts.map(toTreeFile)}
              onPreview={handlePreview}
              getFileUrl={getFileUrl}
              isPreviewable={isPreviewable}
              defaultExpanded={false}
            />
          </div>
        )}
      </CollapsibleSection>

      {/* ────────────────────────────────────────────────────────────────────
       * 工具使用记录
       * ──────────────────────────────────────────────────────────────────── */}
      <CollapsibleSection
        title="工具调用"
        badge={toolUsages.length}
        defaultExpanded={false}
      >
        {toolUsages.length === 0 ? (
          <EmptyState icon="🔧" text={isRunning ? '等待执行...' : '暂无工具调用'} />
        ) : (
          <div className="space-y-0.5">
            {visibleTools.map((tool) => (
              <ToolItem key={tool.id} tool={tool} />
            ))}
            {toolUsages.length > 5 && (
              <button
                onClick={() => setShowAllTools(!showAllTools)}
                className="w-full py-1 text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {showAllTools ? '收起' : `显示全部 ${toolUsages.length} 条`}
              </button>
            )}
          </div>
        )}
      </CollapsibleSection>
    </div>
  )
}
