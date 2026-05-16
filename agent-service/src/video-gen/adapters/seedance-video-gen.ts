import {
  formatTosMissingConfigMessage,
  readTosStorageConfig,
  uploadLocalMediaToTos,
} from '../tos-storage.js'

export interface VideoGenProfile {
  apiKey: string
  baseUrl?: string
  model?: string
}

export interface VideoReferenceInput {
  url?: string
  path?: string
  role?: string
  type?: 'image' | 'video' | 'audio'
}

export interface GenerateVideoInput {
  prompt: string
  fileName?: string
  ratio?: string
  duration?: number
  resolution?: string
  generateAudio?: boolean
  watermark?: boolean
  returnLastFrame?: boolean
  references?: VideoReferenceInput[]
  pollIntervalMs?: number
  timeoutMs?: number
}

export interface GenerateVideoResult {
  savedPath: string
  taskId: string
  videoUrl: string
  summary: string
}

interface SeedanceTaskResponse {
  id?: string
  model?: string
  status?: 'queued' | 'running' | 'cancelled' | 'succeeded' | 'failed' | 'expired' | string
  error?: { code?: string; message?: string } | null
  content?: {
    video_url?: string
    last_frame_url?: string
  } | null
}

function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '')
}

function inferReferenceType(reference: VideoReferenceInput): 'image' | 'video' | 'audio' {
  if (reference.type) return reference.type
  const role = reference.role || ''
  if (role.includes('audio')) return 'audio'
  if (role.includes('video')) return 'video'

  const value = reference.url || reference.path || ''
  const ext = value.split(/[?#]/)[0]?.split('.').pop()?.toLowerCase()
  if (ext && ['mp4', 'mov'].includes(ext)) return 'video'
  if (ext && ['wav', 'mp3'].includes(ext)) return 'audio'
  return 'image'
}

function inferMimeType(filePath: string, type: 'image' | 'video' | 'audio'): string {
  const ext = filePath.split(/[?#]/)[0]?.split('.').pop()?.toLowerCase()
  if (type === 'audio') {
    if (ext === 'mp3') return 'audio/mp3'
    return 'audio/wav'
  }
  if (type === 'video') {
    if (ext === 'mov') return 'video/quicktime'
    return 'video/mp4'
  }
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'bmp') return 'image/bmp'
  if (ext === 'tif' || ext === 'tiff') return 'image/tiff'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'heic') return 'image/heic'
  if (ext === 'heif') return 'image/heif'
  return 'image/png'
}

function looksLikeRemoteReference(value: string): boolean {
  return /^(https?:\/\/|data:|asset:\/\/)/i.test(value)
}

async function resolveReferenceUrl(
  reference: VideoReferenceInput,
  type: 'image' | 'video' | 'audio',
  taskDir: string,
): Promise<string> {
  const rawValue = (reference.url || reference.path || '').trim()
  if (!rawValue) {
    throw new Error('视频生成 reference 缺少 url 或 path')
  }
  if (looksLikeRemoteReference(rawValue)) return rawValue

  const { readFile, stat } = await import('fs/promises')
  const { isAbsolute, resolve } = await import('path')
  const fullPath = isAbsolute(rawValue) ? rawValue : resolve(taskDir, rawValue)
  const fileStat = await stat(fullPath)
  const mimeType = inferMimeType(fullPath, type)

  if (type === 'video') {
    const tosStatus = readTosStorageConfig()
    if (!tosStatus.config) {
      throw new Error(`${formatTosMissingConfigMessage(tosStatus)}；也可以改用公网 URL 或 asset:// 素材 ID`)
    }
    return (await uploadLocalMediaToTos(fullPath, mimeType)).url
  }

  const maxBytes = type === 'audio' ? 15 * 1024 * 1024 : 30 * 1024 * 1024
  if (fileStat.size > maxBytes) {
    const tosStatus = readTosStorageConfig()
    if (tosStatus.config) {
      return (await uploadLocalMediaToTos(fullPath, mimeType)).url
    }
    throw new Error(`${type === 'audio' ? '音频' : '图片'} reference 超过 Seedance base64 限制，请改用公网 URL 或 asset:// 素材 ID`)
  }

  const base64 = (await readFile(fullPath)).toString('base64')
  return `data:${mimeType};base64,${base64}`
}

async function normalizeReference(reference: VideoReferenceInput, taskDir: string): Promise<Record<string, unknown>> {
  const type = reference.type
    || inferReferenceType(reference)
  const url = await resolveReferenceUrl(reference, type, taskDir)
  if (type === 'video') {
    return {
      type: 'video_url',
      video_url: { url },
      role: reference.role || 'reference_video',
    }
  }
  if (type === 'audio') {
    return {
      type: 'audio_url',
      audio_url: { url },
      role: reference.role || 'reference_audio',
    }
  }
  return {
    type: 'image_url',
    image_url: { url },
    role: reference.role || 'reference_image',
  }
}

async function readJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const text = await response.text()
  let data: unknown = {}
  if (text.trim()) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: { message: text.slice(0, 500) } }
    }
  }
  if (!response.ok) {
    const message = typeof data === 'object' && data && 'error' in data
      ? ((data as { error?: { message?: string } }).error?.message || fallbackMessage)
      : fallbackMessage
    throw new Error(message)
  }
  return data as T
}

export async function generateVideoWithSeedance(
  profile: VideoGenProfile,
  input: GenerateVideoInput,
  taskDir: string,
): Promise<GenerateVideoResult> {
  const baseUrl = normalizeBaseUrl(profile.baseUrl)
  const model = (profile.model || '').trim() || 'doubao-seedance-2-0-260128'
  const references = await Promise.all((input.references || []).map((reference) => normalizeReference(reference, taskDir)))
  const createBody: Record<string, unknown> = {
    model,
    content: [
      { type: 'text', text: input.prompt },
      ...references,
    ],
  }

  if (input.ratio) createBody.ratio = input.ratio
  if (typeof input.duration === 'number' && Number.isFinite(input.duration)) createBody.duration = input.duration
  if (input.resolution) createBody.resolution = input.resolution
  if (typeof input.generateAudio === 'boolean') createBody.generate_audio = input.generateAudio
  if (typeof input.watermark === 'boolean') createBody.watermark = input.watermark
  if (typeof input.returnLastFrame === 'boolean') createBody.return_last_frame = input.returnLastFrame

  const createResponse = await fetch(`${baseUrl}/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${profile.apiKey}`,
    },
    body: JSON.stringify(createBody),
    signal: AbortSignal.timeout(30000),
  })
  const createData = await readJsonResponse<SeedanceTaskResponse>(createResponse, '视频生成任务创建失败')
  const taskId = createData.id
  if (!taskId) {
    throw new Error('视频生成任务创建成功但未返回任务 ID')
  }

  const pollIntervalMs = Math.max(5_000, input.pollIntervalMs || 15_000)
  const timeoutMs = Math.max(60_000, input.timeoutMs || 15 * 60_000)
  const deadline = Date.now() + timeoutMs
  let taskData: SeedanceTaskResponse = createData

  while (Date.now() < deadline) {
    const status = taskData.status
    if (status === 'succeeded') break
    if (status === 'failed' || status === 'cancelled' || status === 'expired') {
      throw new Error(taskData.error?.message || `视频生成任务结束: ${status}`)
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    const pollResponse = await fetch(`${baseUrl}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${profile.apiKey}`,
      },
      signal: AbortSignal.timeout(30000),
    })
    taskData = await readJsonResponse<SeedanceTaskResponse>(pollResponse, '视频生成任务查询失败')
  }

  if (taskData.status !== 'succeeded') {
    throw new Error(`视频生成超时，任务 ID: ${taskId}`)
  }

  const videoUrl = taskData.content?.video_url
  if (!videoUrl) {
    throw new Error('视频生成成功但未返回 video_url')
  }

  const videoResponse = await fetch(videoUrl, { signal: AbortSignal.timeout(120000) })
  if (!videoResponse.ok) {
    throw new Error('下载生成视频失败')
  }
  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer())
  const requestedFileName = input.fileName?.trim()
  const fileName = requestedFileName
    ? (/\.[a-z0-9]+$/i.test(requestedFileName) ? requestedFileName : `${requestedFileName}.mp4`)
    : `generated_${Date.now()}.mp4`
  const { mkdirSync, writeFileSync } = await import('fs')
  const { dirname, join } = await import('path')
  const savedPath = join(taskDir, fileName)
  mkdirSync(dirname(savedPath), { recursive: true })
  writeFileSync(savedPath, videoBuffer)

  const summary = [
    `视频已生成并保存到: ${fileName}`,
    `任务 ID: ${taskId}`,
    `原始提示词: ${input.prompt}`,
    `远程视频 URL: ${videoUrl}`,
  ].join('\n')

  return { savedPath, taskId, videoUrl, summary }
}
