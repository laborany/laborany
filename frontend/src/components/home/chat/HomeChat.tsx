/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      首页对话框 - HomeChat                              ║
 * ║                                                                          ║
 * ║  核心理念：对话框是唯一执行入口                                            ║
 * ║  用户输入 → onExecute 回调 → HomePage 编排调度                           ║
 * ║                                                                          ║
 * ║  有选中案例 → onExecute(targetId, query) → 跳转执行                     ║
 * ║  无选中案例 → onExecute('', query) → 进入 converse 决策                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, type FormEvent } from 'react'
import { SmartSuggestion } from './SmartSuggestion'
import type { QuickStartItem } from '../../../contexts/QuickStartContext'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface HomeChatProps {
  onExecute: (targetId: string, query: string) => void
  selectedCase: QuickStartItem | null
  onClearSelectedCase: () => void
}

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      主组件 - 首页对话框                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */
export function HomeChat({ onExecute, selectedCase, onClearSelectedCase }: HomeChatProps) {
  const [input, setInput] = useState('')

  /* ────────────────────────────────────────────────────────────────────────
   *  提交：有选中案例传 targetId，否则传空串走编排
   * ──────────────────────────────────────────────────────────────────────── */
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const q = input.trim()
    if (!q) return
    onExecute(selectedCase?.targetId || '', q)
    setInput('')
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  智能建议选中 → 直接执行（带 capabilityId）
   * ──────────────────────────────────────────────────────────────────────── */
  const handleSuggestionSelect = (match: { id: string; name: string; type: string }) => {
    onExecute(match.id, input.trim() || match.name)
  }

  return (
    <div className="w-full space-y-3">
      {/* 选中案例标签 */}
      {selectedCase && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-primary/10 border border-primary/30 text-primary">
          <span>{selectedCase.icon || '🔧'}</span>
          <span>{selectedCase.name}</span>
          <button
            onClick={onClearSelectedCase}
            className="ml-1 hover:text-primary/70"
          >
            ×
          </button>
        </div>
      )}

      {/* 输入框 */}
      <form onSubmit={handleSubmit} className="relative">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={selectedCase
            ? `向 ${selectedCase.name} 描述你的任务...`
            : '描述你想完成的任务...'
          }
          className={
            'w-full px-4 py-3 pr-20 rounded-lg border border-border bg-card ' +
            'text-foreground placeholder:text-muted-foreground ' +
            'focus:outline-none focus:ring-2 focus:ring-primary/50'
          }
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className={
            'absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-md text-sm ' +
            'bg-primary text-primary-foreground hover:bg-primary/90 ' +
            'disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
          }
        >
          发送
        </button>
        <SmartSuggestion
          query={input}
          visible={input.length >= 2 && !selectedCase}
          onSelect={handleSuggestionSelect}
        />
      </form>
    </div>
  )
}
