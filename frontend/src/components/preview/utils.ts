/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      Artifact Preview 工具函数                            ║
 * ║                                                                          ║
 * ║  设计哲学：用 Map 映射替代条件分支，让扩展名自然映射到分类                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { FileCategory } from './types'
import { openFileExternal } from '../../lib/system-open'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      扩展名 → 分类 映射表                                  │
 * │                                                                          │
 * │  好品味：一张表消除所有 if/else，新类型只需加一行                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const EXT_CATEGORY_MAP: Record<string, FileCategory> = {
  // HTML
  html: 'html', htm: 'html',
  // 图片
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
  svg: 'image', webp: 'image', bmp: 'image', ico: 'image',
  // Markdown
  md: 'markdown', markdown: 'markdown',
  // 代码
  js: 'code', jsx: 'code', ts: 'code', tsx: 'code',
  py: 'code', rb: 'code', go: 'code', rs: 'code',
  java: 'code', c: 'code', cpp: 'code', h: 'code', hpp: 'code',
  css: 'code', scss: 'code', less: 'code',
  json: 'code', xml: 'code', yaml: 'code', yml: 'code',
  sql: 'code', sh: 'code', bash: 'code', zsh: 'code',
  toml: 'code', txt: 'code', csv: 'code',
  // PDF
  pdf: 'pdf',
  // 音频
  mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio', flac: 'audio',
  aac: 'audio', wma: 'audio',
  // 视频
  mp4: 'video', webm: 'video', mov: 'video', avi: 'video', mkv: 'video',
  wmv: 'video', flv: 'video',
  // Excel
  xlsx: 'excel', xls: 'excel', xlsm: 'excel',
  // Word
  docx: 'docx',
  // PowerPoint
  pptx: 'pptx', ppt: 'pptx',
  // 字体
  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font',
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      扩展名 → 语言 映射表                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const EXT_LANG_MAP: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  java: 'java', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  css: 'css', scss: 'scss', less: 'less',
  html: 'html', htm: 'html',
  json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml',
  md: 'markdown', sql: 'sql',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  toml: 'toml', txt: 'plaintext', csv: 'plaintext',
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      扩展名 → 图标 映射表                                  │
 * │                                                                          │
 * │  好品味：统一的图标映射，消除各处重复定义                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const EXT_ICON_MAP: Record<string, string> = {
  // 网页
  html: '🌐', htm: '🌐',
  // 文档
  pdf: '📕',
  doc: '📘', docx: '📘',
  xls: '📗', xlsx: '📗',
  ppt: '📙', pptx: '📙',
  // 图片
  png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️',
  // 文本
  txt: '📄', md: '📝',
  // 数据
  json: '📋', csv: '📊', yaml: '📋', yml: '📋',
  // 代码
  py: '🐍', js: '📜', ts: '📜', jsx: '📜', tsx: '📜',
  // 音视频
  mp3: '🎵', wav: '🎵', ogg: '🎵',
  mp4: '🎬', webm: '🎬', mov: '🎬',
  // 字体
  ttf: '🔤', otf: '🔤', woff: '🔤', woff2: '🔤',
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           公开函数                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/** 从文件名提取扩展名 */
export function getExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() || ''
}

/** 根据扩展名获取文件分类 */
export function getCategory(ext: string): FileCategory {
  return EXT_CATEGORY_MAP[ext] || 'binary'
}

/** 根据扩展名获取语法高亮语言 */
export function getLang(ext: string): string {
  return EXT_LANG_MAP[ext] || 'plaintext'
}

/** 格式化文件大小 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 判断是否可预览 */
export function isPreviewable(ext: string): boolean {
  const cat = getCategory(ext)
  return cat !== 'binary'
}

/** 根据扩展名获取文件图标 */
export function getFileIcon(ext: string): string {
  return EXT_ICON_MAP[ext.toLowerCase()] || '📄'
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           外部应用打开                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export { openFileExternal }
