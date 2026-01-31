/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Skill 执行页面                                    ║
 * ║                                                                          ║
 * ║  设计哲学：                                                               ║
 * ║  1. 三面板布局 —— 聊天 | 预览 | 侧边栏                                      ║
 * ║  2. 主动预览 —— 检测到产物时自动展开预览面板                                  ║
 * ║  3. 可拖拽分隔条 —— 用户可自由调整面板宽度                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useParams, Link } from 'react-router-dom'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useAgent } from '../hooks/useAgent'
import type { TaskFile } from '../types'
import { useVitePreview } from '../hooks/useVitePreview'
import ChatInput from '../components/shared/ChatInput'
import MessageList from '../components/shared/MessageList'
import { QuestionInput } from '../components/shared/QuestionInput'
import { RightSidebar } from '../components/shared/RightSidebar'
import { ResizeHandle, useResizablePanel } from '../components/shared/ResizeHandle'
import { ArtifactPreview, VitePreview, getExt, getCategory, isPreviewable } from '../components/preview'
import { Tooltip } from '../components/ui'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui'
import { Button } from '../components/ui'
import type { FileArtifact } from '../components/preview'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      递归查找第一个可预览文件                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function findFirstPreviewableFile(files: TaskFile[]): TaskFile | null {
  for (const file of files) {
    if (file.type === 'file' && isPreviewable(file.ext || '')) return file
    if (file.children) {
      const found = findFirstPreviewableFile(file.children)
      if (found) return found
    }
  }
  return null
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      TaskFile → FileArtifact 转换                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function toFileArtifact(file: TaskFile, getFileUrl: (path: string) => string): FileArtifact {
  const ext = file.ext || getExt(file.name)
  return {
    name: file.name,
    path: file.path,
    ext,
    category: getCategory(ext),
    size: file.size,
    url: getFileUrl(file.path),
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      布局常量                                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const CHAT_PANEL_MIN = 300
const CHAT_PANEL_MAX = 800
const CHAT_PANEL_DEFAULT = 450
const SIDEBAR_WIDTH = 280

export default function ExecutePage() {
  const { skillId } = useParams<{ skillId: string }>()
  const {
    messages,
    isRunning,
    error,
    sessionId,
    taskFiles,
    workDir,
    pendingQuestion,
    filesVersion,
    execute,
    stop,
    clear,
    fetchTaskFiles,
    getFileUrl,
    respondToQuestion,
  } = useAgent(skillId || '')

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                           状态管理                                        │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const [isPreviewVisible, setIsPreviewVisible] = useState(false)
  const [isRightSidebarVisible, setIsRightSidebarVisible] = useState(false)
  const [selectedArtifact, setSelectedArtifact] = useState<FileArtifact | null>(null)
  const [showLivePreview, setShowLivePreview] = useState(false)
  const [showClearDialog, setShowClearDialog] = useState(false)

  // 自动展开标记（只触发一次）
  const hasAutoExpandedRef = useRef(false)

  // 可拖拽面板宽度
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

  // Live Preview Hook
  const {
    status: liveStatus,
    previewUrl,
    error: liveError,
    startPreview,
    stopPreview,
  } = useVitePreview(sessionId)

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                      选中 artifact 时打开预览                             │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const handleSelectArtifact = useCallback((artifact: FileArtifact) => {
    setSelectedArtifact(artifact)
    setIsPreviewVisible(true)
    setShowLivePreview(false)
  }, [])

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                      启动 Live Preview                                   │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const handleStartLivePreview = useCallback(() => {
    if (workDir) {
      setShowLivePreview(true)
      setIsPreviewVisible(true)
      startPreview(workDir)
    }
  }, [workDir, startPreview])

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                      执行完成后自动获取文件列表                            │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  useEffect(() => {
    if (!isRunning && sessionId && messages.length > 0) {
      fetchTaskFiles()
    }
  }, [isRunning, sessionId, messages.length, fetchTaskFiles])

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                      自动展开预览面板                                     │
   * └──────────────────────────────────────────────────────────────────────────┘ */
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

    const firstFile = findFirstPreviewableFile(taskFiles)
    if (!firstFile) return

    handleSelectArtifact(toFileArtifact(firstFile, getFileUrl))
  }, [taskFiles, messages, handleSelectArtifact, getFileUrl])

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                      文件更新时自动刷新预览                                │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const selectedPathRef = useRef<string | null>(null)

  // 记录当前选中的文件路径
  useEffect(() => {
    selectedPathRef.current = selectedArtifact?.path || null
  }, [selectedArtifact?.path])

  // 当 filesVersion 变化时，刷新当前选中的 artifact
  useEffect(() => {
    if (filesVersion === 0 || !selectedPathRef.current || taskFiles.length === 0) return

    const findFile = (files: TaskFile[], path: string): TaskFile | null => {
      for (const file of files) {
        if (file.path === path) return file
        if (file.children) {
          const found = findFile(file.children, path)
          if (found) return found
        }
      }
      return null
    }

    const currentFile = findFile(taskFiles, selectedPathRef.current)
    if (currentFile) {
      setSelectedArtifact(toFileArtifact(currentFile, getFileUrl))
    }
  }, [filesVersion, taskFiles, getFileUrl])

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                      清空对话                                            │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const handleClear = useCallback(() => {
    clear()
    setShowClearDialog(false)
    setSelectedArtifact(null)
    setIsPreviewVisible(false)
    setIsRightSidebarVisible(false)
    setShowLivePreview(false)
    hasAutoExpandedRef.current = false
  }, [clear])

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                      关闭预览                                            │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const handleClosePreview = useCallback(() => {
    setIsPreviewVisible(false)
    setSelectedArtifact(null)
    setShowLivePreview(false)
  }, [])

  // 计算是否显示分隔条
  const showResizeHandle = isPreviewVisible || isRightSidebarVisible

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* ════════════════════════════════════════════════════════════════════
       * 左侧：聊天面板
       * ════════════════════════════════════════════════════════════════════ */}
      <div
        className="flex flex-col px-4 py-6 overflow-hidden"
        style={{
          width: showResizeHandle ? chatPanelWidth : '100%',
          maxWidth: showResizeHandle ? undefined : '56rem',
          margin: showResizeHandle ? undefined : '0 auto',
        }}
      >
        {/* 顶部导航 */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h2 className="text-lg font-semibold text-foreground">
              {skillId === 'financial-report' ? '金融研报助手' : skillId}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {/* Live Preview 按钮 */}
            {workDir && (
              <Tooltip content="在浏览器中实时预览" side="bottom">
                <button
                  onClick={handleStartLivePreview}
                  className={`text-sm flex items-center gap-1.5 transition-colors ${
                    showLivePreview ? 'text-green-500' : 'text-primary hover:text-primary/80'
                  }`}
                >
                  🚀 Live
                </button>
              </Tooltip>
            )}
            {/* 侧边栏切换 */}
            {taskFiles.length > 0 && (
              <Tooltip content="切换侧边栏" side="bottom">
                <button
                  onClick={() => setIsRightSidebarVisible(!isRightSidebarVisible)}
                  className={`text-sm flex items-center gap-1.5 transition-colors ${
                    isRightSidebarVisible ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                  </svg>
                </button>
              </Tooltip>
            )}
            {/* 清空对话 */}
            {messages.length > 0 && (
              <Tooltip content="清空当前对话记录" side="bottom">
                <button
                  onClick={() => setShowClearDialog(true)}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  清空
                </button>
              </Tooltip>
            )}
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm flex items-center gap-2 shrink-0">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto mb-4 min-h-0">
          {messages.length === 0 ? (
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
          ) : (
            <MessageList messages={messages} isRunning={isRunning} />
          )}
        </div>

        {/* 问题输入（当有待回答问题时显示） */}
        {pendingQuestion && (
          <div className="shrink-0 mb-4">
            <QuestionInput pendingQuestion={pendingQuestion} onSubmit={respondToQuestion} />
          </div>
        )}

        {/* 输入框 */}
        <div className="shrink-0">
          <ChatInput
            onSubmit={execute}
            onStop={stop}
            isRunning={isRunning}
            placeholder={
              skillId === 'financial-report'
                ? '例如：分析腾讯 2023 年财报的营收增长情况'
                : '输入你的问题...'
            }
          />
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
       * 分隔条（聊天面板和预览面板之间）
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
          {showLivePreview ? (
            /* Live Preview */
            <div className="flex h-full flex-col">
              <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Live Preview</span>
                  {liveStatus === 'running' && (
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  )}
                </div>
                <button
                  onClick={handleClosePreview}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <VitePreview
                  status={liveStatus}
                  previewUrl={previewUrl}
                  error={liveError}
                  onStart={handleStartLivePreview}
                  onStop={stopPreview}
                />
              </div>
            </div>
          ) : selectedArtifact ? (
            /* 静态预览 */
            <ArtifactPreview artifact={selectedArtifact} onClose={handleClosePreview} />
          ) : null}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
       * 右侧：侧边栏
       * ════════════════════════════════════════════════════════════════════ */}
      {isRightSidebarVisible && (
        <div style={{ width: SIDEBAR_WIDTH }} className="shrink-0">
          <RightSidebar
            messages={messages}
            isRunning={isRunning}
            artifacts={taskFiles}
            selectedArtifact={selectedArtifact}
            onSelectArtifact={handleSelectArtifact}
            getFileUrl={getFileUrl}
          />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
       * 清空对话确认框
       * ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={showClearDialog} onClose={() => setShowClearDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认清空对话</DialogTitle>
            <DialogDescription>
              清空后将删除当前所有对话记录，此操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowClearDialog(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleClear}>
              确认清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
