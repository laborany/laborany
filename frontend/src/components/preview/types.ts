/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      Artifact Preview 类型定义                            ║
 * ║                                                                          ║
 * ║  设计哲学：用 Map 映射消除 switch/case，让类型自然流动                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           文件分类                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export type FileCategory =
  | 'html'
  | 'image'
  | 'code'
  | 'markdown'
  | 'pdf'
  | 'audio'
  | 'video'
  | 'excel'
  | 'docx'
  | 'binary'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           文件 Artifact                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface FileArtifact {
  name: string
  path: string
  category: FileCategory
  ext: string
  size?: number
  url: string
  content?: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           组件 Props                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface PreviewProps {
  artifact: FileArtifact | null
  onClose: () => void
}

export interface RendererProps {
  artifact: FileArtifact
}
