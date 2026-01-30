/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Dialog 组件                                       ║
 * ║                                                                          ║
 * ║  模态对话框组件，支持标题、内容、底部操作区                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { ReactNode, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface DialogProps {
  open: boolean
  onClose: () => void
  children: ReactNode
}

interface DialogContentProps {
  children: ReactNode
  className?: string
}

interface DialogHeaderProps {
  children: ReactNode
}

interface DialogFooterProps {
  children: ReactNode
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Dialog 根组件                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function Dialog({ open, onClose, children }: DialogProps) {
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [open, handleEscape])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 bg-black/50 animate-in fade-in"
        onClick={onClose}
      />
      {/* 内容区 */}
      <div className="relative z-50 animate-in fade-in slide-in-from-bottom-1">
        {children}
      </div>
    </div>,
    document.body
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           子组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function DialogContent({ children, className = '' }: DialogContentProps) {
  return (
    <div
      className={`w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

function DialogHeader({ children }: DialogHeaderProps) {
  return <div className="mb-4">{children}</div>
}

function DialogTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-semibold text-foreground">{children}</h2>
}

function DialogDescription({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-sm text-muted-foreground">{children}</p>
}

function DialogFooter({ children }: DialogFooterProps) {
  return <div className="mt-6 flex justify-end gap-3">{children}</div>
}

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
}
