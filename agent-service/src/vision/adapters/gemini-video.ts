import { basename, extname } from 'path'
import { readFile, stat } from 'fs/promises'

export interface GeminiVisionProfile {
  apiKey: string
  baseUrl?: string
  model?: string
}

export interface GeminiVideoInput {
  videoPath: string
  query: string
  fps?: number
  startOffset?: string
  endOffset?: string
  mediaResolution?: 'low' | 'medium' | 'high'
}

interface GeminiPart {
  text?: string
  inlineData?: {
    mimeType?: string
    data?: string
  }
  inline_data?: {
    mime_type?: string
    data?: string
  }
}

interface GeminiGenerateResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>
  error?: { message?: string }
}

interface GeminiFileResource {
  name?: string
  uri?: string
  mimeType?: string
  mime_type?: string
  state?: string
}

const INLINE_VIDEO_LIMIT_BYTES = 20 * 1024 * 1024

function normalizeApiBaseUrl(baseUrl?: string): string {
  return (baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')
}

function normalizeUploadBaseUrl(baseUrl?: string): string {
  const normalized = normalizeApiBaseUrl(baseUrl)
  try {
    const url = new URL(normalized)
    if (!url.pathname.includes('/upload/')) {
      url.pathname = url.pathname.replace(/\/v1(?:beta)?$/, (version) => `/upload${version}`)
    }
    return url.toString().replace(/\/+$/, '')
  } catch {
    return 'https://generativelanguage.googleapis.com/upload/v1beta'
  }
}

function normalizeModelName(model?: string): string {
  const trimmed = (model || '').trim() || 'gemini-3-flash-preview'
  return trimmed.replace(/^models\//, '')
}

function buildGenerateUrl(profile: GeminiVisionProfile): string {
  return `${normalizeApiBaseUrl(profile.baseUrl)}/models/${encodeURIComponent(normalizeModelName(profile.model))}:generateContent`
}

function inferVideoMimeType(videoPath: string): string {
  const ext = extname(videoPath).toLowerCase()
  if (ext === '.mov' || ext === '.qt') return 'video/quicktime'
  if (ext === '.avi') return 'video/avi'
  if (ext === '.flv') return 'video/x-flv'
  if (ext === '.mpg') return 'video/mpg'
  if (ext === '.mpeg') return 'video/mpeg'
  if (ext === '.webm') return 'video/webm'
  if (ext === '.wmv') return 'video/wmv'
  if (ext === '.3gp' || ext === '.3gpp') return 'video/3gpp'
  return 'video/mp4'
}

function buildVideoMetadata(input: GeminiVideoInput): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = {}
  if (typeof input.fps === 'number' && Number.isFinite(input.fps) && input.fps > 0) {
    metadata.fps = input.fps
  }
  if (input.startOffset?.trim()) {
    metadata.start_offset = input.startOffset.trim()
  }
  if (input.endOffset?.trim()) {
    metadata.end_offset = input.endOffset.trim()
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined
}

function buildGenerationConfig(input: GeminiVideoInput): Record<string, unknown> | undefined {
  if (!input.mediaResolution) return undefined
  const mediaResolution = {
    low: 'MEDIA_RESOLUTION_LOW',
    medium: 'MEDIA_RESOLUTION_MEDIUM',
    high: 'MEDIA_RESOLUTION_HIGH',
  }[input.mediaResolution]
  return {
    media_resolution: mediaResolution,
  }
}

async function readGeminiJson<T>(response: Response, fallbackMessage: string): Promise<T> {
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

async function uploadVideoFile(
  profile: GeminiVisionProfile,
  videoPath: string,
  mimeType: string,
): Promise<GeminiFileResource> {
  const fileInfo = await stat(videoPath)
  const startResponse = await fetch(`${normalizeUploadBaseUrl(profile.baseUrl)}/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': profile.apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(fileInfo.size),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: basename(videoPath) } }),
    signal: AbortSignal.timeout(30000),
  })

  if (!startResponse.ok) {
    const detail = await startResponse.text().catch(() => '')
    throw new Error(`Gemini 视频上传初始化失败: ${detail.slice(0, 500)}`)
  }

  const uploadUrl = startResponse.headers.get('x-goog-upload-url')
  if (!uploadUrl) {
    throw new Error('Gemini 视频上传初始化成功但未返回上传 URL')
  }

  const videoBuffer = await readFile(videoPath)
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(videoBuffer.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: videoBuffer,
    signal: AbortSignal.timeout(10 * 60_000),
  })

  const uploaded = await readGeminiJson<{ file?: GeminiFileResource }>(
    uploadResponse,
    'Gemini 视频上传失败',
  )
  const file = uploaded.file
  if (!file?.uri) {
    throw new Error('Gemini 视频上传成功但未返回 file.uri')
  }

  return waitForFileReady(profile, file)
}

async function waitForFileReady(profile: GeminiVisionProfile, file: GeminiFileResource): Promise<GeminiFileResource> {
  const name = file.name?.trim()
  if (!name || !file.state || file.state === 'ACTIVE') return file

  const deadline = Date.now() + 3 * 60_000
  let current = file
  while (Date.now() < deadline) {
    const state = current.state
    if (!state || state === 'ACTIVE') return current
    if (state === 'FAILED') {
      throw new Error('Gemini 视频文件处理失败')
    }

    await new Promise((resolve) => setTimeout(resolve, 3000))
    const response = await fetch(`${normalizeApiBaseUrl(profile.baseUrl)}/${name}`, {
      method: 'GET',
      headers: { 'x-goog-api-key': profile.apiKey },
      signal: AbortSignal.timeout(30000),
    })
    current = await readGeminiJson<GeminiFileResource>(response, 'Gemini 视频文件状态查询失败')
  }

  throw new Error('Gemini 视频文件处理超时')
}

async function generateFromVideoPart(
  profile: GeminiVisionProfile,
  input: GeminiVideoInput,
  videoPart: Record<string, unknown>,
): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{
      role: 'user',
      parts: [
        videoPart,
        { text: input.query },
      ],
    }],
  }
  const generationConfig = buildGenerationConfig(input)
  if (generationConfig) {
    body.generationConfig = generationConfig
  }

  const response = await fetch(buildGenerateUrl(profile), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': profile.apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5 * 60_000),
  })

  const data = await readGeminiJson<GeminiGenerateResponse>(response, 'Gemini 原生视频理解请求失败')
  const analysis = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .filter(Boolean)
    .join('\n')
    .trim()

  if (!analysis) {
    throw new Error(data.error?.message || 'Gemini 原生视频理解返回空结果')
  }

  return analysis
}

export async function analyzeVideoWithGeminiNative(
  profile: GeminiVisionProfile,
  input: GeminiVideoInput,
): Promise<string> {
  const mimeType = inferVideoMimeType(input.videoPath)
  const metadata = buildVideoMetadata(input)
  const fileInfo = await stat(input.videoPath)

  if (fileInfo.size <= INLINE_VIDEO_LIMIT_BYTES) {
    const videoBase64 = (await readFile(input.videoPath)).toString('base64')
    const videoPart: Record<string, unknown> = {
      inline_data: {
        mime_type: mimeType,
        data: videoBase64,
      },
    }
    if (metadata) videoPart.video_metadata = metadata
    return generateFromVideoPart(profile, input, videoPart)
  }

  const file = await uploadVideoFile(profile, input.videoPath, mimeType)
  const videoPart: Record<string, unknown> = {
    file_data: {
      mime_type: file.mimeType || file.mime_type || mimeType,
      file_uri: file.uri,
    },
  }
  if (metadata) videoPart.video_metadata = metadata
  return generateFromVideoPart(profile, input, videoPart)
}
