/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       无头预览组件                                        ║
 * ║                                                                          ║
 * ║  设计哲学：                                                               ║
 * ║  1. 纯渲染层，不包含头部工具栏                                              ║
 * ║  2. 供其他组件组合使用，实现最大复用                                         ║
 * ║  3. 通过 Map 映射消除分支判断                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { ComponentType } from 'react'

import type { RendererProps, FileCategory, FileArtifact } from './types'
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
 * │                           组件接口                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface ArtifactPreviewCoreProps {
  artifact: FileArtifact
  className?: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           无头预览组件                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function ArtifactPreviewCore({ artifact, className }: ArtifactPreviewCoreProps) {
  const Renderer = RENDERER_MAP[artifact.category] || RENDERER_MAP.binary

  return (
    <div className={className}>
      <Renderer artifact={artifact} />
    </div>
  )
}
