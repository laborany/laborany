/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       PreviewPanel 预览面板                              ║
 * ║                                                                          ║
 * ║  设计哲学：                                                               ║
 * ║  1. 双模式 —— 静态预览 + Live Preview，互斥切换                            ║
 * ║  2. 零分支 —— 用条件渲染替代 if/else 嵌套                                  ║
 * ║  3. 单一职责 —— 只负责预览区域的容器与切换逻辑                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { ArtifactPreview, VitePreview } from '../preview'
import type { FileArtifact } from '../preview'
import type { PreviewStatus } from '../../hooks/useVitePreview'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Props 定义                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface PreviewPanelProps {
  /* 静态预览 */
  selectedArtifact: FileArtifact | null
  /* Live Preview */
  showLivePreview: boolean
  liveStatus: PreviewStatus
  previewUrl: string | null
  liveError: string | null
  onStartLive: () => void
  onStopLive: () => void
  /* 关闭 */
  onClose: () => void
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Live 预览头部                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function LiveHeader({ status, onClose }: { status: PreviewStatus; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">Live Preview</span>
        {status === 'running' && (
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        )}
      </div>
      <CloseButton onClick={onClose} />
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           关闭按钮（复用）                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function PreviewPanel({
  selectedArtifact,
  showLivePreview,
  liveStatus,
  previewUrl,
  liveError,
  onStartLive,
  onStopLive,
  onClose,
}: PreviewPanelProps) {
  /* Live Preview 模式 */
  if (showLivePreview) {
    return (
      <div className="flex h-full flex-col">
        <LiveHeader status={liveStatus} onClose={onClose} />
        <div className="flex-1 overflow-hidden">
          <VitePreview
            status={liveStatus}
            previewUrl={previewUrl}
            error={liveError}
            onStart={onStartLive}
            onStop={onStopLive}
          />
        </div>
      </div>
    )
  }

  /* 静态预览模式 */
  if (selectedArtifact) {
    return <ArtifactPreview artifact={selectedArtifact} onClose={onClose} />
  }

  return null
}
