import { existsSync, readFileSync, writeFileSync } from 'fs'
import { basename, join } from 'path'

export const MEDIA_CONTEXT_FILE = '.laborany-media-context.json'

export type MediaContextKind = 'image' | 'video'
export type MediaContextOperation = 'understanding' | 'generation'

export interface MediaContextItem {
  id: string
  kind: MediaContextKind
  operation: MediaContextOperation
  filePath?: string
  fileName?: string
  prompt?: string
  summary?: string
  toolName?: string
  createdAt: string
}

export interface MediaContextStore {
  version: 1
  items: MediaContextItem[]
}

const MAX_MEDIA_CONTEXT_ITEMS = 30
const MAX_RESULT_SUMMARY_LENGTH = 1200

function getMediaContextPath(taskDir: string): string {
  return join(taskDir, MEDIA_CONTEXT_FILE)
}

function createEmptyStore(): MediaContextStore {
  return { version: 1, items: [] }
}

function sanitizeSummary(value?: string): string | undefined {
  const trimmed = (value || '').trim()
  if (!trimmed) return undefined
  return trimmed.length > MAX_RESULT_SUMMARY_LENGTH
    ? `${trimmed.slice(0, MAX_RESULT_SUMMARY_LENGTH)}...`
    : trimmed
}

function normalizeItem(raw: Partial<MediaContextItem>): MediaContextItem | null {
  const kind = raw.kind === 'image' || raw.kind === 'video' ? raw.kind : null
  const operation = raw.operation === 'understanding' || raw.operation === 'generation' ? raw.operation : null
  if (!kind || !operation) return null

  const filePath = (raw.filePath || '').trim() || undefined
  return {
    id: (raw.id || `${kind}-${operation}-${Date.now()}`).trim(),
    kind,
    operation,
    filePath,
    fileName: (raw.fileName || (filePath ? basename(filePath) : '')).trim() || undefined,
    prompt: sanitizeSummary(raw.prompt),
    summary: sanitizeSummary(raw.summary),
    toolName: (raw.toolName || '').trim() || undefined,
    createdAt: (raw.createdAt || new Date().toISOString()).trim(),
  }
}

export function readMediaContext(taskDir: string): MediaContextStore {
  const contextPath = getMediaContextPath(taskDir)
  if (!existsSync(contextPath)) return createEmptyStore()

  try {
    const parsed = JSON.parse(readFileSync(contextPath, 'utf-8')) as Partial<MediaContextStore>
    const items = Array.isArray(parsed.items)
      ? parsed.items.flatMap((item) => {
        const normalized = normalizeItem(item)
        return normalized ? [normalized] : []
      })
      : []
    return { version: 1, items }
  } catch {
    return createEmptyStore()
  }
}

export function appendMediaContextItem(taskDir: string, item: Omit<MediaContextItem, 'id' | 'createdAt'> & {
  id?: string
  createdAt?: string
}): MediaContextItem {
  const normalized = normalizeItem({
    ...item,
    id: item.id || `${item.kind}-${item.operation}-${Date.now()}`,
    createdAt: item.createdAt || new Date().toISOString(),
  })
  if (!normalized) {
    throw new Error('Invalid media context item')
  }

  const store = readMediaContext(taskDir)
  const nextItems = [...store.items, normalized].slice(-MAX_MEDIA_CONTEXT_ITEMS)
  writeFileSync(getMediaContextPath(taskDir), JSON.stringify({ version: 1, items: nextItems }, null, 2), 'utf-8')
  return normalized
}

export function buildMediaContextPromptSection(taskDir: string, limit = 8): string {
  const items = readMediaContext(taskDir).items.slice(-limit)
  if (items.length === 0) return ''

  const lines = items.map((item, index) => {
    const parts = [
      `${index + 1}. ${item.operation === 'generation' ? '生成' : '理解'}${item.kind === 'image' ? '图片' : '视频'}`,
      item.filePath ? `文件: ${item.filePath}` : '',
      item.prompt ? `提示词/问题: ${item.prompt}` : '',
      item.summary ? `摘要: ${item.summary}` : '',
    ].filter(Boolean)
    return parts.join('；')
  })

  return [
    '## 当前任务媒体上下文',
    '',
    '以下是本任务此前的图片/视频理解或生成结果，可在后续对话和工具调用中引用。若用户提到“上一张图”“刚才的视频”“第 N 个分镜”等，请优先参考这里的文件路径和摘要。',
    '',
    ...lines,
  ].join('\n')
}
