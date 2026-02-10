export type CapabilityType = 'skill' | 'workflow'

export const CAPABILITY_ID_MAX_LENGTH = 64

const CAPABILITY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function normalizeCapabilityDisplayName(name: string): string {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

function fallbackCapabilityId(type: CapabilityType): string {
  return `${type}-${Date.now().toString(36)}`
}

function clampCapabilityId(id: string, maxLength: number): string {
  if (id.length <= maxLength) return id
  return id.slice(0, maxLength).replace(/-+$/g, '')
}

function toAsciiSlug(rawValue: string): string {
  const normalized = normalizeCapabilityDisplayName(rawValue).normalize('NFKC').toLowerCase()
  if (!normalized) return ''

  const tokens: string[] = []
  let currentToken = ''

  const pushCurrentToken = () => {
    if (!currentToken) return
    tokens.push(currentToken)
    currentToken = ''
  }

  for (const char of normalized) {
    if (/^[a-z0-9]$/.test(char)) {
      currentToken += char
      continue
    }

    if (char === '-' || char === '_' || /\s/.test(char)) {
      pushCurrentToken()
      continue
    }

    const codePoint = char.codePointAt(0)
    if (!codePoint || codePoint <= 0x7f) {
      pushCurrentToken()
      continue
    }

    pushCurrentToken()
    tokens.push(`u${codePoint.toString(16)}`)
  }

  pushCurrentToken()
  return tokens.join('-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

export function normalizeCapabilityId(
  rawId: string,
  type: CapabilityType,
  maxLength = CAPABILITY_ID_MAX_LENGTH,
): string {
  const slug = clampCapabilityId(toAsciiSlug(rawId), maxLength)
  if (!slug) return fallbackCapabilityId(type)
  return slug
}

export function generateCapabilityId(
  name: string,
  type: CapabilityType,
  maxLength = CAPABILITY_ID_MAX_LENGTH,
): string {
  return normalizeCapabilityId(name, type, maxLength)
}

export function validateCapabilityId(
  id: string,
  maxLength = CAPABILITY_ID_MAX_LENGTH,
): { valid: boolean; reason?: string } {
  if (!id) {
    return { valid: false, reason: 'ID cannot be empty' }
  }

  if (id.length > maxLength) {
    return { valid: false, reason: `ID length cannot exceed ${maxLength}` }
  }

  if (!CAPABILITY_ID_PATTERN.test(id)) {
    return { valid: false, reason: 'ID must use lowercase letters, numbers, and hyphens' }
  }

  return { valid: true }
}

export function appendCapabilityIdSuffix(
  baseId: string,
  suffix: number,
  maxLength = CAPABILITY_ID_MAX_LENGTH,
): string {
  if (suffix <= 1) {
    return clampCapabilityId(baseId, maxLength) || 'item'
  }

  const suffixText = `-${suffix}`
  const allowedBaseLength = Math.max(1, maxLength - suffixText.length)
  const trimmedBase = (clampCapabilityId(baseId, allowedBaseLength) || 'item').replace(/-+$/g, '')
  return `${trimmedBase}${suffixText}`
}

export function pickUniqueCapabilityId(
  baseId: string,
  existingIds: Iterable<string>,
  maxLength = CAPABILITY_ID_MAX_LENGTH,
): string {
  const taken = new Set(existingIds)
  const sanitizedBase = clampCapabilityId(baseId, maxLength) || 'item'

  let candidate = appendCapabilityIdSuffix(sanitizedBase, 1, maxLength)
  if (!taken.has(candidate)) return candidate

  let suffix = 2
  while (true) {
    candidate = appendCapabilityIdSuffix(sanitizedBase, suffix, maxLength)
    if (!taken.has(candidate)) return candidate
    suffix += 1
  }
}
