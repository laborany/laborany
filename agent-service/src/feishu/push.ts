import type { Client } from '@larksuiteoapi/node-sdk'
import { basename, extname } from 'path'
import { createLarkClient } from './client.js'
import { loadFeishuConfig } from './config.js'

function getSrcApiBaseUrl(): string {
  return (process.env.SRC_API_BASE_URL || 'http://127.0.0.1:3620/api').replace(/\/+$/, '')
}
const MAX_ARTIFACTS_PER_RUN = 5
const MAX_ARTIFACT_BYTES = 20 * 1024 * 1024
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg'])
const IGNORE_ARTIFACT_NAMES = new Set(['history.txt', 'CLAUDE.md'])

interface TaskFileNode {
  name: string
  path: string
  type: 'file' | 'folder'
  ext?: string
  size?: number
  mtimeMs?: number
  updatedAt?: string
  children?: TaskFileNode[]
}

interface TaskFileSnapshot {
  path: string
  size: number
  mtimeMs: number
}

export interface FeishuArtifactPushResult {
  sent: number
  failed: number
  skipped: number
}

let cachedClient: Client | null = null
let cachedClientKey = ''

function getPushClient(): Client | null {
  const config = loadFeishuConfig()
  if (!config) return null

  const key = `${config.domain}:${config.appId}:${config.appSecret}`
  if (cachedClient && cachedClientKey === key) return cachedClient

  cachedClient = createLarkClient(config)
  cachedClientKey = key
  return cachedClient
}

function resolveFeishuFileType(fileName: string): 'pdf' | 'doc' | 'xls' | 'ppt' | 'stream' {
  const ext = extname(fileName).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (ext === '.doc' || ext === '.docx') return 'doc'
  if (ext === '.xls' || ext === '.xlsx') return 'xls'
  if (ext === '.ppt' || ext === '.pptx') return 'ppt'
  return 'stream'
}

function normalizeApiFilePath(path: string): string {
  return path
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')
}

function flattenTaskFiles(nodes: TaskFileNode[]): TaskFileSnapshot[] {
  const flattened: TaskFileSnapshot[] = []
  const visit = (node: TaskFileNode): void => {
    if (node.type === 'file') {
      flattened.push({
        path: node.path,
        size: Number(node.size || 0),
        mtimeMs: Number(node.mtimeMs || 0),
      })
      return
    }
    if (!Array.isArray(node.children)) return
    node.children.forEach(visit)
  }
  nodes.forEach(visit)
  return flattened
}

function shouldIgnoreArtifact(path: string): boolean {
  const name = basename(path)
  if (!name) return true
  if (IGNORE_ARTIFACT_NAMES.has(name)) return true
  if (name.startsWith('.')) return true
  return false
}

async function fetchTaskFiles(sessionId: string): Promise<TaskFileNode[]> {
  try {
    const response = await fetch(`${getSrcApiBaseUrl()}/task/${encodeURIComponent(sessionId)}/files`)
    if (!response.ok) return []
    const payload = await response.json() as { files?: unknown }
    return Array.isArray(payload.files) ? payload.files as TaskFileNode[] : []
  } catch {
    return []
  }
}

async function downloadTaskFile(sessionId: string, filePath: string): Promise<Buffer | null> {
  const normalizedPath = normalizeApiFilePath(filePath)
  try {
    const response = await fetch(`${getSrcApiBaseUrl()}/task/${encodeURIComponent(sessionId)}/files/${normalizedPath}`)
    if (!response.ok) return null
    const data = Buffer.from(await response.arrayBuffer())
    if (data.length > MAX_ARTIFACT_BYTES) {
      console.warn(`[FeishuPush] skip oversized artifact ${filePath}: ${data.length} bytes`)
      return null
    }
    return data
  } catch (error) {
    console.warn(`[FeishuPush] failed to download task artifact ${filePath}:`, error)
    return null
  }
}

async function sendFileToOpenId(
  client: Client,
  openId: string,
  fileName: string,
  buffer: Buffer,
): Promise<boolean> {
  try {
    const fileRes = await client.im.file.create({
      data: {
        file_type: resolveFeishuFileType(fileName),
        file_name: fileName,
        file: buffer,
      },
    })
    const fileKey = (fileRes as any)?.file_key
    if (!fileKey) return false
    await client.im.message.create({
      params: { receive_id_type: 'open_id' },
      data: {
        receive_id: openId,
        msg_type: 'file',
        content: JSON.stringify({ file_key: fileKey }),
      },
    })
    return true
  } catch (error) {
    console.warn(`[FeishuPush] failed to send file ${fileName}:`, error)
    return false
  }
}

async function sendImageToOpenId(
  client: Client,
  openId: string,
  fileName: string,
  buffer: Buffer,
): Promise<boolean> {
  try {
    const imageRes = await client.im.image.create({
      data: {
        image_type: 'message',
        image: buffer,
      },
    })
    const imageKey = (imageRes as any)?.image_key
    if (!imageKey) return false
    await client.im.message.create({
      params: { receive_id_type: 'open_id' },
      data: {
        receive_id: openId,
        msg_type: 'image',
        content: JSON.stringify({ image_key: imageKey }),
      },
    })
    return true
  } catch (error) {
    console.warn(`[FeishuPush] failed to send image ${fileName}:`, error)
    return false
  }
}

export async function sendTextToOpenId(openId: string, text: string): Promise<boolean> {
  const client = getPushClient()
  if (!client) return false

  try {
    await client.im.message.create({
      params: { receive_id_type: 'open_id' },
      data: {
        receive_id: openId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      },
    })
    return true
  } catch (error) {
    console.warn('[FeishuPush] failed to send text:', error)
    return false
  }
}

export async function sendArtifactsToOpenId(
  openId: string,
  sessionId: string,
  startedAfterMs?: number,
): Promise<FeishuArtifactPushResult> {
  const client = getPushClient()
  if (!client) {
    return { sent: 0, failed: 0, skipped: 0 }
  }

  const nodes = await fetchTaskFiles(sessionId)
  const files = flattenTaskFiles(nodes)
    .filter(item => !shouldIgnoreArtifact(item.path))
    .filter(item => {
      if (!startedAfterMs) return true
      return item.mtimeMs >= startedAfterMs - 1000
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)

  if (!files.length) {
    return { sent: 0, failed: 0, skipped: 0 }
  }

  const selected = files.slice(0, MAX_ARTIFACTS_PER_RUN)
  let sent = 0
  let failed = 0
  let skipped = Math.max(0, files.length - selected.length)

  for (const item of selected) {
    const fileName = basename(item.path) || item.path
    const payload = await downloadTaskFile(sessionId, item.path)
    if (!payload) {
      skipped += 1
      continue
    }

    const extension = extname(fileName).toLowerCase()
    let ok = false
    if (IMAGE_EXTENSIONS.has(extension)) {
      ok = await sendImageToOpenId(client, openId, fileName, payload)
      if (!ok && extension === '.svg') {
        ok = await sendFileToOpenId(client, openId, fileName, payload)
      }
    } else {
      ok = await sendFileToOpenId(client, openId, fileName, payload)
    }

    if (ok) sent += 1
    else failed += 1
  }

  return { sent, failed, skipped }
}
