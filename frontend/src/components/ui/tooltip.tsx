/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Tooltip 组件                                      ║
 * ║                                                                          ║
 * ║  轻量级提示组件，hover 时显示                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { ReactNode, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Tooltip 组件                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function Tooltip({ content, children, side = 'top', delay = 200 }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLSpanElement>(null)
  const timeoutRef = useRef<number>()

  const updatePosition = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const offset = 8

    const positions = {
      top: { top: rect.top - offset, left: rect.left + rect.width / 2 },
      bottom: { top: rect.bottom + offset, left: rect.left + rect.width / 2 },
      left: { top: rect.top + rect.height / 2, left: rect.left - offset },
      right: { top: rect.top + rect.height / 2, left: rect.right + offset },
    }

    setPosition(positions[side])
  }

  const handleMouseEnter = () => {
    timeoutRef.current = window.setTimeout(() => {
      updatePosition()
      setVisible(true)
    }, delay)
  }

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setVisible(false)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const transformOrigin = {
    top: 'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
    left: 'translate(-100%, -50%)',
    right: 'translate(0, -50%)',
  }

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-block"
      >
        {children}
      </span>
      {visible &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: position.top,
              left: position.left,
              transform: transformOrigin[side],
              zIndex: 9999,
            }}
            className="rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md animate-in fade-in"
          >
            {content}
          </div>,
          document.body
        )}
    </>
  )
}
