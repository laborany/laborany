/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Files API 路由                                  ║
 * ║                                                                          ║
 * ║  职责：处理任务文件相关的 HTTP 请求                                       ║
 * ║  包含：文件列表、文件下载/预览、健康检查                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Router, Request, Response } from 'express'
import { readFile, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TASKS_DIR = join(__dirname, '../../../tasks')

const router = Router()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                         健康检查端点                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       任务目录文件列表                                     │
 * │  列出 Skill 执行过程中产生的文件（HTML、文档、图片等）                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.get('/tasks/:sessionId/files', async (req: Request, res: Response) => {
  const { sessionId } = req.params
  const taskDir = join(TASKS_DIR, sessionId)

  if (!existsSync(taskDir)) {
    res.status(404).json({ error: '任务目录不存在' })
    return
  }

  try {
    const files = await listTaskFiles(taskDir, '')
    res.json({ files, workDir: taskDir })
  } catch (error) {
    res.status(500).json({ error: '获取文件列表失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       下载/预览任务文件                                    │
 * │  支持 HTML 预览、图片预览、文件下载                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.get('/tasks/:sessionId/files/*', async (req: Request, res: Response) => {
  const { sessionId } = req.params
  const filePath = req.params[0]
  const taskDir = join(TASKS_DIR, sessionId)
  const fullPath = join(taskDir, filePath)

  if (!fullPath.startsWith(taskDir)) {
    res.status(403).json({ error: '禁止访问' })
    return
  }

  if (!existsSync(fullPath)) {
    res.status(404).json({ error: '文件不存在' })
    return
  }

  try {
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    const isPreviewable = PREVIEWABLE_EXTS.has(ext)

    res.setHeader('Content-Type', contentType)

    if (!isPreviewable) {
      const filename = filePath.split('/').pop() || 'download'
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    }

    const content = await readFile(fullPath)
    res.send(content)
  } catch (error) {
    res.status(500).json({ error: '读取文件失败' })
  }
})

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         辅助函数与常量                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

const MIME_TYPES: Record<string, string> = {
  html: 'text/html', htm: 'text/html', css: 'text/css',
  js: 'application/javascript', json: 'application/json',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', svg: 'image/svg+xml', pdf: 'application/pdf',
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
  xml: 'application/xml',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

const PREVIEWABLE_EXTS = new Set([
  'html', 'htm', 'png', 'jpg', 'jpeg', 'gif', 'svg',
  'pdf', 'txt', 'md', 'json', 'css', 'js',
])

const IGNORE_LIST = new Set(['history.txt', '.git', 'node_modules', '__pycache__'])

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       递归列出任务目录文件                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface TaskFile {
  name: string
  path: string
  type: 'file' | 'folder'
  ext?: string
  size?: number
  children?: TaskFile[]
  stepIndex?: number
  stepName?: string
}

function parseStepDir(dirName: string): { index: number; name: string } | null {
  const match = dirName.match(/^step-(\d+)-(.+)$/)
  if (!match) return null
  return { index: parseInt(match[1], 10), name: match[2] }
}

async function listTaskFiles(baseDir: string, relativePath: string): Promise<TaskFile[]> {
  const fullPath = relativePath ? join(baseDir, relativePath) : baseDir
  const entries = await readdir(fullPath, { withFileTypes: true })
  const files: TaskFile[] = []

  for (const entry of entries) {
    if (IGNORE_LIST.has(entry.name)) continue

    const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name

    if (entry.isFile()) {
      const ext = entry.name.split('.').pop()?.toLowerCase() || ''
      const { stat } = await import('fs/promises')
      const fileStat = await stat(join(fullPath, entry.name))
      files.push({ name: entry.name, path: entryPath, type: 'file', ext, size: fileStat.size })
    } else if (entry.isDirectory()) {
      const children = await listTaskFiles(baseDir, entryPath)
      if (children.length > 0) {
        const stepInfo = parseStepDir(entry.name)
        files.push({
          name: entry.name, path: entryPath, type: 'folder', children,
          ...(stepInfo && { stepIndex: stepInfo.index, stepName: stepInfo.name }),
        })
      }
    }
  }

  return files
}

export default router
