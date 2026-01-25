/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Skill 执行页面                                    ║
 * ║                                                                          ║
 * ║  核心交互页面：输入查询 → 流式显示结果 → 查看产出文件                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useParams, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAgent, TaskFile } from '../hooks/useAgent'
import ChatInput from '../components/shared/ChatInput'
import MessageList from '../components/shared/MessageList'

export default function ExecutePage() {
  const { skillId } = useParams<{ skillId: string }>()
  const {
    messages,
    isRunning,
    error,
    sessionId,
    taskFiles,
    execute,
    stop,
    clear,
    fetchTaskFiles,
    getFileUrl,
  } = useAgent(skillId || '')

  const [showFiles, setShowFiles] = useState(false)

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
        />
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
 * └──────────────────────────────────────────────────────────────────────────┘ */
function TaskFilesPanel({
  files,
  getFileUrl,
  onClose,
}: {
  files: TaskFile[]
  getFileUrl: (path: string) => string
  onClose: () => void
}) {
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
        <FileTree files={files} getFileUrl={getFileUrl} depth={0} />
      </div>
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
}: {
  files: TaskFile[]
  getFileUrl: (path: string) => string
  depth: number
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
                />
              )}
            </div>
          ) : (
            <FileItem file={file} getFileUrl={getFileUrl} />
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
}: {
  file: TaskFile
  getFileUrl: (path: string) => string
}) {
  const url = getFileUrl(file.path)
  const isPreviewable = ['html', 'htm', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'pdf', 'txt', 'md'].includes(
    file.ext || '',
  )

  const icon = getFileIcon(file.ext || '')
  const size = file.size ? formatFileSize(file.size) : ''

  return (
    <div className="flex items-center justify-between py-1.5 text-sm hover:bg-accent rounded-md px-2 -mx-2 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span>{icon}</span>
        <span className="truncate text-foreground">{file.name}</span>
        {size && <span className="text-xs text-muted-foreground">({size})</span>}
      </div>
      <div className="flex items-center gap-2 ml-2">
        {isPreviewable && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:text-primary/80 transition-colors"
          >
            预览
          </a>
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
