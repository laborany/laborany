/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         任务文件 API 路由                                  ║
 * ║                                                                          ║
 * ║  端点：列出任务目录文件、下载/预览文件                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Hono } from 'hono'
import { readFile, readdir, stat } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { homedir } from 'os'

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

  const ignoreList = new Set(['history.txt', '.git', 'node_modules', '__pycache__'])

  for (const entry of entries) {
    if (ignoreList.has(entry.name)) continue

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
  const filePath = c.req.path.replace(`/${pathPrefix}/${sessionId}/files/`, '')
  const taskDir = join(TASKS_DIR, sessionId)
  const fullPath = join(taskDir, filePath)

  // 安全检查
  if (!fullPath.startsWith(taskDir)) {
    return c.json({ error: '禁止访问' }, 403)
  }

  if (!existsSync(fullPath)) {
    return c.json({ error: '文件不存在' }, 404)
  }

  try {
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const mimeTypes: Record<string, string> = {
      html: 'text/html',
      htm: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      json: 'application/json',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      pdf: 'application/pdf',
      txt: 'text/plain',
      md: 'text/markdown',
      csv: 'text/csv',
      xml: 'application/xml',
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

export default file
