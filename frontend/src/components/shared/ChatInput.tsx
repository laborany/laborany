/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         聊天输入组件                                       ║
 * ║                                                                          ║
 * ║  支持多行输入、快捷键提交、运行状态控制、文件上传                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useRef, KeyboardEvent, ChangeEvent } from 'react'
import { FileIcon } from './FileIcon'

interface ChatInputProps {
  onSubmit: (query: string, files: File[]) => void
  onStop: () => void
  isRunning: boolean
  placeholder?: string
}

export default function ChatInput({
  onSubmit,
  onStop,
  isRunning,
  placeholder = '输入你的问题...',
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleSubmit() {
    const query = value.trim()
    if ((!query && files.length === 0) || isRunning) return

    // 如果只有文件没有文字，发送默认文字
    const finalQuery = query || (files.length > 0 ? '我上传了一些文件' : '')
    
    onSubmit(finalQuery, files)
    setValue('')
    setFiles([])

    // 重置高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl/Cmd + Enter 提交
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleInput() {
    /* ═════════════════════════════════════════════════════════════════════
     *  自动调整 textarea 高度
     *  • 初始高度自适应内容
     *  • 最大高度 400px，超出后显示滚动条
     *  • 配合 wrap="soft" 实现自动换行
     * ═════════════════════════════════════════════════════════════════════ */
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 400)}px`
    }
  }

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)])
    }
    // 重置 input 以便允许重复选择同名文件
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  function getFileExt(filename: string) {
    return filename.split('.').pop() || ''
  }

  return (
    <div className="border border-border rounded-lg bg-card">
      {/* 文件列表 */}
      {files.length > 0 && (
        <div className="px-4 py-2 flex flex-wrap gap-2 border-b border-border/50">
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-2 bg-muted/50 px-2 py-1 rounded text-sm text-foreground group"
            >
              <FileIcon type={getFileExt(file.name)} />
              <span className="truncate max-w-[150px]">{file.name}</span>
              <button
                onClick={() => removeFile(index)}
                className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder={placeholder}
        disabled={isRunning}
        rows={1}
        wrap="soft"
        className="w-full px-4 py-3 overflow-y-auto resize-none focus:outline-none disabled:bg-muted bg-transparent text-foreground placeholder:text-muted-foreground"
      />
      <div className="flex justify-between items-center px-4 py-2 border-t border-border">
        <div className="flex items-center gap-4">
          <input
            type="file"
            multiple
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="上传文件"
            disabled={isRunning}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <span className="text-xs text-muted-foreground">Ctrl + Enter 发送</span>
        </div>
        
        {isRunning ? (
          <button
            onClick={onStop}
            className="btn-destructive px-4 py-1.5 text-sm"
          >
            停止
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!value.trim() && files.length === 0}
            className="btn-primary px-4 py-1.5 text-sm"
          >
            发送
          </button>
        )}
      </div>
    </div>
  )
}
