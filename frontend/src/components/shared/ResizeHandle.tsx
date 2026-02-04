/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         ResizeHandle 组件                                 ║
 * ║                                                                          ║
 * ║  设计哲学：                                                               ║
 * ║  1. 简洁至上 —— 只做一件事：拖拽调整宽度                                     ║
 * ║  2. 无状态 —— 宽度由父组件管理                                              ║
 * ║  3. 好品味 —— 用 pointer events 替代复杂的 mouse/touch 分支                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useCallback, useRef, useEffect, useState } from 'react'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface ResizeHandleProps {
  onResize: (delta: number) => void
  onResizeEnd?: () => void
  direction?: 'horizontal' | 'vertical'
  className?: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function ResizeHandle({
  onResize,
  onResizeEnd,
  direction = 'horizontal',
  className = '',
}: ResizeHandleProps) {
  const isDraggingRef = useRef(false)
  const startPosRef = useRef(0)

  /* ────────────────────────────────────────────────────────────────────────
   * 开始拖拽
   * ──────────────────────────────────────────────────────────────────────── */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      isDraggingRef.current = true
      startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [direction]
  )

  /* ────────────────────────────────────────────────────────────────────────
   * 拖拽中
   * ──────────────────────────────────────────────────────────────────────── */
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return

      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY
      const delta = currentPos - startPosRef.current
      startPosRef.current = currentPos
      onResize(delta)
    },
    [direction, onResize]
  )

  /* ────────────────────────────────────────────────────────────────────────
   * 结束拖拽
   * ──────────────────────────────────────────────────────────────────────── */
  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current) return

    isDraggingRef.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    onResizeEnd?.()
  }, [onResizeEnd])

  /* ────────────────────────────────────────────────────────────────────────
   * 清理：组件卸载时重置样式
   * ──────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [])

  const isHorizontal = direction === 'horizontal'

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`
        ${isHorizontal ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}
        bg-border hover:bg-primary/50 active:bg-primary
        transition-colors duration-150
        flex-shrink-0
        ${className}
      `}
      style={{ touchAction: 'none' }}
    />
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           useResizablePanel Hook                          │
 * │  管理面板宽度状态，提供拖拽回调                                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface UseResizablePanelOptions {
  initialWidth: number
  minWidth?: number
  maxWidth?: number
  storageKey?: string
}

export function useResizablePanel({
  initialWidth,
  minWidth = 200,
  maxWidth = 800,
  storageKey,
}: UseResizablePanelOptions) {
  const [width, setWidth] = useState(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey)
      if (saved) return Math.max(minWidth, Math.min(maxWidth, parseInt(saved, 10)))
    }
    return initialWidth
  })

  const handleResize = useCallback(
    (delta: number) => {
      setWidth((w) => Math.max(minWidth, Math.min(maxWidth, w + delta)))
    },
    [minWidth, maxWidth]
  )

  const handleResizeEnd = useCallback(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, String(width))
    }
  }, [storageKey, width])

  return { width, handleResize, handleResizeEnd, setWidth }
}
