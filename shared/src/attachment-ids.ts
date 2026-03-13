const ATTACHMENT_MARKER_SOURCE = String.raw`\[(?:LABORANY_FILE_IDS|已上传文件 ID|Uploaded file IDs?)\s*:\s*([^\]]+)\]`

function splitAttachmentIds(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
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

export function stripAttachmentMarkers(text: string): string {
  return text.replace(new RegExp(ATTACHMENT_MARKER_SOURCE, 'gi'), '').trim()
}

export function extractAttachmentIdsFromText(text: string): { text: string; attachmentIds: string[] } {
  const attachmentIds = new Set<string>()
  const pattern = new RegExp(ATTACHMENT_MARKER_SOURCE, 'gi')

  for (const match of text.matchAll(pattern)) {
    splitAttachmentIds(match[1] || '').forEach((id) => attachmentIds.add(id))
  }

  return {
    text: stripAttachmentMarkers(text),
    attachmentIds: Array.from(attachmentIds),
  }
}
