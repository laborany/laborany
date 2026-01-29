/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       Preview 模块导出入口                                ║
 * ║                                                                          ║
 * ║  设计哲学：                                                               ║
 * ║  1. 统一导出，让消费者按需引入                                              ║
 * ║  2. 组件、渲染器、工具函数、类型分层导出                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export { ArtifactPreview } from './ArtifactPreview'
export { ArtifactPreviewCore } from './ArtifactPreviewCore'
export { PreviewModal } from './PreviewModal'
export { VitePreview } from './VitePreview'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           渲染器（供高级用法）                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export { CodeRenderer } from './renderers/CodeRenderer'
export { MarkdownRenderer } from './renderers/MarkdownRenderer'
export { ImageRenderer } from './renderers/ImageRenderer'
export { HtmlRenderer } from './renderers/HtmlRenderer'
export { PdfRenderer } from './renderers/PdfRenderer'
export { AudioRenderer } from './renderers/AudioRenderer'
export { VideoRenderer } from './renderers/VideoRenderer'
export { ExcelRenderer } from './renderers/ExcelRenderer'
export { DocxRenderer } from './renderers/DocxRenderer'
export { FallbackRenderer } from './renderers/FallbackRenderer'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           工具函数                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export { getExt, getCategory, getLang, isPreviewable, formatSize, getFileIcon } from './utils'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export type { FileArtifact, FileCategory, PreviewProps, RendererProps } from './types'
