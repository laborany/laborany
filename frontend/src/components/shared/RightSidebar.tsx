import { useCallback, useMemo, useState } from 'react'
import type { AgentMessage, TaskFile } from '../../types'
import type { FileArtifact } from '../preview'
import { getCategory, getExt, getFileIcon, isPreviewable } from '../preview'
import { CollapsibleSection } from './CollapsibleSection'
import { FileTree, type TreeFile } from './FileTreeItem'
import { isSelectedArtifactPath, sortTaskFilesByRecency, toArtifactPath } from './taskFileUtils'

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

const TOOL_DISPLAY_MAP: Record<string, string> = {
  Read: '读取文件',
  Write: '写入文件',
  Edit: '编辑文件',
  Bash: '执行命令',
  Glob: '搜索文件',
  Grep: '搜索内容',
  WebFetch: '获取网页',
  WebSearch: '网络搜索',
  AskUserQuestion: '询问用户',
  execution_result: '执行结果',
  '执行结果': '执行结果',
}

const TOOL_ICON_MAP: Record<string, string> = {
  Read: '📄',
  Write: '✏️',
  Edit: '🛠️',
  Bash: '💻',
  Glob: '🔎',
  Grep: '🔍',
  WebFetch: '🌐',
  WebSearch: '🔎',
  AskUserQuestion: '❓',
  execution_result: '✅',
  '执行结果': '✅',
}

function normalizeToolName(name: string): string {
  const legacyMap: Record<string, string> = {
    '\u93B5\u0446\uE511\u7F01\u64B4\u7049': '执行结果',
    '\u95B9\u7B1B\u55E9\u653D\u7F02\u4F79\u633B\u940F\u003F': '执行结果',
  }

  return legacyMap[name] || name
}

function getToolDisplayName(name: string): string {
  return TOOL_DISPLAY_MAP[name] || name
}

function extractToolUsages(messages: AgentMessage[]): ToolUsage[] {
  return messages
    .filter((message) => message.type === 'tool' && message.toolName)
    .map((message) => ({
      id: message.id,
      name: normalizeToolName(message.toolName!),
      input: message.toolInput,
      timestamp: message.timestamp,
    }))
}

function toTreeFile(file: TaskFile): TreeFile {
  return {
    name: file.name,
    path: file.path,
    type: file.type,
    category: file.type,
    ext: file.ext,
    children: file.children?.map(toTreeFile),
  }
}

function toFileArtifact(
  file: TaskFile,
  getFileUrl: (path: string) => string,
  workDir: string | null,
): FileArtifact {
  const ext = file.ext || getExt(file.name)
  const fullPath = toArtifactPath(file.path, workDir)

  return {
    name: file.name,
    path: fullPath,
    ext,
    category: getCategory(ext),
    size: file.size,
    url: getFileUrl(file.path),
  }
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-2 py-2 text-muted-foreground">
      <span className="text-lg">{icon}</span>
      <span className="text-sm">{text}</span>
    </div>
  )
}

function ToolItem({ tool }: { tool: ToolUsage }) {
  const icon = TOOL_ICON_MAP[tool.name] || '🧩'
  const displayName = getToolDisplayName(tool.name)
  const filePath = tool.input?.file_path as string | undefined
  const command = tool.input?.command as string | undefined

  const description = useMemo(() => {
    if (filePath) {
      const fileName = filePath.split('/').pop() || filePath
      return fileName.length > 30 ? `${fileName.slice(0, 27)}...` : fileName
    }

    if (command) {
      return command.length > 30 ? `${command.slice(0, 27)}...` : command
    }

    return ''
  }, [filePath, command])

  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/50">
      <span>{icon}</span>
      <span className="text-foreground">{displayName}</span>
      {description && <span className="truncate text-xs text-muted-foreground">({description})</span>}
    </div>
  )
}

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

  const toolUsages = extractToolUsages(messages)
  const visibleTools = showAllTools ? toolUsages : toolUsages.slice(-5)
  const allFiles = useMemo(() => sortTaskFilesByRecency(artifacts), [artifacts])

  const handlePreview = useCallback(
    (file: TreeFile) => {
      const taskFile: TaskFile = {
        name: file.name,
        path: file.path,
        type: file.type,
        ext: file.ext,
      }
      onSelectArtifact(toFileArtifact(taskFile, getFileUrl, workDir))
    },
    [onSelectArtifact, getFileUrl, workDir],
  )

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-border bg-background">
      <CollapsibleSection title="产物列表" badge={allFiles.length} defaultExpanded={true}>
        {allFiles.length === 0 ? (
          <EmptyState icon="📄" text="暂无产出文件" />
        ) : (
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {allFiles.map((file) => (
              <ArtifactItem
                key={file.path}
                file={file}
                isSelected={isSelectedArtifactPath(file, selectedArtifact?.path, workDir)}
                onClick={() => onSelectArtifact(toFileArtifact(file, getFileUrl, workDir))}
              />
            ))}
          </div>
        )}
      </CollapsibleSection>

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

      <CollapsibleSection title="工具调用" badge={toolUsages.length} defaultExpanded={false}>
        {toolUsages.length === 0 ? (
          <EmptyState icon="🧰" text={isRunning ? '等待执行...' : '暂无工具调用'} />
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
