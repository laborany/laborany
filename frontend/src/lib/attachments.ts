import { API_BASE } from '../config/api'

const ATTACHMENT_MARKER_SOURCE = String.raw`\[(?:LABORANY_FILE_IDS|已上传文件 ID|Uploaded file IDs?)\s*:\s*([^\]]+)\]`

function splitAttachmentIds(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function readErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  if (typeof record.detail === 'string' && record.detail.trim()) return record.detail.trim()
  if (typeof record.error === 'string' && record.error.trim()) return record.error.trim()
  if (typeof record.message === 'string' && record.message.trim()) return record.message.trim()
  return null
}

export interface AttachmentUploadFailure {
  fileName: string
  reason: string
}

export class AttachmentUploadError extends Error {
  failures: AttachmentUploadFailure[]

  constructor(failures: AttachmentUploadFailure[]) {
    const summary = failures
      .map((item) => `${item.fileName}: ${item.reason}`)
      .join('；')
    super(summary ? `文件上传失败：${summary}` : '文件上传失败')
    this.name = 'AttachmentUploadError'
    this.failures = failures
  }
}

export function normalizeAttachmentIds(input: unknown): string[] {
  const normalized = new Set<string>()
  const push = (value: unknown) => {
    if (typeof value !== 'string') return
    splitAttachmentIds(value).forEach((id) => normalized.add(id))
  }

  if (Array.isArray(input)) {
    input.forEach(push)
  } else {
    push(input)
  }

  return Array.from(normalized)
}

export function mergeAttachmentIds(...lists: string[][]): string[] {
  return normalizeAttachmentIds(lists.flat())
}

export function stripAttachmentMarkers(text: string): string {
  return text.replace(new RegExp(ATTACHMENT_MARKER_SOURCE, 'gi'), '').trim()
}

export function parseAttachmentIdsParam(raw: string | null): string[] {
  return normalizeAttachmentIds(raw || '')
}

export function applyAttachmentIdsToParams(params: URLSearchParams, attachmentIds: string[]): void {
  const normalized = normalizeAttachmentIds(attachmentIds)
  if (normalized.length > 0) {
    params.set('attachments', normalized.join(','))
    return
  }
  params.delete('attachments')
}

export function buildExecutePath(
  skillId: string,
  query: string,
  attachmentIds: string[],
  options?: {
    converseSid?: string
    workId?: string
  },
): string {
  const params = new URLSearchParams()
  const normalizedQuery = stripAttachmentMarkers(query)
  if (normalizedQuery) {
    params.set('q', normalizedQuery)
  }
  applyAttachmentIdsToParams(params, attachmentIds)
  if (options?.converseSid?.trim()) {
    params.set('converseSid', options.converseSid.trim())
  }
  if (options?.workId?.trim()) {
    params.set('workId', options.workId.trim())
  }
  const search = params.toString()
  return `/history/launch/${skillId}${search ? `?${search}` : ''}`
}

export async function uploadAttachments(
  files: File[],
  token?: string | null,
  maxRetries = 3,
): Promise<string[]> {
  if (files.length === 0) return []

  const headers: HeadersInit = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const uploadedIds: string[] = []
  const failures: AttachmentUploadFailure[] = []

  for (const file of files) {
    let uploaded = false
    let lastReason = '上传服务异常'

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch(`${API_BASE}/files/upload`, {
          method: 'POST',
          headers,
          body: formData,
        })

        if (res.ok) {
          const payload = await res.json().catch(() => null) as { id?: string } | null
          if (payload?.id) {
            uploadedIds.push(payload.id)
            uploaded = true
            break
          }
          lastReason = '上传成功但未返回文件 ID'
        } else {
          const payload = await res.json().catch(() => null)
          lastReason = readErrorMessage(payload) || `HTTP ${res.status}`
        }
      } catch (error) {
        lastReason = error instanceof Error ? error.message : '网络异常'
      }

      if (uploaded) break
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt))
      }
    }

    if (!uploaded) {
      failures.push({ fileName: file.name || '未命名文件', reason: lastReason })
    }
  }

  if (failures.length > 0) {
    throw new AttachmentUploadError(failures)
  }

  return uploadedIds
}
