/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       Artifact 预览主组件                                 ║
 * ║                                                                          ║
 * ║  设计哲学：                                                               ║
 * ║  1. 用 Map 映射替代 switch/case，消除分支判断                              ║
 * ║  2. 渲染器按需加载，保持主组件简洁                                          ║
 * ║  3. 统一的容器布局，渲染器只负责内容                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { ComponentType } from 'react'

import type { PreviewProps, RendererProps, FileCategory } from './types'
import { PreviewHeader } from './PreviewHeader'
import { HtmlRenderer } from './renderers/HtmlRenderer'
import { ImageRenderer } from './renderers/ImageRenderer'
import { CodeRenderer } from './renderers/CodeRenderer'
import { MarkdownRenderer } from './renderers/MarkdownRenderer'
import { PdfRenderer } from './renderers/PdfRenderer'
import { AudioRenderer } from './renderers/AudioRenderer'
import { VideoRenderer } from './renderers/VideoRenderer'
import { ExcelRenderer } from './renderers/ExcelRenderer'
import { DocxRenderer } from './renderers/DocxRenderer'
import { FallbackRenderer } from './renderers/FallbackRenderer'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      分类 → 渲染器 映射表                                  │
 * │                                                                          │
 * │  好品味：一张表决定渲染逻辑，新类型只需加一行                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const RENDERER_MAP: Record<FileCategory, ComponentType<RendererProps>> = {
  html: HtmlRenderer,
  image: ImageRenderer,
  code: CodeRenderer,
  markdown: MarkdownRenderer,
  pdf: PdfRenderer,
  audio: AudioRenderer,
  video: VideoRenderer,
  excel: ExcelRenderer,
  docx: DocxRenderer,
  binary: FallbackRenderer,
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function ArtifactPreview({ artifact, onClose }: PreviewProps) {
  if (!artifact) return null

  const Renderer = RENDERER_MAP[artifact.category]

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg">
      <PreviewHeader artifact={artifact} onClose={onClose} />
      <div className="flex-1 overflow-hidden">
        <Renderer artifact={artifact} />
      </div>
    </div>
  )
}
