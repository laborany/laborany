/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       无头预览组件                                        ║
 * ║                                                                          ║
 * ║  设计哲学：                                                               ║
 * ║  1. 纯渲染层，不包含头部工具栏                                              ║
 * ║  2. 供其他组件组合使用，实现最大复用                                         ║
 * ║  3. 通过 Map 映射消除分支判断                                              ║
 * ║  4. 统一的文件大小检查，保护所有渲染器                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { ComponentType } from 'react'

import type { RendererProps, FileCategory, FileArtifact } from './types'
import { MAX_PREVIEW_SIZE } from './types'
import { FileTooLarge } from './FileTooLarge'
import {
  HtmlRenderer,
  ImageRenderer,
  CodeRenderer,
  MarkdownRenderer,
  PdfRenderer,
  AudioRenderer,
  VideoRenderer,
  ExcelRenderer,
  DocxRenderer,
  PptxRenderer,
  FontRenderer,
  FallbackRenderer,
} from './renderers'

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
  pptx: PptxRenderer,
  font: FontRenderer,
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
 * │                                                                          │
 * │  好品味：文件大小检查在此统一处理，所有渲染器自动受益                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function ArtifactPreviewCore({ artifact, className }: ArtifactPreviewCoreProps) {
  /* ┌────────────────────────────────────────────────────────────────────────┐
   * │  统一的文件大小守卫：超过阈值则拦截，无需每个渲染器重复判断                  │
   * └────────────────────────────────────────────────────────────────────────┘ */
  const isTooLarge = artifact.size !== undefined && artifact.size > MAX_PREVIEW_SIZE

  if (isTooLarge) {
    return (
      <div className={className}>
        <FileTooLarge artifact={artifact} />
      </div>
    )
  }

  const Renderer = RENDERER_MAP[artifact.category] || RENDERER_MAP.binary

  return (
    <div className={className}>
      <Renderer artifact={artifact} />
    </div>
  )
}
