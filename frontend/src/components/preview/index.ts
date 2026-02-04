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
export {
  CodeRenderer,
  MarkdownRenderer,
  ImageRenderer,
  HtmlRenderer,
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
 * │                           辅助组件                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export { FileTooLarge } from './FileTooLarge'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           工具函数                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export { getExt, getCategory, getLang, isPreviewable, formatSize, getFileIcon, openFileExternal } from './utils'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export type { FileArtifact, FileCategory, PreviewProps, RendererProps, PptxSlide, PreviewMode, ViewMode } from './types'
export { MAX_PREVIEW_SIZE } from './types'
