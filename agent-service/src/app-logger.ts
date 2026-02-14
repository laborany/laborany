import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'fs'
import { homedir, tmpdir } from 'os'
import { join, resolve } from 'path'
import { format } from 'util'
import { APP_HOME_DIR } from './paths.js'

export type AgentLogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface AgentLoggerInitOptions {
  defaultSource?: string
  minLevel?: AgentLogLevel
  retentionDays?: number
  maxFileSizeMB?: number
  logRootDir?: string
}

interface AgentLoggerState {
  initialized: boolean
  defaultSource: string
  minLevel: AgentLogLevel
  retentionDays: number
  maxFileSizeBytes: number
  logRoot: string
  fallbackActive: boolean
  fallbackReason?: string
  consolePatched: boolean
  processHandlersInstalled: boolean
  lastPruneAt: number
  originalConsole: {
    log: typeof console.log
    info: typeof console.info
    warn: typeof console.warn
    error: typeof console.error
    debug: typeof console.debug
  }
}

export interface AgentLoggerStatus {
  initialized: boolean
  defaultSource: string
  minLevel: AgentLogLevel
  retentionDays: number
  maxFileSizeMB: number
  logRoot: string
  fallbackActive: boolean
  fallbackReason?: string
}

export interface AgentLogEvent {
  level: AgentLogLevel
  event: string
  message: string
  source?: string
  meta?: Record<string, unknown>
  error?: unknown
  at?: string
}

const LOG_LEVEL_PRIORITY: Record<AgentLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

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

const state: AgentLoggerState = {
  initialized: false,
  defaultSource: 'agent',
  minLevel: 'info',
  retentionDays: 7,
  maxFileSizeBytes: 10 * 1024 * 1024,
  logRoot: '',
  fallbackActive: false,
  fallbackReason: undefined,
  consolePatched: false,
  processHandlersInstalled: false,
  lastPruneAt: 0,
  originalConsole: {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  },
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function clipText(input: string, maxChars = 4000): string {
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
  if (depth > 5) return '[DepthLimited]'
  if (value === null || value === undefined) return value

  if (typeof value === 'string') {
    return clipText(maskSensitiveString(value), 2000)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value

  if (value instanceof Error) {
    return {
      name: value.name,
      message: clipText(maskSensitiveString(value.message), 2000),
      stack: clipText(maskSensitiveString(value.stack || ''), 6000),
    }
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map(item => sanitizeValue(item, depth + 1))
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key))) {
        result[key] = '***'
      } else {
        result[key] = sanitizeValue(item, depth + 1)
      }
    }
    return result
  }

  return String(value)
}

function getDayLabel(inputAt?: string): string {
  const date = inputAt ? new Date(inputAt) : new Date()
  return date.toISOString().split('T')[0]
}

function getSourceDir(source: string): string {
  const cleanSource = source || state.defaultSource
  const dir = join(state.logRoot, cleanSource)
  ensureDir(dir)
  return dir
}

function getMainLogPath(source: string, day: string): string {
  return join(getSourceDir(source), `${day}.log`)
}

function nextRotatePath(source: string, day: string): string {
  const dir = getSourceDir(source)
  const files = readdirSync(dir)
  let maxIndex = 0
  const pattern = new RegExp(`^${day}\\.(\\d+)\\.log$`)
  for (const file of files) {
    const match = file.match(pattern)
    if (!match) continue
    const idx = Number(match[1])
    if (Number.isFinite(idx) && idx > maxIndex) maxIndex = idx
  }
  return join(dir, `${day}.${maxIndex + 1}.log`)
}

function rotateIfNeeded(source: string, day: string, incomingSize: number): void {
  const mainPath = getMainLogPath(source, day)
  if (!existsSync(mainPath)) return

  try {
    const size = statSync(mainPath).size
    if (size + incomingSize <= state.maxFileSizeBytes) return
    const rotatedPath = nextRotatePath(source, day)
    renameSync(mainPath, rotatedPath)
  } catch {
    // best effort
  }
}

function pruneOldLogsIfNeeded(): void {
  const now = Date.now()
  if (now - state.lastPruneAt < 30 * 60 * 1000) return
  state.lastPruneAt = now

  const cutoff = now - state.retentionDays * 24 * 60 * 60 * 1000
  const sourceDirs = ['api', 'agent', 'electron', 'frontend', state.defaultSource]

  for (const source of sourceDirs) {
    const dir = join(state.logRoot, source)
    if (!existsSync(dir)) continue

    for (const file of readdirSync(dir)) {
      const match = file.match(/^(\d{4}-\d{2}-\d{2})(?:\.\d+)?\.log$/)
      if (!match) continue
      const fileTs = new Date(`${match[1]}T00:00:00.000Z`).getTime()
      if (Number.isNaN(fileTs) || fileTs >= cutoff) continue
      try {
        unlinkSync(join(dir, file))
      } catch {
        // ignore
      }
    }
  }
}

function isWritableDir(dir: string): boolean {
  try {
    ensureDir(dir)
    const probeFile = join(dir, '.__writable_check__')
    appendFileSync(probeFile, `${Date.now()}\n`, 'utf-8')
    unlinkSync(probeFile)
    return true
  } catch {
    return false
  }
}

function getPreferredLogRoot(configured?: string): string {
  const fromEnv = (process.env.LABORANY_LOG_DIR || '').trim()
  if (fromEnv) return fromEnv
  if (configured) return configured
  return join(APP_HOME_DIR, 'logs')
}

function resolveLogRoot(configured?: string): { logRoot: string; fallbackActive: boolean; fallbackReason?: string } {
  const preferred = resolve(getPreferredLogRoot(configured))
  if (isWritableDir(preferred)) {
    return { logRoot: preferred, fallbackActive: false }
  }

  const fallback = resolve(join(tmpdir(), 'laborany-logs'))
  if (isWritableDir(fallback)) {
    return {
      logRoot: fallback,
      fallbackActive: true,
      fallbackReason: `Primary log dir not writable: ${preferred}`,
    }
  }

  const secondFallback = resolve(join(homedir(), '.laborany-logs'))
  ensureDir(secondFallback)
  return {
    logRoot: secondFallback,
    fallbackActive: true,
    fallbackReason: `Primary and temp log dir unavailable: ${preferred}`,
  }
}

function shouldLog(level: AgentLogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[state.minLevel]
}

function writeEvent(event: AgentLogEvent): void {
  if (!state.initialized) return
  if (!shouldLog(event.level)) return

  try {
    const at = event.at || new Date().toISOString()
    const day = getDayLabel(at)
    const source = (event.source || state.defaultSource).toLowerCase()
    const meta = sanitizeValue(event.meta || {}) as Record<string, unknown>
    const error = event.error ? sanitizeValue(event.error) : undefined

    const record = {
      ts: at,
      level: event.level,
      source,
      event: event.event || 'agent_event',
      message: clipText(maskSensitiveString(event.message || ''), 4000),
      meta,
      error,
    }

    const payload = `${JSON.stringify(record)}\n`
    rotateIfNeeded(source, day, Buffer.byteLength(payload, 'utf-8'))
    appendFileSync(getMainLogPath(source, day), payload, 'utf-8')
    pruneOldLogsIfNeeded()
  } catch {
    // never break app flow by logging failure
  }
}

function formatConsoleArgs(args: unknown[]): string {
  if (args.length === 0) return ''
  return clipText(maskSensitiveString(format(...args)), 4000)
}

export function initAgentLogger(options: AgentLoggerInitOptions = {}): AgentLoggerStatus {
  state.defaultSource = (options.defaultSource || 'agent').toLowerCase()
  state.minLevel = options.minLevel || 'info'
  state.retentionDays = options.retentionDays ?? 7
  state.maxFileSizeBytes = (options.maxFileSizeMB ?? 10) * 1024 * 1024

  const resolved = resolveLogRoot(options.logRootDir)
  state.logRoot = resolved.logRoot
  state.fallbackActive = resolved.fallbackActive
  state.fallbackReason = resolved.fallbackReason
  state.initialized = true

  ensureDir(state.logRoot)
  ensureDir(join(state.logRoot, 'exports'))

  writeEvent({
    level: state.fallbackActive ? 'warn' : 'info',
    source: state.defaultSource,
    event: 'agent_logger_initialized',
    message: state.fallbackActive
      ? 'Agent logger initialized with fallback directory'
      : 'Agent logger initialized',
    meta: {
      logRoot: state.logRoot,
      retentionDays: state.retentionDays,
      maxFileSizeMB: Math.floor(state.maxFileSizeBytes / (1024 * 1024)),
      fallbackReason: state.fallbackReason,
    },
  })

  return getAgentLoggerStatus()
}

export function getAgentLoggerStatus(): AgentLoggerStatus {
  return {
    initialized: state.initialized,
    defaultSource: state.defaultSource,
    minLevel: state.minLevel,
    retentionDays: state.retentionDays,
    maxFileSizeMB: Math.floor(state.maxFileSizeBytes / (1024 * 1024)),
    logRoot: state.logRoot,
    fallbackActive: state.fallbackActive,
    fallbackReason: state.fallbackReason,
  }
}

export function logAgentInfo(event: string, message: string, meta?: Record<string, unknown>, source?: string): void {
  writeEvent({ level: 'info', event, message, meta, source })
}

export function logAgentWarn(event: string, message: string, meta?: Record<string, unknown>, source?: string): void {
  writeEvent({ level: 'warn', event, message, meta, source })
}

export function logAgentError(
  event: string,
  message: string,
  error?: unknown,
  meta?: Record<string, unknown>,
  source?: string,
): void {
  writeEvent({ level: 'error', event, message, error, meta, source })
}

export function patchAgentConsole(): void {
  if (state.consolePatched) return
  state.consolePatched = true

  console.log = (...args: unknown[]) => {
    writeEvent({
      level: 'info',
      source: state.defaultSource,
      event: 'console.log',
      message: formatConsoleArgs(args),
    })
    state.originalConsole.log(...args)
  }
  console.info = (...args: unknown[]) => {
    writeEvent({
      level: 'info',
      source: state.defaultSource,
      event: 'console.info',
      message: formatConsoleArgs(args),
    })
    state.originalConsole.info(...args)
  }
  console.warn = (...args: unknown[]) => {
    writeEvent({
      level: 'warn',
      source: state.defaultSource,
      event: 'console.warn',
      message: formatConsoleArgs(args),
    })
    state.originalConsole.warn(...args)
  }
  console.error = (...args: unknown[]) => {
    writeEvent({
      level: 'error',
      source: state.defaultSource,
      event: 'console.error',
      message: formatConsoleArgs(args),
    })
    state.originalConsole.error(...args)
  }
  console.debug = (...args: unknown[]) => {
    writeEvent({
      level: 'debug',
      source: state.defaultSource,
      event: 'console.debug',
      message: formatConsoleArgs(args),
    })
    state.originalConsole.debug(...args)
  }
}

export function installAgentGlobalErrorHandlers(): void {
  if (state.processHandlersInstalled) return
  state.processHandlersInstalled = true

  process.on('uncaughtException', (error) => {
    writeEvent({
      level: 'error',
      source: state.defaultSource,
      event: 'process_uncaught_exception',
      message: error instanceof Error ? error.message : 'Unknown uncaught exception',
      error,
    })
  })

  process.on('unhandledRejection', (reason) => {
    writeEvent({
      level: 'error',
      source: state.defaultSource,
      event: 'process_unhandled_rejection',
      message: reason instanceof Error ? reason.message : String(reason),
      error: reason,
    })
  })
}

