/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         任务文件 API 路由                                  ║
 * ║                                                                          ║
 * ║  端点：列出任务目录文件、下载/预览文件                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Hono } from 'hono'
import { readFile, readdir, stat, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync, createWriteStream } from 'fs'
import { v4 as uuid } from 'uuid'
import { Readable } from 'stream'
import { spawn } from 'child_process'
import busboy from 'busboy'
import { getRuntimeTasksDir, getRuntimeUploadsDir } from 'laborany-shared'
import {
  isLibreOfficeAvailable,
  convertToPdf,
  getDiagnosticInfo as getConverterDiagnostic,
  resetLibreOfficeCache,
} from '../services/office-converter.js'
import {
  downloadLibreOffice,
  getDownloadProgress,
  isLibreOfficeDownloaded,
  getDownloaderDiagnostic,
} from '../services/libreoffice-downloader.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       任务目录路径                                        │
 * │                                                                          │
 * │  与 agent-service 保持一致：                                              │
 * │  - 打包环境：%APPDATA%/LaborAny/data/tasks                               │
 * │  - 开发环境：项目根目录/tasks                                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getTasksDir(): string {
  return getRuntimeTasksDir()
}

const TASKS_DIR = getTasksDir()

const file = new Hono()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       任务目录文件列表                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface TaskFile {
  name: string
  path: string
  type: 'file' | 'folder'
  ext?: string
  size?: number
  mtimeMs?: number
  updatedAt?: string
  children?: TaskFile[]
  stepIndex?: number    // 复合技能步骤索引
  stepName?: string     // 复合技能步骤名称
}

const TASK_INTERNAL_IGNORE_LIST = new Set(['history.txt', '.git', 'node_modules', '__pycache__', 'CLAUDE.md'])
const TASK_INTERNAL_DOWNLOAD_ALLOW_LIST = new Set(['.laborany-input-files.json'])

function shouldIgnoreTaskEntry(name: string): boolean {
  if (!name) return true
  if (TASK_INTERNAL_IGNORE_LIST.has(name)) return true
  if (name.startsWith('.')) return true
  if (name.startsWith('history-') && name.endsWith('.txt')) return true
  return false
}

function isInternalTaskPath(filePath: string): boolean {
  const segments = filePath
    .split('/')
    .filter(Boolean)

  if (segments.length === 1 && TASK_INTERNAL_DOWNLOAD_ALLOW_LIST.has(segments[0])) {
    return false
  }

  return segments.some(segment => shouldIgnoreTaskEntry(segment))
}

async function listTaskFiles(baseDir: string, relativePath: string): Promise<TaskFile[]> {
  const fullPath = relativePath ? join(baseDir, relativePath) : baseDir
  const entries = await readdir(fullPath, { withFileTypes: true })
  const files: TaskFile[] = []

  /* ┌────────────────────────────────────────────────────────────────────────┐
   * │  解析复合技能步骤目录：step-N-名称                                       │
   * └────────────────────────────────────────────────────────────────────────┘ */
  const stepPattern = /^step-(\d+)-(.+)$/
  const parseStepDir = (name: string): { stepIndex: number; stepName: string } | null => {
    const match = name.match(stepPattern)
    if (!match) return null
    return { stepIndex: parseInt(match[1], 10), stepName: match[2] }
  }

  for (const entry of entries) {
    if (shouldIgnoreTaskEntry(entry.name)) continue

    const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name

    if (entry.isFile()) {
      const ext = entry.name.split('.').pop()?.toLowerCase() || ''
      const fileStat = await stat(join(fullPath, entry.name))
      files.push({
        name: entry.name,
        path: entryPath,
        type: 'file',
        ext,
        size: fileStat.size,
        mtimeMs: fileStat.mtimeMs,
        updatedAt: fileStat.mtime.toISOString(),
      })
    } else if (entry.isDirectory()) {
      const stepInfo = parseStepDir(entry.name)
      const children = await listTaskFiles(baseDir, entryPath)

      // 将步骤信息传递给子文件
      if (stepInfo && children.length > 0) {
        const taggedChildren = children.map(child => ({
          ...child,
          stepIndex: child.stepIndex ?? stepInfo.stepIndex,
          stepName: child.stepName ?? stepInfo.stepName,
        }))
        files.push({
          name: entry.name,
          path: entryPath,
          type: 'folder',
          children: taggedChildren,
          stepIndex: stepInfo.stepIndex,
          stepName: stepInfo.stepName,
        })
      } else if (children.length > 0) {
        files.push({
          name: entry.name,
          path: entryPath,
          type: 'folder',
          children,
        })
      }
    }
  }

  return files
}

file.get('/task/:sessionId/files', async (c) => {
  const sessionId = c.req.param('sessionId')
  const taskDir = join(TASKS_DIR, sessionId)

  console.log(`[File] Listing files for session: ${sessionId}`)
  console.log(`[File] Task dir: ${taskDir}`)

  if (!existsSync(taskDir)) {
    return c.json({ error: '任务目录不存在', taskDir }, 404)
  }

  try {
    const files = await listTaskFiles(taskDir, '')
    return c.json({ files, workDir: taskDir })
  } catch (err) {
    console.error('[File] Error listing files:', err)
    return c.json({ error: '获取文件列表失败' }, 500)
  }
})

file.get('/tasks/:sessionId/files', async (c) => {
  const sessionId = c.req.param('sessionId')
  const taskDir = join(TASKS_DIR, sessionId)

  if (!existsSync(taskDir)) {
    return c.json({ error: '任务目录不存在' }, 404)
  }

  try {
    const files = await listTaskFiles(taskDir, '')
    return c.json({ files, workDir: taskDir })
  } catch {
    return c.json({ error: '获取文件列表失败' }, 500)
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       下载/预览任务文件                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function handleFileDownload(c: any, pathPrefix: string) {
  const sessionId = c.req.param('sessionId')
  // 路由挂载在 /api 下，所以完整路径是 /api/task/:sessionId/files/*
  const filePath = c.req.path.replace(`/api/${pathPrefix}/${sessionId}/files/`, '')
  const taskDir = join(TASKS_DIR, sessionId)
  const fullPath = join(taskDir, filePath)

  console.log(`[File] Download request: ${c.req.path}`)
  console.log(`[File] Extracted file path: ${filePath}`)
  console.log(`[File] Full path: ${fullPath}`)

  // 安全检查
  if (!fullPath.startsWith(taskDir)) {
    return c.json({ error: '禁止访问' }, 403)
  }

  if (isInternalTaskPath(filePath)) {
    return c.json({ error: '文件不存在', fullPath }, 404)
  }

  if (!existsSync(fullPath)) {
    return c.json({ error: '文件不存在', fullPath }, 404)
  }

  try {
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const mimeTypes: Record<string, string> = {
      html: 'text/html; charset=utf-8',
      htm: 'text/html; charset=utf-8',
      css: 'text/css; charset=utf-8',
      js: 'application/javascript; charset=utf-8',
      json: 'application/json; charset=utf-8',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml; charset=utf-8',
      pdf: 'application/pdf',
      txt: 'text/plain; charset=utf-8',
      md: 'text/markdown; charset=utf-8',
      csv: 'text/csv; charset=utf-8',
      xml: 'application/xml; charset=utf-8',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }

    const contentType = mimeTypes[ext] || 'application/octet-stream'
    const isPreviewable = ['html', 'htm', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'pdf', 'txt', 'md', 'json', 'css', 'js'].includes(ext)

    const content = await readFile(fullPath)

    const headers: Record<string, string> = {
      'Content-Type': contentType,
    }

    if (!isPreviewable) {
      const filename = filePath.split('/').pop() || 'download'
      headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(filename)}"`
    }

    return new Response(content, { headers })
  } catch {
    return c.json({ error: '读取文件失败' }, 500)
  }
}

file.get('/task/:sessionId/files/*', (c) => handleFileDownload(c, 'task'))
file.get('/tasks/:sessionId/files/*', (c) => handleFileDownload(c, 'tasks'))

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       文件上传（复合技能输入）                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function getUploadsDir(): string {
  return getRuntimeUploadsDir()
}

file.post('/files/upload', async (c) => {
  console.log('[File] Upload request received')

  const uploadsDir = getUploadsDir()
  if (!existsSync(uploadsDir)) {
    await mkdir(uploadsDir, { recursive: true })
  }

  return new Promise<Response>((resolve) => {
    const contentType = c.req.header('content-type') || ''
    console.log('[File] Content-Type:', contentType)

    if (!contentType.includes('multipart/form-data')) {
      resolve(c.json({ error: '需要 multipart/form-data 格式' }, 400))
      return
    }

    const fileId = uuid()
    let fileName = 'upload'
    let fileSize = 0
    let filePath = ''
    const writeTasks: Array<Promise<void>> = []

    const bb = busboy({ headers: { 'content-type': contentType } })

    bb.on('file', (fieldname, fileStream, info) => {
      console.log('[File] Receiving file:', info.filename)
      fileName = info.filename || 'upload'
      const ext = fileName.split('.').pop() || ''
      const savedFileName = ext ? `${fileId}.${ext}` : fileId
      filePath = join(uploadsDir, savedFileName)

      const writeStream = createWriteStream(filePath)
      writeTasks.push(new Promise<void>((resolveWrite, rejectWrite) => {
        writeStream.on('finish', () => resolveWrite())
        writeStream.on('error', rejectWrite)
      }))
      fileStream.pipe(writeStream)

      fileStream.on('data', (data: Buffer) => {
        fileSize += data.length
      })
    })

    bb.on('close', async () => {
      try {
        await Promise.all(writeTasks)
      } catch (err) {
        const detail = err instanceof Error ? err.message : '写入磁盘失败'
        resolve(c.json({ error: '文件上传失败', detail }, 500))
        return
      }

      if (!filePath) {
        resolve(c.json({ error: '未检测到上传文件' }, 400))
        return
      }

      console.log(`[File] Upload complete: ${filePath}, size: ${fileSize}`)
      resolve(c.json({
        id: fileId,
        name: fileName,
        path: filePath,
        size: fileSize,
      }))
    })

    bb.on('error', (err: Error) => {
      console.error('[File] Busboy error:', err)
      resolve(c.json({ error: '文件上传失败', detail: err.message }, 500))
    })

    // 将请求体传递给 busboy
    const reader = c.req.raw.body?.getReader()
    if (!reader) {
      resolve(c.json({ error: '无法读取请求体' }, 400))
      return
    }

    const readable = new Readable({
      async read() {
        const { done, value } = await reader.read()
        if (done) {
          this.push(null)
        } else {
          this.push(Buffer.from(value))
        }
      }
    })

    readable.pipe(bb)
  })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取上传的文件                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
file.get('/files/:fileId', async (c) => {
  const fileId = c.req.param('fileId')
  const uploadsDir = getUploadsDir()

  // 查找文件（可能有不同扩展名）
  if (!existsSync(uploadsDir)) {
    return c.json({ error: '文件不存在' }, 404)
  }

  const files = await readdir(uploadsDir)
  const matchedFile = files.find(f => f.startsWith(fileId))

  if (!matchedFile) {
    return c.json({ error: '文件不存在' }, 404)
  }

  const filePath = join(uploadsDir, matchedFile)
  const content = await readFile(filePath)
  const ext = matchedFile.split('.').pop()?.toLowerCase() || ''

  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    txt: 'text/plain',
    csv: 'text/csv',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
  }

  return new Response(content, {
    headers: { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' },
  })
})

export default file

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       用系统默认应用打开文件                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
file.post('/files/open', async (c) => {
  const body: { path?: string; url?: string } = await c.req.json<{ path?: string; url?: string }>().catch(() => ({}))
  const filePath = typeof body.path === 'string' ? body.path.trim() : ''
  const targetUrl = typeof body.url === 'string' ? body.url.trim() : ''

  if (!filePath && !targetUrl) {
    return c.json({ error: '缺少文件路径或 URL' }, 400)
  }

  if (filePath && targetUrl) {
    return c.json({ error: 'path 和 url 只能传一个' }, 400)
  }

  if (filePath && !existsSync(filePath)) {
    return c.json({ error: '文件不存在' }, 404)
  }

  const openTarget = filePath || targetUrl

  if (targetUrl) {
    const validationError = validateExternalUrl(targetUrl)
    if (validationError) {
      return c.json({ error: validationError }, 400)
    }
  }

  console.log(`[File] Opening target: ${openTarget}`)

  try {
    await openWithDefaultApp(openTarget)
    return c.json({ success: true, target: openTarget, type: targetUrl ? 'url' : 'path' })
  } catch (err) {
    console.error('[File] Failed to open target:', err)
    return c.json({ error: targetUrl ? '打开链接失败' : '打开文件失败', detail: err instanceof Error ? err.message : String(err) }, 500)
  }
})

function validateExternalUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl)
    const allowedProtocols = new Set([
      'http:',
      'https:',
      'mailto:',
      'chrome:',
      'microsoft-edge:',
      'googlechrome:',
    ])
    if (!allowedProtocols.has(parsed.protocol)) {
      return `不支持的链接协议: ${parsed.protocol}`
    }
    return null
  } catch {
    return '链接格式无效'
  }
}

function openWithDefaultApp(target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const { command, args } = getOpenCommand(target)
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    })

    let settled = false
    child.once('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
    child.once('spawn', () => {
      if (settled) return
      settled = true
      child.unref()
      resolve()
    })
  })
}

function getOpenCommand(target: string): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    return {
      command: 'cmd',
      args: ['/c', 'start', '""', target],
    }
  }

  if (process.platform === 'darwin') {
    return {
      command: 'open',
      args: [target],
    }
  }

  return {
    command: 'xdg-open',
    args: [target],
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       Office 文档转换 API                                 │
 * │                                                                          │
 * │  将 PPTX/DOCX 转换为 PDF，用于高质量预览                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */

file.get('/convert/check', (c) => {
  try {
    return c.json({
      available: isLibreOfficeAvailable(),
      ...getConverterDiagnostic(),
    })
  } catch (err) {
    console.error('[File] convert/check error:', err)
    return c.json({
      available: false,
      error: err instanceof Error ? err.message : '转换器检查失败',
      ...getConverterDiagnostic(),
    })
  }
})

file.post('/convert/pdf', async (c) => {
  try {
    const body = await c.req.json<{ path: string }>()
    const inputPath = body.path

    if (!inputPath) {
      return c.json({ error: '缺少文件路径' }, 400)
    }

    if (!existsSync(inputPath)) {
      return c.json({ error: '文件不存在' }, 404)
    }

    if (!isLibreOfficeAvailable()) {
      return c.json({ error: 'LibreOffice 未安装，无法转换' }, 503)
    }

    console.log(`[File] Converting to PDF: ${inputPath}`)
    const result = await convertToPdf(inputPath)

    if (!result.success) {
      return c.json({ error: result.error || '转换失败' }, 500)
    }

    return c.json({
      success: true,
      pdfPath: result.outputPath,
      cached: result.cached,
    })
  } catch (err) {
    console.error('[File] Convert PDF error:', err)
    return c.json({ error: err instanceof Error ? err.message : '转换失败' }, 500)
  }
})

file.get('/convert/pdf/*', async (c) => {
  /* 提供转换后的 PDF 文件访问 */
  const rawPath = c.req.path.replace('/api/convert/pdf/', '')
  const pdfPath = decodeURIComponent(rawPath)

  if (!existsSync(pdfPath)) {
    return c.json({ error: 'PDF 文件不存在' }, 404)
  }

  const content = await readFile(pdfPath)
  return new Response(content, {
    headers: { 'Content-Type': 'application/pdf' },
  })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       LibreOffice 下载 API                                │
 * │                                                                          │
 * │  首次使用时自动下载 LibreOffice，支持全平台                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */

file.get('/libreoffice/status', (c) => {
  return c.json({
    installed: isLibreOfficeDownloaded(),
    systemAvailable: isLibreOfficeAvailable(),
    progress: getDownloadProgress(),
    ...getDownloaderDiagnostic(),
  })
})

file.post('/libreoffice/download', async (c) => {
  console.log('[File] Starting LibreOffice download...')

  /* 异步启动下载，立即返回 */
  downloadLibreOffice().then(() => {
    /* 下载完成后重置检测缓存 */
    resetLibreOfficeCache()
  })

  return c.json({
    message: '下载已开始',
    progress: getDownloadProgress(),
  })
})

file.get('/libreoffice/progress', (c) => {
  return c.json(getDownloadProgress())
})
