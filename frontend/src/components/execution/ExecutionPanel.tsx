/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       ExecutionPanel 执行面板                             ║
 * ║                                                                          ║
 * ║  设计哲学：                                                               ║
 * ║  1. 三面板布局 —— 聊天 | 预览 | 文件树，可复用于任何执行场景                 ║
 * ║  2. 自动展开 —— 检测到产物时自动展开预览面板                                ║
 * ║  3. 可拖拽分隔条 —— 用户可自由调整面板宽度                                  ║
 * ║  4. 薄组件 —— 布局编排，不持有业务逻辑                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useRef, useEffect, useCallback } from 'react'
import type { AgentMessage, TaskFile } from '../../types'
import type { FileArtifact } from '../preview'
import { getExt, getCategory, isPreviewable } from '../preview'
import { useVitePreview } from '../../hooks/useVitePreview'
import type { PendingQuestion } from '../../hooks/useAgent'
import { ResizeHandle, useResizablePanel } from '../shared/ResizeHandle'
import ChatInput from '../shared/ChatInput'
import MessageList from '../shared/MessageList'
import { QuestionInput } from '../shared/QuestionInput'
import { PreviewPanel } from './PreviewPanel'
import { FileSidebar } from './FileSidebar'
import { StepProgress } from './StepProgress'
import type { CompositeStep as CompositeStepUI } from './StepProgress'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Props 定义                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface ExecutionPanelProps {
  /* 消息流 */
  messages: AgentMessage[]
  isRunning: boolean
  error: string | null

  /* 文件系统 */
  taskFiles: TaskFile[]
  workDir: string | null
  filesVersion: number

  /* 交互 */
  onSubmit: (message: string, files?: File[]) => void
  onStop: () => void

  /* 会话信息 */
  sessionId: string | null
  getFileUrl: (path: string) => string
  fetchTaskFiles: () => void

  /* 问答交互 */
  pendingQuestion: PendingQuestion | null
  respondToQuestion: (questionId: string, answers: Record<string, string>) => void

  /* 可选配置 */
  placeholder?: string

  /* 顶部栏插槽 —— 让调用方自定义导航和操作按钮 */
  headerSlot?: React.ReactNode

  /* 复合技能步骤进度（可选，有值时在消息流上方显示 StepProgress） */
  compositeSteps?: CompositeStepUI[]
  currentCompositeStep?: number
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           布局常量                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const CHAT_PANEL_MIN = 300
const CHAT_PANEL_MAX = 800
const CHAT_PANEL_DEFAULT = 450

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      递归查找文件（通用）                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function findFile(files: TaskFile[], predicate: (f: TaskFile) => boolean): TaskFile | null {
  for (const file of files) {
    if (predicate(file)) return file
    if (file.children) {
      const found = findFile(file.children, predicate)
      if (found) return found
    }
  }
  return null
}

const isPreviewableFile = (f: TaskFile) => f.type === 'file' && isPreviewable(f.ext || '')
const matchesPath = (path: string) => (f: TaskFile) => f.path === path

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      TaskFile → FileArtifact 转换                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function toFileArtifact(
  file: TaskFile,
  getFileUrl: (path: string) => string,
  workDir: string | null,
): FileArtifact {
  const ext = file.ext || getExt(file.name)
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
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function ExecutionPanel({
  messages,
  isRunning,
  error,
  taskFiles,
  workDir,
  filesVersion,
  onSubmit,
  onStop,
  sessionId,
  getFileUrl,
  fetchTaskFiles,
  pendingQuestion,
  respondToQuestion,
  placeholder = '输入你的问题...',
  headerSlot,
  compositeSteps,
  currentCompositeStep,
}: ExecutionPanelProps) {
  /* ── 预览状态 ── */
  const [isPreviewVisible, setIsPreviewVisible] = useState(false)
  const [isRightSidebarVisible, setIsRightSidebarVisible] = useState(false)
  const [selectedArtifact, setSelectedArtifact] = useState<FileArtifact | null>(null)
  const [showLivePreview, setShowLivePreview] = useState(false)
  const hasAutoExpandedRef = useRef(false)
  const selectedPathRef = useRef<string | null>(null)

  /* ── 可拖拽面板 ── */
  const {
    width: chatPanelWidth,
    handleResize: handleChatResize,
    handleResizeEnd: handleChatResizeEnd,
  } = useResizablePanel({
    initialWidth: CHAT_PANEL_DEFAULT,
    minWidth: CHAT_PANEL_MIN,
    maxWidth: CHAT_PANEL_MAX,
    storageKey: 'laborany-chat-panel-width',
  })

  /* ── Live Preview ── */
  const {
    status: liveStatus,
    previewUrl,
    error: liveError,
    startPreview,
    stopPreview,
  } = useVitePreview(sessionId)

  /* ── 选中 artifact ── */
  const handleSelectArtifact = useCallback((artifact: FileArtifact) => {
    setSelectedArtifact(artifact)
    setIsPreviewVisible(true)
    setShowLivePreview(false)
  }, [])

  /* ── 启动 Live Preview ── */
  const handleStartLivePreview = useCallback(() => {
    if (!workDir) return
    setShowLivePreview(true)
    setIsPreviewVisible(true)
    startPreview(workDir)
  }, [workDir, startPreview])

  /* ── 关闭预览 ── */
  const handleClosePreview = useCallback(() => {
    setIsPreviewVisible(false)
    setSelectedArtifact(null)
    setShowLivePreview(false)
  }, [])

  /* ── 执行完成后自动获取文件列表 ── */
  useEffect(() => {
    if (!isRunning && sessionId && messages.length > 0) fetchTaskFiles()
  }, [isRunning, sessionId, messages.length, fetchTaskFiles])

  /* ── 自动展开预览面板 ── */
  useAutoExpandPreview(
    taskFiles, messages, hasAutoExpandedRef,
    setIsRightSidebarVisible, handleSelectArtifact, getFileUrl, workDir,
  )

  /* ── 文件更新时刷新预览 ── */
  useRefreshPreview(
    selectedArtifact, filesVersion, taskFiles, getFileUrl, workDir,
    selectedPathRef, setSelectedArtifact,
  )

  const showResizeHandle = isPreviewVisible || isRightSidebarVisible

  return (
    <div className="flex h-full">
      {/* ════════════════════════════════════════════════════════════════════
       * 左侧：聊天面板
       * ════════════════════════════════════════════════════════════════════ */}
      <ChatPanel
        chatPanelWidth={chatPanelWidth}
        showResizeHandle={showResizeHandle}
        headerSlot={headerSlot}
        error={error}
        messages={messages}
        isRunning={isRunning}
        pendingQuestion={pendingQuestion}
        respondToQuestion={respondToQuestion}
        onSubmit={onSubmit}
        onStop={onStop}
        placeholder={placeholder}
        compositeSteps={compositeSteps}
        currentCompositeStep={currentCompositeStep}
      />

      {/* ════════════════════════════════════════════════════════════════════
       * 分隔条
       * ════════════════════════════════════════════════════════════════════ */}
      {showResizeHandle && (
        <ResizeHandle
          onResize={handleChatResize}
          onResizeEnd={handleChatResizeEnd}
          direction="horizontal"
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════
       * 中间：预览面板
       * ════════════════════════════════════════════════════════════════════ */}
      {isPreviewVisible && (
        <div className="flex-1 min-w-[300px] border-l border-border">
          <PreviewPanel
            selectedArtifact={selectedArtifact}
            showLivePreview={showLivePreview}
            liveStatus={liveStatus}
            previewUrl={previewUrl}
            liveError={liveError}
            onStartLive={handleStartLivePreview}
            onStopLive={stopPreview}
            onClose={handleClosePreview}
          />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
       * 右侧：文件侧边栏
       * ════════════════════════════════════════════════════════════════════ */}
      {isRightSidebarVisible && (
        <FileSidebar
          messages={messages}
          isRunning={isRunning}
          taskFiles={taskFiles}
          selectedArtifact={selectedArtifact}
          onSelectArtifact={handleSelectArtifact}
          getFileUrl={getFileUrl}
          workDir={workDir}
        />
      )}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      ChatPanel 聊天面板子组件                             │
 * │                                                                          │
 * │  职责：左侧聊天区域的布局，包含 header、消息列表、输入框                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface ChatPanelProps {
  chatPanelWidth: number
  showResizeHandle: boolean
  headerSlot?: React.ReactNode
  error: string | null
  messages: AgentMessage[]
  isRunning: boolean
  pendingQuestion: PendingQuestion | null
  respondToQuestion: (id: string, answers: Record<string, string>) => void
  onSubmit: (message: string, files?: File[]) => void
  onStop: () => void
  placeholder: string
  compositeSteps?: CompositeStepUI[]
  currentCompositeStep?: number
}

function ChatPanel({
  chatPanelWidth,
  showResizeHandle,
  headerSlot,
  error,
  messages,
  isRunning,
  pendingQuestion,
  respondToQuestion,
  onSubmit,
  onStop,
  placeholder,
  compositeSteps,
  currentCompositeStep,
}: ChatPanelProps) {
  return (
    <div
      className="flex flex-col px-4 py-6 overflow-hidden"
      style={{
        width: showResizeHandle ? chatPanelWidth : '100%',
        maxWidth: showResizeHandle ? undefined : '56rem',
        margin: showResizeHandle ? undefined : '0 auto',
      }}
    >
      {/* 顶部栏插槽 */}
      {headerSlot}

      {/* 错误提示 */}
      {error && <ErrorBanner message={error} />}

      {/* 复合技能步骤进度 */}
      {compositeSteps && compositeSteps.length > 0 && (
        <div className="shrink-0 mb-2">
          <StepProgress steps={compositeSteps} currentStep={currentCompositeStep} />
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto mb-4 min-h-0">
        {messages.length === 0 ? <EmptyState isRunning={isRunning} /> : (
          <MessageList messages={messages} isRunning={isRunning} />
        )}
      </div>

      {/* 问题输入 */}
      {pendingQuestion && (
        <div className="shrink-0 mb-4">
          <QuestionInput pendingQuestion={pendingQuestion} onSubmit={respondToQuestion} />
        </div>
      )}

      {/* 输入框 */}
      <div className="shrink-0">
        <ChatInput
          onSubmit={onSubmit}
          onStop={onStop}
          isRunning={isRunning}
          placeholder={placeholder}
        />
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           空状态                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function EmptyState({ isRunning }: { isRunning: boolean }) {
  if (isRunning) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <div className="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
          <p className="text-lg font-medium text-foreground mb-1">正在处理任务</p>
          <p className="text-sm">已开始执行，请稍候，结果会实时显示在这里</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex items-center justify-center text-muted-foreground">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center animate-float">
          <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p className="text-lg font-medium text-foreground mb-1">开始对话</p>
        <p className="text-sm">输入你的问题，AI 助手将为你分析</p>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           错误横幅                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm flex items-center gap-2 shrink-0">
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {message}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      自动展开预览 Hook                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function useAutoExpandPreview(
  taskFiles: TaskFile[],
  messages: AgentMessage[],
  hasAutoExpandedRef: React.MutableRefObject<boolean>,
  setIsRightSidebarVisible: (v: boolean) => void,
  handleSelectArtifact: (a: FileArtifact) => void,
  getFileUrl: (path: string) => string,
  workDir: string | null,
) {
  useEffect(() => {
    if (hasAutoExpandedRef.current) return

    const hasArtifacts = taskFiles.length > 0
    const hasFileOps = messages.some(
      (m) => m.type === 'tool' && ['Read', 'Write', 'Edit', 'Bash'].includes(m.toolName || '')
    )

    if (!hasArtifacts && !hasFileOps) return

    setIsRightSidebarVisible(true)
    hasAutoExpandedRef.current = true

    if (taskFiles.length === 0) return

    const firstFile = findFile(taskFiles, isPreviewableFile)
    if (!firstFile) return

    handleSelectArtifact(toFileArtifact(firstFile, getFileUrl, workDir))
  }, [taskFiles, messages, hasAutoExpandedRef, setIsRightSidebarVisible, handleSelectArtifact, getFileUrl, workDir])
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      文件更新时刷新预览 Hook                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function useRefreshPreview(
  selectedArtifact: FileArtifact | null,
  filesVersion: number,
  taskFiles: TaskFile[],
  getFileUrl: (path: string) => string,
  workDir: string | null,
  selectedPathRef: React.MutableRefObject<string | null>,
  setSelectedArtifact: (a: FileArtifact) => void,
) {
  /* 记录当前选中的文件路径 */
  useEffect(() => {
    selectedPathRef.current = selectedArtifact?.path || null
  }, [selectedArtifact?.path, selectedPathRef])

  /* 当 filesVersion 变化时，刷新当前选中的 artifact */
  useEffect(() => {
    if (filesVersion === 0 || !selectedPathRef.current || taskFiles.length === 0) return

    const currentFile = findFile(taskFiles, matchesPath(selectedPathRef.current))
    if (currentFile) {
      setSelectedArtifact(toFileArtifact(currentFile, getFileUrl, workDir))
    }
  }, [filesVersion, taskFiles, getFileUrl, workDir, selectedPathRef, setSelectedArtifact])
}
