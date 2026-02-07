/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         聊天输入组件                                       ║
 * ║                                                                          ║
 * ║  支持多行输入、快捷键提交、运行状态控制、文件上传、图片粘贴                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useRef, useEffect, useCallback, KeyboardEvent, ChangeEvent, ClipboardEvent, DragEvent } from 'react'
import { FileIcon } from './FileIcon'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../ui'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           常量定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const MAX_FILE_SIZE = 10 * 1024 * 1024  // 10MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024  // 5MB

/* 可接受的文件类型 —— 与 preview/utils.ts 已支持的类型对齐 */
const ACCEPTED_FILE_TYPES = [
  'image/*',
  '.pdf', '.doc', '.docx', '.txt', '.md',
  '.json', '.csv', '.xlsx', '.xls', '.xlsm',
  '.pptx', '.ppt',
  '.html', '.htm', '.xml', '.yaml', '.yml',
  '.py', '.js', '.ts', '.jsx', '.tsx',
  '.svg', '.zip',
].join(',')

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface Attachment {
  id: string
  file: File
  type: 'image' | 'file'
  preview?: string  // 图片的 base64 预览
  error?: string    // 文件错误信息
}

type ChatInputVariant = 'home' | 'reply'

interface ChatInputProps {
  onSubmit: (query: string, files: File[]) => void
  onStop: () => void
  isRunning: boolean
  placeholder?: string
  autoFocus?: boolean
  variant?: ChatInputVariant
}

export default function ChatInput({
  onSubmit,
  onStop,
  isRunning,
  placeholder = '输入你的问题...',
  autoFocus = false,
  variant = 'reply',
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const prevIsRunningRef = useRef(isRunning)

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                       任务完成后自动聚焦                                   │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  useEffect(() => {
    if (prevIsRunningRef.current && !isRunning) {
      textareaRef.current?.focus()
    }
    prevIsRunningRef.current = isRunning
  }, [isRunning])

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus()
  }, [autoFocus])

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                       添加文件/图片（含大小校验）                           │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const addFiles = useCallback(async (files: File[], forceImage = false) => {
    const newAttachments: Attachment[] = []

    for (const file of files) {
      const isImage = forceImage || file.type.startsWith('image/')
      const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_FILE_SIZE
      const attachment: Attachment = {
        id: crypto.randomUUID(),
        file,
        type: isImage ? 'image' : 'file',
      }

      // 文件大小校验
      if (file.size > maxSize) {
        const limitMB = maxSize / (1024 * 1024)
        attachment.error = `文件超过 ${limitMB}MB 限制`
      } else if (isImage) {
        // 为图片生成预览
        attachment.preview = await readFileAsDataURL(file)
      }

      newAttachments.push(attachment)
    }

    setAttachments((prev) => [...prev, ...newAttachments])
  }, [])

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                       图片粘贴处理                                        │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const items = e.clipboardData.items
      const imageFiles: File[] = []

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) imageFiles.push(file)
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault()
        await addFiles(imageFiles, true)
      }
    },
    [addFiles]
  )

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                       拖拽上传处理                                        │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    addFiles(Array.from(e.dataTransfer.files))
  }, [addFiles])

  function handleSubmit() {
    const query = value.trim()
    // 过滤掉有错误的附件
    const validAttachments = attachments.filter((a) => !a.error)
    if ((!query && validAttachments.length === 0) || isRunning) return

    const finalQuery = query || (validAttachments.length > 0 ? '我上传了一些文件' : '')
    const files = validAttachments.map((a) => a.file)

    onSubmit(finalQuery, files)
    setValue('')
    setAttachments([])

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleInput() {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 400)}px`
    }
  }

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      addFiles(Array.from(e.target.files))
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const validAttachments = attachments.filter((a) => !a.error)

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                       响应式样式                                          │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const containerStyles = variant === 'home'
    ? 'border border-border rounded-2xl bg-card shadow-lg'
    : 'border border-border rounded-lg bg-card'

  const textareaStyles = variant === 'home'
    ? 'w-full px-5 py-4 overflow-y-auto resize-none focus:outline-none disabled:bg-muted bg-transparent text-foreground placeholder:text-muted-foreground text-base'
    : 'w-full px-4 py-3 overflow-y-auto resize-none focus:outline-none disabled:bg-muted bg-transparent text-foreground placeholder:text-muted-foreground'

  return (
    <div
      className={`${containerStyles} relative transition-all ${isDragOver ? 'ring-2 ring-primary ring-offset-2' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 拖拽悬停提示 */}
      {isDragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/5 rounded-lg pointer-events-none">
          <span className="text-sm font-medium text-primary">松开鼠标上传文件</span>
        </div>
      )}
      {/* 附件预览区 */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 flex flex-wrap gap-2 border-b border-border/50">
          {attachments.map((attachment) => (
            <AttachmentPreview
              key={attachment.id}
              attachment={attachment}
              onRemove={() => removeAttachment(attachment.id)}
            />
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        onPaste={handlePaste}
        placeholder={placeholder}
        disabled={isRunning}
        rows={variant === 'home' ? 2 : 1}
        wrap="soft"
        className={textareaStyles}
      />
      <div className="flex justify-between items-center px-4 py-2 border-t border-border">
        <div className="flex items-center gap-4">
          <input
            type="file"
            multiple
            accept={ACCEPTED_FILE_TYPES}
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileSelect}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md p-1.5 transition-colors disabled:opacity-50"
                disabled={isRunning}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                上传文件或图片
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="text-xs text-muted-foreground">Ctrl + Enter 发送</span>
        </div>

        {isRunning ? (
          <button onClick={onStop} className="btn-destructive px-4 py-1.5 text-sm">
            停止
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!value.trim() && validAttachments.length === 0}
            className="btn-primary px-4 py-1.5 text-sm"
          >
            发送
          </button>
        )}
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       附件预览组件                                        │
 * │  图片显示缩略图，文件显示图标，错误显示红色边框                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function AttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: Attachment
  onRemove: () => void
}) {
  const isImage = attachment.type === 'image'
  const hasError = !!attachment.error

  if (isImage && attachment.preview && !hasError) {
    return (
      <div className="relative group">
        <img
          src={attachment.preview}
          alt={attachment.file.name}
          className="h-16 w-16 object-cover rounded-lg border border-border"
        />
        <button
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded text-sm group ${hasError ? 'bg-destructive/10 border border-destructive/20' : 'bg-muted/50'}`}>
      <FileIcon type={getFileExt(attachment.file.name)} />
      <div className="flex flex-col min-w-0">
        <span className={`truncate max-w-[150px] ${hasError ? 'text-destructive' : 'text-foreground'}`}>
          {attachment.file.name}
        </span>
        {hasError && (
          <span className="text-xs text-destructive">{attachment.error}</span>
        )}
      </div>
      <button
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           辅助函数                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getFileExt(filename: string): string {
  return filename.split('.').pop() || ''
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
