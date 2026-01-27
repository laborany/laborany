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
import busboy from 'busboy'

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
    // 过滤 history-*.txt 文件
    if (name.startsWith('history-') && name.endsWith('.txt')) return true
    return false
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
      const children = await listTaskFiles(baseDir, entryPath)
      if (children.length > 0) {
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
    return c.json({ files })
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
    return c.json({ files })
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

  return new Promise((resolve) => {
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
