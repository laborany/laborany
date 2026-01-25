/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         聊天输入组件                                       ║
 * ║                                                                          ║
 * ║  支持多行输入、快捷键提交、运行状态控制                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useRef, KeyboardEvent } from 'react'

interface ChatInputProps {
  onSubmit: (query: string) => void
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSubmit() {
    const query = value.trim()
    if (!query || isRunning) return

    onSubmit(query)
    setValue('')

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
    // 自动调整高度
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }

  return (
    <div className="border border-border rounded-lg bg-card">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder={placeholder}
        disabled={isRunning}
        rows={1}
        className="w-full px-4 py-3 resize-none focus:outline-none disabled:bg-muted bg-transparent text-foreground placeholder:text-muted-foreground"
      />
      <div className="flex justify-between items-center px-4 py-2 border-t border-border">
        <span className="text-xs text-muted-foreground">Ctrl + Enter 发送</span>
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
            disabled={!value.trim()}
            className="btn-primary px-4 py-1.5 text-sm"
          >
            发送
          </button>
        )}
      </div>
    </div>
  )
}
