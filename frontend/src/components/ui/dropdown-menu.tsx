/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         DropdownMenu 组件                                 ║
 * ║                                                                          ║
 * ║  下拉菜单组件，支持触发器、菜单项、分隔符                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { CSSProperties, MutableRefObject, ReactNode, useState, useRef, useEffect, createContext, useContext, useCallback } from 'react'
import { createPortal } from 'react-dom'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Context                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface DropdownContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  triggerRef: MutableRefObject<HTMLElement | null>
}

const DropdownContext = createContext<DropdownContextValue | null>(null)

function useDropdown() {
  const ctx = useContext(DropdownContext)
  if (!ctx) throw new Error('useDropdown must be used within DropdownMenu')
  return ctx
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           DropdownMenu 根组件                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function DropdownMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLElement | null>(null)

  return (
    <DropdownContext.Provider value={{ open, setOpen, triggerRef }}>
      <div className="inline-flex">{children}</div>
    </DropdownContext.Provider>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           触发器                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function DropdownMenuTrigger({ children, asChild }: { children: ReactNode; asChild?: boolean }) {
  const { open, setOpen, triggerRef } = useDropdown()

  const handleToggle = () => setOpen(!open)

  if (asChild) {
    return (
      <span
        ref={(node) => {
          triggerRef.current = node
        }}
        onClick={handleToggle}
        className="inline-flex"
      >
        {children}
      </span>
    )
  }

  return (
    <button
      ref={(node) => {
        triggerRef.current = node
      }}
      onClick={handleToggle}
      className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
    >
      {children}
    </button>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           菜单内容                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function DropdownMenuContent({
  children,
  align = 'start',
  side = 'bottom',
  className,
}: {
  children: ReactNode
  align?: 'start' | 'end'
  side?: 'top' | 'bottom'
  className?: string
}) {
  const { open, setOpen, triggerRef } = useDropdown()
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number; side: 'top' | 'bottom'; minWidth: number } | null>(null)

  const updatePosition = useCallback(() => {
    const triggerEl = triggerRef.current
    const contentEl = ref.current
    if (!triggerEl || !contentEl) return

    const triggerRect = triggerEl.getBoundingClientRect()
    const contentRect = contentEl.getBoundingClientRect()

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const margin = 8
    const gap = 6

    const spaceAbove = triggerRect.top - margin
    const spaceBelow = viewportHeight - triggerRect.bottom - margin

    let resolvedSide = side
    if (side === 'top' && spaceAbove < contentRect.height && spaceBelow > spaceAbove) {
      resolvedSide = 'bottom'
    } else if (side === 'bottom' && spaceBelow < contentRect.height && spaceAbove > spaceBelow) {
      resolvedSide = 'top'
    }

    let top = resolvedSide === 'top'
      ? triggerRect.top - contentRect.height - gap
      : triggerRect.bottom + gap
    top = Math.max(margin, Math.min(top, viewportHeight - contentRect.height - margin))

    let left = align === 'end'
      ? triggerRect.right - contentRect.width
      : triggerRect.left
    left = Math.max(margin, Math.min(left, viewportWidth - contentRect.width - margin))

    setPosition((prev) => {
      if (
        prev &&
        Math.abs(prev.top - top) < 0.5 &&
        Math.abs(prev.left - left) < 0.5 &&
        Math.abs(prev.minWidth - triggerRect.width) < 0.5 &&
        prev.side === resolvedSide
      ) {
        return prev
      }
      return { top, left, side: resolvedSide, minWidth: triggerRect.width }
    })
  }, [align, side, triggerRef])

  useEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }

    const raf = requestAnimationFrame(updatePosition)

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updatePosition)
      : null
    if (resizeObserver && triggerRef.current) resizeObserver.observe(triggerRef.current)
    if (resizeObserver && ref.current) resizeObserver.observe(ref.current)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      resizeObserver?.disconnect()
    }
  }, [open, setOpen, triggerRef, updatePosition])

  useEffect(() => {
    if (open) updatePosition()
  }, [open, updatePosition])

  if (!open) return null

  if (typeof document === 'undefined') return null

  const contentStyle: CSSProperties = position
    ? {
      position: 'fixed',
      top: position.top,
      left: position.left,
      minWidth: position.minWidth,
      zIndex: 80,
    }
    : {
      position: 'fixed',
      visibility: 'hidden',
      zIndex: 80,
    }

  const sideClass = position?.side === 'top' ? 'slide-in-from-bottom-1' : 'slide-in-from-top-1'

  return createPortal(
    <div
      ref={ref}
      style={contentStyle}
      className={`min-w-[8rem] rounded-lg border border-border bg-card p-1 shadow-lg animate-in fade-in ${sideClass} ${className ?? ''}`}
    >
      {children}
    </div>,
    document.body
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           菜单项                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function DropdownMenuItem({
  children,
  onClick,
  disabled,
  className,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
}) {
  const { setOpen } = useDropdown()

  const handleClick = () => {
    if (disabled) return
    onClick?.()
    setOpen(false)
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`flex w-full items-center rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           分隔符                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function DropdownMenuSeparator() {
  return <div className="my-1 h-px bg-border" />
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
}
