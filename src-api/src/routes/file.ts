/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         任务文件 API 路由                                  ║
 * ║                                                                          ║
 * ║  端点：列出任务目录文件、下载/预览文件                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Hono } from 'hono'
import { readFile, readdir, stat, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, createWriteStream } from 'fs'
import { homedir } from 'os'
import { v4 as uuid } from 'uuid'
import { Readable } from 'stream'
import { exec } from 'child_process'
import busboy from 'busboy'
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

const __dirname = dirname(fileURLToPath(import.meta.url))

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       任务目录路径                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getTasksDir(): string {
  const isProduction = process.env.NODE_ENV === 'production'

  if (isProduction) {
    const appDataDir = process.platform === 'win32'
      ? join(homedir(), 'AppData', 'Roaming', 'LaborAny')
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support', 'LaborAny')
        : join(homedir(), '.config', 'laborany')
    return join(appDataDir, 'tasks')
  }

  // 开发模式：相对于项目根目录
  return join(__dirname, '../../../tasks')
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
  children?: TaskFile[]
  stepIndex?: number    // 工作流步骤索引
  stepName?: string     // 工作流步骤名称
}

async function listTaskFiles(baseDir: string, relativePath: string): Promise<TaskFile[]> {
  const fullPath = relativePath ? join(baseDir, relativePath) : baseDir
  const entries = await readdir(fullPath, { withFileTypes: true })
  const files: TaskFile[] = []

  /* ┌────────────────────────────────────────────────────────────────────────┐
   * │  过滤系统文件和内部文件                                                  │
   * └────────────────────────────────────────────────────────────────────────┘ */
  const ignoreList = new Set(['history.txt', '.git', 'node_modules', '__pycache__', 'CLAUDE.md'])
  const shouldIgnore = (name: string): boolean => {
    if (ignoreList.has(name)) return true
    if (name.startsWith('history-') && name.endsWith('.txt')) return true
    return false
  }

  /* ┌────────────────────────────────────────────────────────────────────────┐
   * │  解析工作流步骤目录：step-N-名称                                         │
   * └────────────────────────────────────────────────────────────────────────┘ */
  const stepPattern = /^step-(\d+)-(.+)$/
  const parseStepDir = (name: string): { stepIndex: number; stepName: string } | null => {
    const match = name.match(stepPattern)
    if (!match) return null
    return { stepIndex: parseInt(match[1], 10), stepName: match[2] }
  }

  for (const entry of entries) {
    if (shouldIgnore(entry.name)) continue

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
 * │                       文件上传（工作流输入）                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getUploadsDir(): string {
  const isProduction = process.env.NODE_ENV === 'production'

  if (isProduction) {
    const appDataDir = process.platform === 'win32'
      ? join(homedir(), 'AppData', 'Roaming', 'LaborAny')
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support', 'LaborAny')
        : join(homedir(), '.config', 'laborany')
    return join(appDataDir, 'uploads')
  }

  return join(__dirname, '../../../uploads')
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
    let writeStream: ReturnType<typeof createWriteStream> | null = null

    const bb = busboy({ headers: { 'content-type': contentType } })

    bb.on('file', (fieldname, fileStream, info) => {
      console.log('[File] Receiving file:', info.filename)
      fileName = info.filename || 'upload'
      const ext = fileName.split('.').pop() || ''
      const savedFileName = ext ? `${fileId}.${ext}` : fileId
      filePath = join(uploadsDir, savedFileName)

      writeStream = createWriteStream(filePath)
      fileStream.pipe(writeStream)

      fileStream.on('data', (data: Buffer) => {
        fileSize += data.length
      })
    })

    bb.on('close', () => {
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
  const body = await c.req.json<{ path: string }>()
  const filePath = body.path

  if (!filePath) {
    return c.json({ error: '缺少文件路径' }, 400)
  }

  if (!existsSync(filePath)) {
    return c.json({ error: '文件不存在' }, 404)
  }

  console.log(`[File] Opening file: ${filePath}`)

  const command = process.platform === 'win32'
    ? `start "" "${filePath}"`
    : process.platform === 'darwin'
      ? `open "${filePath}"`
      : `xdg-open "${filePath}"`

  return new Promise<Response>((resolve) => {
    exec(command, (err) => {
      if (err) {
        console.error('[File] Failed to open file:', err)
        resolve(c.json({ error: '打开文件失败', detail: err.message }, 500))
      } else {
        resolve(c.json({ success: true }))
      }
    })
  })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       Office 文档转换 API                                 │
 * │                                                                          │
 * │  将 PPTX/DOCX 转换为 PDF，用于高质量预览                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */

file.get('/convert/check', (c) => {
  return c.json({
    available: isLibreOfficeAvailable(),
    ...getConverterDiagnostic(),
  })
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
