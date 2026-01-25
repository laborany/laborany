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
    <div className="border border-gray-300 rounded-lg bg-white">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder={placeholder}
        disabled={isRunning}
        rows={1}
        className="w-full px-4 py-3 resize-none focus:outline-none disabled:bg-gray-50"
      />
      <div className="flex justify-between items-center px-4 py-2 border-t border-gray-100">
        <span className="text-xs text-gray-400">Ctrl + Enter 发送</span>
        {isRunning ? (
          <button
            onClick={onStop}
            className="px-4 py-1.5 bg-red-500 text-white text-sm rounded hover:bg-red-600"
          >
            停止
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="px-4 py-1.5 bg-primary-600 text-white text-sm rounded hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            发送
          </button>
        )}
      </div>
    </div>
  )
}
