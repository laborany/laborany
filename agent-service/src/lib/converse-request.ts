export function extractLatestUserMessageContent(rawMessages: unknown[]): string {
  for (let index = rawMessages.length - 1; index >= 0; index -= 1) {
    const item = rawMessages[index]
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (record.role !== 'user') continue
    if (typeof record.content !== 'string') continue
    const content = record.content.trim()
    if (content) return record.content
  }

  for (let index = rawMessages.length - 1; index >= 0; index -= 1) {
    const item = rawMessages[index]
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (typeof record.content !== 'string') continue
    const content = record.content.trim()
    if (content) return record.content
  }

  return ''
}
