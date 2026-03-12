function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

const CONCLUSION_FIRST_PATTERNS = [
  /(?:先|优先).{0,4}(?:给|说|讲|下|告诉)?(?:出)?(?:结论|结果|答案|判断)/i,
  /(?:结论|结果|答案|判断).{0,4}(?:先行|优先|靠前|放前面|在前面)/i,
  /(?:先结论后(?:步骤|细节|分析|说明)|先给结论再(?:给|讲|说|展开|补充)|先说结论再(?:说|讲|展开|补充)|结论先行)/i,
]

export interface NormalizedCommunicationStylePreference {
  key: string
  description: string
}

export function hasConclusionFirstPreference(text: string): boolean {
  const normalized = normalizeWhitespace(text)
  if (!normalized) return false
  return CONCLUSION_FIRST_PATTERNS.some(pattern => pattern.test(normalized))
}

export function normalizeCommunicationStylePreference(
  text: string,
): NormalizedCommunicationStylePreference | null {
  if (!hasConclusionFirstPreference(text)) return null
  return {
    key: '结论优先',
    description: '偏好回复时先给出结论，再展开步骤和细节',
  }
}
