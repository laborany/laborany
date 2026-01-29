/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       预览弹窗组件                                        ║
 * ║                                                                          ║
 * ║  设计哲学：                                                               ║
 * ║  1. 可复用的 Modal 容器，包装 ArtifactPreview                              ║
 * ║  2. 支持 ESC 键关闭、点击遮罩关闭                                          ║
 * ║  3. 简洁的接口，artifact 为 null 时不渲染                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useEffect, useCallback } from 'react'

import type { FileArtifact } from './types'
import { ArtifactPreview } from './ArtifactPreview'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           组件接口                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface PreviewModalProps {
  artifact: FileArtifact | null
  onClose: () => void
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           预览弹窗组件                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function PreviewModal({ artifact, onClose }: PreviewModalProps) {
  /* ── ESC 键关闭 ── */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (!artifact) return
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [artifact, handleKeyDown])

  /* ── 点击遮罩关闭 ── */
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose],
  )

  if (!artifact) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div className="w-[90vw] h-[85vh] max-w-6xl bg-background rounded-lg shadow-xl overflow-hidden">
        <ArtifactPreview artifact={artifact} onClose={onClose} />
      </div>
    </div>
  )
}
