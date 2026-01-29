/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Skill 执行页面                                    ║
 * ║                                                                          ║
 * ║  核心交互页面：输入查询 → 流式显示结果 → 查看产出文件 → 应用内预览              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useParams, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAgent, TaskFile } from '../hooks/useAgent'
import { useVitePreview } from '../hooks/useVitePreview'
import ChatInput from '../components/shared/ChatInput'
import MessageList from '../components/shared/MessageList'
import { ArtifactPreview, VitePreview, getExt, getCategory, isPreviewable } from '../components/preview'
import type { FileArtifact } from '../components/preview'

export default function ExecutePage() {
  const { skillId } = useParams<{ skillId: string }>()
  const {
    messages,
    isRunning,
    error,
    sessionId,
    taskFiles,
    workDir,
    execute,
    stop,
    clear,
    fetchTaskFiles,
    getFileUrl,
  } = useAgent(skillId || '')

  const [showFiles, setShowFiles] = useState(false)
  const [previewArtifact, setPreviewArtifact] = useState<FileArtifact | null>(null)
  const [showLivePreview, setShowLivePreview] = useState(false)

  // Live Preview Hook
  const {
    status: liveStatus,
    previewUrl,
    error: liveError,
    startPreview,
    stopPreview,
  } = useVitePreview(sessionId)

  // 打开预览
  const openPreview = (file: TaskFile) => {
    const ext = getExt(file.name)
    setPreviewArtifact({
      name: file.name,
      path: file.path,
      ext,
      category: getCategory(ext),
      size: file.size,
      url: getFileUrl(file.path),
    })
  }

  // 启动 Live Preview
  const handleStartLivePreview = () => {
    if (workDir) {
      setShowLivePreview(true)
      startPreview(workDir)
    }
  }

  // 执行完成后自动获取文件列表
  useEffect(() => {
    if (!isRunning && sessionId && messages.length > 0) {
      fetchTaskFiles()
    }
  }, [isRunning, sessionId, messages.length, fetchTaskFiles])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 h-[calc(100vh-64px)] flex flex-col">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between mb-4">
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
          {workDir && taskFiles.length > 0 && (
            <button
              onClick={() => setShowLivePreview(!showLivePreview)}
              className={`text-sm flex items-center gap-1.5 transition-colors ${
                showLivePreview ? 'text-green-500' : 'text-primary hover:text-primary/80'
              }`}
            >
              🚀 Live Preview
            </button>
          )}
          {taskFiles.length > 0 && (
            <button
              onClick={() => setShowFiles(!showFiles)}
              className="text-sm text-primary hover:text-primary/80 flex items-center gap-1.5 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              产出文件 ({countFiles(taskFiles)})
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={clear}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              清空对话
            </button>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* 文件列表面板 */}
      {showFiles && taskFiles.length > 0 && (
        <TaskFilesPanel
          files={taskFiles}
          getFileUrl={getFileUrl}
          onClose={() => setShowFiles(false)}
          onPreview={openPreview}
        />
      )}

      {/* 预览面板 */}
      {previewArtifact && (
        <div className="mb-4 h-96">
          <ArtifactPreview
            artifact={previewArtifact}
            onClose={() => setPreviewArtifact(null)}
          />
        </div>
      )}

      {/* Live Preview 面板 */}
      {showLivePreview && (
        <div className="mb-4 h-96">
          <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg">
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
              <span className="text-sm font-medium text-foreground">Live Preview</span>
              <button
                onClick={() => {
                  setShowLivePreview(false)
                  if (liveStatus === 'running') stopPreview()
                }}
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
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto mb-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-lg font-medium text-foreground mb-1">开始对话</p>
              <p className="text-sm">输入你的问题，AI 助手将为你分析</p>
            </div>
          </div>
        ) : (
          <MessageList messages={messages} />
        )}
      </div>

      {/* 输入框 */}
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
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       任务产出文件面板                                     │
 * │  智能检测：有步骤信息时按步骤分组，否则平铺展示                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function TaskFilesPanel({
  files,
  getFileUrl,
  onClose,
  onPreview,
}: {
  files: TaskFile[]
  getFileUrl: (path: string) => string
  onClose: () => void
  onPreview: (file: TaskFile) => void
}) {
  // 检测是否有步骤目录（step-N-* 格式）
  const hasStepDirs = files.some(f => f.stepIndex !== undefined)

  return (
    <div className="mb-4 card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <h3 className="font-medium text-foreground">产出文件</h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-4 max-h-64 overflow-y-auto">
        {hasStepDirs ? (
          <StepGroupedFiles files={files} getFileUrl={getFileUrl} onPreview={onPreview} />
        ) : (
          <FileTree files={files} getFileUrl={getFileUrl} depth={0} onPreview={onPreview} />
        )}
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       按步骤分组展示文件                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function StepGroupedFiles({
  files,
  getFileUrl,
  onPreview,
}: {
  files: TaskFile[]
  getFileUrl: (path: string) => string
  onPreview: (file: TaskFile) => void
}) {
  // 分离步骤目录和普通文件
  const stepDirs = files.filter(f => f.stepIndex !== undefined).sort((a, b) => (a.stepIndex ?? 0) - (b.stepIndex ?? 0))
  const otherFiles = files.filter(f => f.stepIndex === undefined)

  return (
    <div className="space-y-3">
      {stepDirs.map((stepDir) => (
        <div key={stepDir.path} className="border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 text-sm font-medium text-foreground">
            <span className="text-primary">📋</span>
            <span>步骤 {(stepDir.stepIndex ?? 0) + 1}: {stepDir.stepName}</span>
          </div>
          <div className="px-3 py-2">
            {stepDir.children && stepDir.children.length > 0 ? (
              <FileTree files={stepDir.children} getFileUrl={getFileUrl} depth={0} onPreview={onPreview} />
            ) : (
              <span className="text-sm text-muted-foreground">无文件</span>
            )}
          </div>
        </div>
      ))}
      {otherFiles.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 text-sm font-medium text-foreground">
            <span>📁</span>
            <span>其他文件</span>
          </div>
          <div className="px-3 py-2">
            <FileTree files={otherFiles} getFileUrl={getFileUrl} depth={0} onPreview={onPreview} />
          </div>
        </div>
      )}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       文件树组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function FileTree({
  files,
  getFileUrl,
  depth,
  onPreview,
}: {
  files: TaskFile[]
  getFileUrl: (path: string) => string
  depth: number
  onPreview: (file: TaskFile) => void
}) {
  return (
    <div className="space-y-1">
      {files.map((file) => (
        <div key={file.path} style={{ marginLeft: depth * 16 }}>
          {file.type === 'folder' ? (
            <div>
              <div className="flex items-center gap-2 py-1.5 text-sm text-muted-foreground">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span>{file.name}</span>
              </div>
              {file.children && (
                <FileTree
                  files={file.children}
                  getFileUrl={getFileUrl}
                  depth={depth + 1}
                  onPreview={onPreview}
                />
              )}
            </div>
          ) : (
            <FileItem file={file} getFileUrl={getFileUrl} onPreview={onPreview} />
          )}
        </div>
      ))}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       单个文件项                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function FileItem({
  file,
  getFileUrl,
  onPreview,
}: {
  file: TaskFile
  getFileUrl: (path: string) => string
  onPreview: (file: TaskFile) => void
}) {
  const url = getFileUrl(file.path)
  const ext = file.ext || ''
  const canPreview = isPreviewable(ext)
  const icon = getFileIcon(ext)
  const size = file.size ? formatFileSize(file.size) : ''

  return (
    <div className="flex items-center justify-between py-1.5 text-sm hover:bg-accent rounded-md px-2 -mx-2 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span>{icon}</span>
        <span className="truncate text-foreground">{file.name}</span>
        {size && <span className="text-xs text-muted-foreground">({size})</span>}
      </div>
      <div className="flex items-center gap-2 ml-2">
        {canPreview && (
          <button
            onClick={() => onPreview(file)}
            className="text-xs text-primary hover:text-primary/80 transition-colors"
          >
            预览
          </button>
        )}
        <a
          href={url}
          download={file.name}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          下载
        </a>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           辅助函数                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function countFiles(files: TaskFile[]): number {
  let count = 0
  for (const file of files) {
    if (file.type === 'file') {
      count++
    } else if (file.children) {
      count += countFiles(file.children)
    }
  }
  return count
}

function getFileIcon(ext: string): string {
  const icons: Record<string, string> = {
    html: '🌐',
    htm: '🌐',
    pdf: '📕',
    doc: '📘',
    docx: '📘',
    xls: '📗',
    xlsx: '📗',
    ppt: '📙',
    pptx: '📙',
    png: '🖼️',
    jpg: '🖼️',
    jpeg: '🖼️',
    gif: '🖼️',
    svg: '🖼️',
    txt: '📄',
    md: '📝',
    json: '📋',
    csv: '📊',
    py: '🐍',
    js: '📜',
    ts: '📜',
  }
  return icons[ext] || '📄'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
