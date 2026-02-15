interface ClientLogEvent {
  level: 'debug' | 'info' | 'warn' | 'error'
  event: string
  message: string
  meta?: Record<string, unknown>
  ts: string
}

const MAX_QUEUE_SIZE = 500
const MAX_BATCH_SIZE = 80
const FLUSH_INTERVAL_MS = 4000
const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const ENDPOINT = `${API_BASE}/logs/client`

let initialized = false
let flushTimer: number | null = null
let flushInFlight = false
const queue: ClientLogEvent[] = []

const SENSITIVE_KEY_PATTERNS = [
  /api.?key/i,
  /authorization/i,
  /cookie/i,
  /token/i,
  /secret/i,
  /password/i,
  /smtp_pass/i,
  /x-api-key/i,
]

const SENSITIVE_VALUE_PATTERNS = [
  /(sk-ant-[a-z0-9-]{8,})/ig,
  /(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/ig,
]

function clipText(input: string, maxChars = 2400): string {
  if (input.length <= maxChars) return input
  return `${input.slice(0, maxChars)}...`
}

function maskSensitiveString(input: string): string {
  let text = input
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    text = text.replace(pattern, (_match, prefix?: string) => {
      if (prefix) return `${prefix}***`
      return '***'
    })
  }
  return text
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[DepthLimited]'
  if (value === null || value === undefined) return value

  if (typeof value === 'string') {
    return clipText(maskSensitiveString(value), 1600)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value

  if (Array.isArray(value)) {
    return value.slice(0, 30).map(item => sanitizeValue(item, depth + 1))
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: clipText(maskSensitiveString(value.message), 1600),
      stack: clipText(maskSensitiveString(value.stack || ''), 3000),
    }
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key))) {
        out[key] = '***'
      } else {
        out[key] = sanitizeValue(item, depth + 1)
      }
    }
    return out
  }

  return String(value)
}

function trimQueueIfNeeded(): void {
  if (queue.length <= MAX_QUEUE_SIZE) return
  queue.splice(0, queue.length - MAX_QUEUE_SIZE)
}

function enqueue(event: ClientLogEvent): void {
  queue.push(event)
  trimQueueIfNeeded()
}

function normalizeMessage(message: unknown): string {
  if (typeof message === 'string') return clipText(maskSensitiveString(message), 2400)
  return clipText(maskSensitiveString(String(message ?? '')), 2400)
}

async function flushInternal(force = false): Promise<void> {
  if (flushInFlight) return
  if (queue.length === 0) return
  if (!force && document.visibilityState === 'hidden') return

  const batch = queue.splice(0, MAX_BATCH_SIZE)
  if (batch.length === 0) return
  flushInFlight = true

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
      keepalive: force,
    })

    if (!response.ok) {
      queue.unshift(...batch)
      trimQueueIfNeeded()
    }
  } catch {
    queue.unshift(...batch)
    trimQueueIfNeeded()
  } finally {
    flushInFlight = false
  }
}

function startFlushTimer(): void {
  if (flushTimer !== null) return
  flushTimer = window.setInterval(() => {
    void flushInternal(false)
  }, FLUSH_INTERVAL_MS)
}

function setupLifecycleHandlers(): void {
  window.addEventListener('pagehide', () => {
    void flushInternal(true)
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushInternal(true)
    }
  })
}

export function initClientLogger(): void {
  if (initialized) return
  initialized = true
  startFlushTimer()
  setupLifecycleHandlers()
}

function log(level: ClientLogEvent['level'], event: string, message: unknown, meta?: Record<string, unknown>): void {
  enqueue({
    level,
    event,
    message: normalizeMessage(message),
    meta: sanitizeValue(meta || {}) as Record<string, unknown>,
    ts: new Date().toISOString(),
  })
}

export function logClientInfo(event: string, message: unknown, meta?: Record<string, unknown>): void {
  log('info', event, message, meta)
}

export function logClientWarn(event: string, message: unknown, meta?: Record<string, unknown>): void {
  log('warn', event, message, meta)
}

export function logClientError(
  event: string,
  message: unknown,
  error?: unknown,
  meta?: Record<string, unknown>,
): void {
  log('error', event, message, {
    ...(meta || {}),
    error: sanitizeValue(error),
  })
}
