/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       Artifact 预览主组件                                 ║
 * ║                                                                          ║
 * ║  设计哲学：                                                               ║
 * ║  1. 用 Map 映射替代 switch/case，消除分支判断                              ║
 * ║  2. 渲染器按需加载，保持主组件简洁                                          ║
 * ║  3. 统一的容器布局，渲染器只负责内容                                        ║
 * ║  4. 统一的文件大小检查，保护所有渲染器                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { ComponentType } from 'react'

import type { PreviewProps, RendererProps, FileCategory } from './types'
import { MAX_PREVIEW_SIZE } from './types'
import { PreviewHeader } from './PreviewHeader'
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
 * │                           主组件                                          │
 * │                                                                          │
 * │  好品味：文件大小检查在此统一处理，所有渲染器自动受益                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function ArtifactPreview({ artifact, onClose }: PreviewProps) {
  if (!artifact) return null

  const isTooLarge = artifact.size !== undefined && artifact.size > MAX_PREVIEW_SIZE
  const Renderer = RENDERER_MAP[artifact.category]

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg">
      <PreviewHeader artifact={artifact} onClose={onClose} />
      <div className="flex-1 overflow-hidden">
        {isTooLarge ? <FileTooLarge artifact={artifact} /> : <Renderer artifact={artifact} />}
      </div>
    </div>
  )
}
