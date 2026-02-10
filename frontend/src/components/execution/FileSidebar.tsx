/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       FileSidebar 文件侧边栏                             ║
 * ║                                                                          ║
 * ║  设计哲学：                                                               ║
 * ║  1. 薄包装 —— 只做 RightSidebar 的容器，不重复逻辑                         ║
 * ║  2. 宽度可配 —— 通过 props 控制，默认 280px                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { AgentMessage, TaskFile } from '../../types'
import type { FileArtifact } from '../preview'
import { RightSidebar } from '../shared/RightSidebar'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Props 定义                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface FileSidebarProps {
  messages: AgentMessage[]
  isRunning: boolean
  taskFiles: TaskFile[]
  selectedArtifact: FileArtifact | null
  onSelectArtifact: (artifact: FileArtifact) => void
  getFileUrl: (path: string) => string
  workDir: string | null
  width?: number
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           默认宽度                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const DEFAULT_WIDTH = 280

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function FileSidebar({
  messages,
  isRunning,
  taskFiles,
  selectedArtifact,
  onSelectArtifact,
  getFileUrl,
  workDir,
  width = DEFAULT_WIDTH,
}: FileSidebarProps) {
  return (
    <div style={{ width }} className="shrink-0">
      <RightSidebar
        messages={messages}
        isRunning={isRunning}
        artifacts={taskFiles}
        selectedArtifact={selectedArtifact}
        onSelectArtifact={onSelectArtifact}
        getFileUrl={getFileUrl}
        workDir={workDir}
      />
    </div>
  )
}
