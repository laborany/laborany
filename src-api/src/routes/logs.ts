import { Hono } from 'hono'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'
import JSZip from 'jszip'
import {
  getAppLoggerStatus,
  logError,
  logInfo,
  logWarn,
  sanitizeLogPayload,
  writeAppLog,
  type AppLogLevel,
} from '../lib/app-logger.js'
import { getConfigDir } from '../lib/app-config.js'
import { getMigrationReportPath } from '../lib/app-home.js'

const logsRoute = new Hono()

const LOG_SOURCES = ['electron', 'api', 'agent', 'frontend'] as const

interface FrontendLogEvent {
  level?: AppLogLevel
  event?: string
  message?: string
  meta?: Record<string, unknown>
  ts?: string
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function safeReadDir(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function listSourceFiles(sourceDir: string): Array<{ name: string; size: number; updatedAt: string }> {
  const files = safeReadDir(sourceDir)
    .filter(file => file.endsWith('.log'))
    .map((file) => {
      const fullPath = join(sourceDir, file)
      try {
        const stat = statSync(fullPath)
        return { name: file, size: stat.size, updatedAt: stat.mtime.toISOString() }
      } catch {
        return null
      }
    })
    .filter(Boolean) as Array<{ name: string; size: number; updatedAt: string }>

  files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return files.slice(0, 20)
}

function normalizeClientLevel(level: unknown): AppLogLevel {
  if (level === 'error' || level === 'warn' || level === 'debug' || level === 'info') {
    return level
  }
  return 'info'
}

function sanitizeMessage(message: unknown): string {
  if (typeof message !== 'string') return ''
  return message.slice(0, 4000)
}

async function buildZipBuffer(logRoot: string): Promise<{ filename: string; payload: Buffer; targetPath: string }> {
  const zip = new JSZip()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `laborany-logs-${stamp}.zip`

  for (const source of LOG_SOURCES) {
    const sourceDir = join(logRoot, source)
    if (!existsSync(sourceDir)) continue
    const files = safeReadDir(sourceDir).filter(file => file.endsWith('.log'))
    for (const file of files) {
      const fullPath = join(sourceDir, file)
      try {
        const payload = readFileSync(fullPath)
        zip.file(`${source}/${file}`, payload)
      } catch {
        // best effort
      }
    }
  }

  const migrationReportPath = getMigrationReportPath()
  if (existsSync(migrationReportPath)) {
    try {
      const payload = readFileSync(migrationReportPath)
      zip.file('migration-report.json', payload)
    } catch {
      // ignore
    }
  }

  const generated = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  const exportsDir = join(logRoot, 'exports')
  ensureDir(exportsDir)
  const targetPath = join(exportsDir, filename)
  writeFileSync(targetPath, generated)

  return { filename, payload: generated, targetPath }
}

logsRoute.get('/meta', (c) => {
  const status = getAppLoggerStatus()
  const details: Record<string, Array<{ name: string; size: number; updatedAt: string }>> = {}

  for (const source of LOG_SOURCES) {
    details[source] = listSourceFiles(join(status.logRoot, source))
  }

  return c.json({
    logRoot: status.logRoot,
    fallbackActive: status.fallbackActive,
    fallbackReason: status.fallbackReason,
    retentionDays: status.retentionDays,
    maxFileSizeMB: status.maxFileSizeMB,
    sources: details,
    configDir: getConfigDir(),
    migrationReportPath: getMigrationReportPath(),
  })
})

logsRoute.post('/client', async (c) => {
  try {
    const body = await c.req.json<{ events?: FrontendLogEvent[] }>()
    const events = Array.isArray(body?.events) ? body.events.slice(0, 200) : []

    for (const item of events) {
      writeAppLog({
        source: 'frontend',
        level: normalizeClientLevel(item.level),
        event: item.event || 'frontend_event',
        message: sanitizeMessage(item.message || ''),
        meta: sanitizeLogPayload(item.meta || {}),
        at: item.ts,
      })
    }

    return c.json({ success: true, accepted: events.length })
  } catch (error) {
    logWarn('logs_client_parse_failed', 'Failed to parse frontend logs payload', {
      error: error instanceof Error ? error.message : String(error),
    })
    return c.json({ success: false, error: 'Invalid payload' }, 400)
  }
})

logsRoute.get('/export', async (c) => {
  const status = getAppLoggerStatus()
  try {
    const bundle = await buildZipBuffer(status.logRoot)
    logInfo('logs_export_generated', 'Diagnostic logs export generated', {
      targetPath: bundle.targetPath,
      fileName: bundle.filename,
      size: bundle.payload.length,
    })

    c.header('Content-Type', 'application/zip')
    c.header('Content-Disposition', `attachment; filename="${bundle.filename}"`)
    return c.body(bundle.payload)
  } catch (error) {
    logError('logs_export_failed', 'Failed to export logs bundle', error)
    return c.json({ success: false, error: 'Failed to export logs' }, 500)
  }
})

export default logsRoute
