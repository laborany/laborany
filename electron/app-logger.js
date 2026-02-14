const fs = require('fs')
const path = require('path')
const os = require('os')
const util = require('util')

const LOG_LEVEL_PRIORITY = {
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

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function clipText(input, maxChars = 4000) {
  if (input.length <= maxChars) return input
  return `${input.slice(0, maxChars)}...`
}

function maskSensitiveString(input) {
  let text = input
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    text = text.replace(pattern, (_match, prefix) => {
      if (prefix) return `${prefix}***`
      return '***'
    })
  }
  return text
}

function sanitizeValue(value, depth = 0) {
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
    return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1))
  }

  if (typeof value === 'object') {
    const out = {}
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
        out[key] = '***'
      } else {
        out[key] = sanitizeValue(item, depth + 1)
      }
    }
    return out
  }

  return String(value)
}

function getDayLabel(at) {
  const date = at ? new Date(at) : new Date()
  return date.toISOString().split('T')[0]
}

function createLogger(options) {
  const source = (options.source || 'electron').toLowerCase()
  const minLevel = options.minLevel || 'info'
  const retentionDays = options.retentionDays ?? 7
  const maxFileSizeBytes = (options.maxFileSizeMB ?? 10) * 1024 * 1024

  const requestedLogRoot = path.resolve(
    options.logRootDir || path.join(os.tmpdir(), 'laborany-logs'),
  )
  let logRoot = requestedLogRoot
  let fallbackActive = false
  let fallbackReason = undefined

  try {
    ensureDir(logRoot)
    const probePath = path.join(logRoot, '.__probe__')
    fs.writeFileSync(probePath, `${Date.now()}\n`, 'utf-8')
    fs.unlinkSync(probePath)
  } catch {
    logRoot = path.resolve(path.join(os.tmpdir(), 'laborany-logs'))
    ensureDir(logRoot)
    fallbackActive = true
    fallbackReason = `Primary log dir not writable: ${requestedLogRoot}`
  }

  ensureDir(path.join(logRoot, source))
  ensureDir(path.join(logRoot, 'exports'))

  let processHandlersInstalled = false
  let consolePatched = false
  let lastPruneAt = 0

  const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  }

  function getSourceDir(currentSource) {
    const dir = path.join(logRoot, (currentSource || source).toLowerCase())
    ensureDir(dir)
    return dir
  }

  function getMainLogPath(currentSource, day) {
    return path.join(getSourceDir(currentSource), `${day}.log`)
  }

  function nextRotatePath(currentSource, day) {
    const dir = getSourceDir(currentSource)
    const files = fs.readdirSync(dir)
    let maxIndex = 0
    const pattern = new RegExp(`^${day}\\.(\\d+)\\.log$`)
    for (const file of files) {
      const match = file.match(pattern)
      if (!match) continue
      const idx = Number(match[1])
      if (Number.isFinite(idx) && idx > maxIndex) maxIndex = idx
    }
    return path.join(dir, `${day}.${maxIndex + 1}.log`)
  }

  function rotateIfNeeded(currentSource, day, incomingSize) {
    const mainPath = getMainLogPath(currentSource, day)
    if (!fs.existsSync(mainPath)) return
    try {
      const size = fs.statSync(mainPath).size
      if (size + incomingSize <= maxFileSizeBytes) return
      fs.renameSync(mainPath, nextRotatePath(currentSource, day))
    } catch {
      // best effort
    }
  }

  function pruneOldLogsIfNeeded() {
    const now = Date.now()
    if (now - lastPruneAt < 30 * 60 * 1000) return
    lastPruneAt = now

    const cutoff = now - retentionDays * 24 * 60 * 60 * 1000
    const sourceDirs = ['electron', 'api', 'agent', 'frontend', source]
    for (const sourceDirName of sourceDirs) {
      const sourceDir = path.join(logRoot, sourceDirName)
      if (!fs.existsSync(sourceDir)) continue

      for (const file of fs.readdirSync(sourceDir)) {
        const match = file.match(/^(\d{4}-\d{2}-\d{2})(?:\.\d+)?\.log$/)
        if (!match) continue
        const fileTs = new Date(`${match[1]}T00:00:00.000Z`).getTime()
        if (Number.isNaN(fileTs) || fileTs >= cutoff) continue
        try {
          fs.unlinkSync(path.join(sourceDir, file))
        } catch {
          // ignore
        }
      }
    }
  }

  function shouldLog(level) {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel]
  }

  function writeLog(event) {
    if (!shouldLog(event.level || 'info')) return
    try {
      const at = event.at || new Date().toISOString()
      const day = getDayLabel(at)
      const eventSource = (event.source || source).toLowerCase()
      const record = {
        ts: at,
        level: event.level || 'info',
        source: eventSource,
        event: event.event || 'app_event',
        message: clipText(maskSensitiveString(event.message || ''), 4000),
        meta: sanitizeValue(event.meta || {}),
        error: event.error ? sanitizeValue(event.error) : undefined,
      }
      const payload = `${JSON.stringify(record)}\n`
      rotateIfNeeded(eventSource, day, Buffer.byteLength(payload, 'utf-8'))
      fs.appendFileSync(getMainLogPath(eventSource, day), payload, 'utf-8')
      pruneOldLogsIfNeeded()
    } catch {
      // never break app flow by logging failures
    }
  }

  function formatConsoleArgs(args) {
    if (!args || args.length === 0) return ''
    return clipText(maskSensitiveString(util.format(...args)), 4000)
  }

  function patchConsole() {
    if (consolePatched) return
    consolePatched = true

    console.log = (...args) => {
      writeLog({ level: 'info', source, event: 'console.log', message: formatConsoleArgs(args) })
      originalConsole.log(...args)
    }
    console.info = (...args) => {
      writeLog({ level: 'info', source, event: 'console.info', message: formatConsoleArgs(args) })
      originalConsole.info(...args)
    }
    console.warn = (...args) => {
      writeLog({ level: 'warn', source, event: 'console.warn', message: formatConsoleArgs(args) })
      originalConsole.warn(...args)
    }
    console.error = (...args) => {
      writeLog({ level: 'error', source, event: 'console.error', message: formatConsoleArgs(args) })
      originalConsole.error(...args)
    }
    console.debug = (...args) => {
      writeLog({ level: 'debug', source, event: 'console.debug', message: formatConsoleArgs(args) })
      originalConsole.debug(...args)
    }
  }

  function installGlobalErrorHandlers() {
    if (processHandlersInstalled) return
    processHandlersInstalled = true

    process.on('uncaughtException', (error) => {
      writeLog({
        level: 'error',
        source,
        event: 'process_uncaught_exception',
        message: error instanceof Error ? error.message : 'Unknown uncaught exception',
        error,
      })
    })

    process.on('unhandledRejection', (reason) => {
      writeLog({
        level: 'error',
        source,
        event: 'process_unhandled_rejection',
        message: reason instanceof Error ? reason.message : String(reason),
        error: reason,
      })
    })
  }

  function attachChildProcessLogs(proc, childSource, childName) {
    if (!proc) return
    proc.stdout?.on('data', (data) => {
      const message = data.toString().trim()
      if (!message) return
      writeLog({
        level: 'info',
        source: childSource,
        event: 'child_stdout',
        message,
        meta: { child: childName },
      })
    })
    proc.stderr?.on('data', (data) => {
      const message = data.toString().trim()
      if (!message) return
      writeLog({
        level: 'error',
        source: childSource,
        event: 'child_stderr',
        message,
        meta: { child: childName },
      })
    })
    proc.on('close', (code) => {
      writeLog({
        level: code === 0 ? 'info' : 'warn',
        source: childSource,
        event: 'child_close',
        message: `${childName} exited`,
        meta: { child: childName, code },
      })
    })
    proc.on('error', (error) => {
      writeLog({
        level: 'error',
        source: childSource,
        event: 'child_error',
        message: `${childName} failed to start`,
        error,
      })
    })
  }

  writeLog({
    level: fallbackActive ? 'warn' : 'info',
    source,
    event: 'logger_initialized',
    message: fallbackActive
      ? 'Electron logger initialized with fallback log directory'
      : 'Electron logger initialized',
    meta: { logRoot, fallbackActive, fallbackReason, retentionDays, maxFileSizeMB: options.maxFileSizeMB ?? 10 },
  })

  return {
    getStatus: () => ({
      source,
      minLevel,
      retentionDays,
      maxFileSizeMB: Math.floor(maxFileSizeBytes / (1024 * 1024)),
      logRoot,
      fallbackActive,
      fallbackReason,
    }),
    writeLog,
    logInfo: (event, message, meta) => writeLog({ level: 'info', source, event, message, meta }),
    logWarn: (event, message, meta) => writeLog({ level: 'warn', source, event, message, meta }),
    logError: (event, message, error, meta) => writeLog({ level: 'error', source, event, message, error, meta }),
    patchConsole,
    installGlobalErrorHandlers,
    attachChildProcessLogs,
  }
}

module.exports = {
  createLogger,
}

