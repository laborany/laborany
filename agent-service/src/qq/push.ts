/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     QQ Bot 产物回传模块                                  ║
 * ║                                                                        ║
 * ║  职责：将任务执行产生的文件回传给用户                                    ║
 * ║  设计：参考飞书 Bot push.ts                                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { basename, extname } from 'path'
import { createQQClient } from './client.js'
import { loadQQConfig } from './config.js'

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

export interface QQArtifactPushResult {
  sent: number
  failed: number
  skipped: number
}

let cachedClient: any | null = null
let cachedClientKey = ''

function getPushClient(): any | null {
  const config = loadQQConfig()
  if (!config) return null

  const key = `${config.appId}:${config.token || ''}:${config.secret || ''}:${config.sandbox ? '1' : '0'}`
  if (cachedClient && cachedClientKey === key) return cachedClient

  cachedClient = createQQClient(config)
  cachedClientKey = key
  return cachedClient
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
      console.warn(`[QQPush] skip oversized artifact ${filePath}: ${data.length} bytes`)
      return null
    }
    return data
  } catch (error) {
    console.warn(`[QQPush] failed to download task artifact ${filePath}:`, error)
    return null
  }
}

async function sendFileToTarget(
  client: any,
  targetId: string,
  targetType: 'c2c',
  fileName: string,
  buffer: Buffer,
): Promise<boolean> {
  try {
    const extension = extname(fileName).toLowerCase()
    const isImage = IMAGE_EXTENSIONS.has(extension)

    if (targetType === 'c2c') {
      // C2C 私聊消息：使用 postFile 上传文件
      const base64 = buffer.toString('base64')
      const fileRes = await client.c2cApi.postFile(targetId, {
        file_type: isImage ? 1 : 3,
        file_data: base64,
        srv_send_msg: true,
      })
      return !!fileRes?.data?.file_uuid
    }

    return false
  } catch (error) {
    console.warn(`[QQPush] failed to send file ${fileName}:`, error)
    return false
  }
}

export async function sendTextToTarget(
  targetId: string,
  targetType: 'c2c',
  text: string,
): Promise<boolean> {
  const client = getPushClient()
  if (!client) return false

  try {
    if (targetType === 'c2c') {
      await client.c2cApi.postMessage(targetId, { content: text, msg_type: 0 })
    }
    return true
  } catch (error) {
    console.warn('[QQPush] failed to send text:', error)
    return false
  }
}

export async function sendArtifactsToTarget(
  targetId: string,
  targetType: 'c2c',
  sessionId: string,
  startedAfterMs?: number,
): Promise<QQArtifactPushResult> {
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

    const ok = await sendFileToTarget(client, targetId, targetType, fileName, payload)

    if (ok) sent += 1
    else failed += 1
  }

  return { sent, failed, skipped }
}
