export type ModelInterfaceType = 'anthropic' | 'openai_compatible'

export interface OpenAiBridgeCredential {
  apiKey: string
  baseUrl?: string
  model?: string
}

const OPENAI_BRIDGE_PREFIX = 'laborany-openai-bridge:'

function toBase64Url(input: string): string {
  return Buffer
    .from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Buffer.from(padded, 'base64').toString('utf-8')
}

export function normalizeModelInterfaceType(value?: string): ModelInterfaceType {
  return value === 'openai_compatible' ? 'openai_compatible' : 'anthropic'
}

export function encodeOpenAiBridgeApiKey(payload: OpenAiBridgeCredential): string {
  const body: OpenAiBridgeCredential = {
    apiKey: (payload.apiKey || '').trim(),
    baseUrl: (payload.baseUrl || '').trim() || undefined,
    model: (payload.model || '').trim() || undefined,
  }

  return `${OPENAI_BRIDGE_PREFIX}${toBase64Url(JSON.stringify(body))}`
}

export function decodeOpenAiBridgeApiKey(apiKey?: string): OpenAiBridgeCredential | null {
  const raw = (apiKey || '').trim()
  if (!raw || !raw.startsWith(OPENAI_BRIDGE_PREFIX)) return null

  try {
    const encoded = raw.slice(OPENAI_BRIDGE_PREFIX.length)
    const decoded = JSON.parse(fromBase64Url(encoded)) as Partial<OpenAiBridgeCredential>
    const parsedKey = (decoded.apiKey || '').trim()
    if (!parsedKey) return null

    return {
      apiKey: parsedKey,
      baseUrl: (decoded.baseUrl || '').trim() || undefined,
      model: (decoded.model || '').trim() || undefined,
    }
  } catch {
    return null
  }
}

export function isOpenAiBridgeApiKey(apiKey?: string): boolean {
  return Boolean((apiKey || '').trim().startsWith(OPENAI_BRIDGE_PREFIX))
}
