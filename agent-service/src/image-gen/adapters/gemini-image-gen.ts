import type { ImageGenProfile, GenerateImageInput, GenerateImageResult } from './openai-image-gen.js'

interface GeminiPart {
  text?: string
  inlineData?: {
    mimeType?: string
    data?: string
  }
}

function inferExtension(mimeType?: string): string {
  if (!mimeType) return 'png'
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg'
  if (mimeType.includes('webp')) return 'webp'
  return 'png'
}

function buildGeminiUrl(baseUrl: string, model: string): string {
  const normalized = (baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')
  return `${normalized}/models/${encodeURIComponent(model)}:generateContent`
}

function normalizeAspectRatio(input: GenerateImageInput): string | undefined {
  const explicit = input.aspectRatio?.trim()
  if (explicit) return explicit

  const size = input.size?.trim()
  const match = size?.match(/^(\d+)\s*x\s*(\d+)$/i)
  if (!match) return undefined

  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined

  const supported = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']
  const ratio = width / height
  return supported.reduce((best, current) => {
    const [w, h] = current.split(':').map(Number)
    const bestParts = best.split(':').map(Number)
    const currentDelta = Math.abs(ratio - w / h)
    const bestDelta = Math.abs(ratio - bestParts[0] / bestParts[1])
    return currentDelta < bestDelta ? current : best
  }, '1:1')
}

function normalizeImageSize(input: GenerateImageInput): string | undefined {
  const explicit = input.imageSize?.trim()
  if (explicit) return explicit.toUpperCase()

  const size = input.size?.trim()
  const match = size?.match(/^(\d+)\s*x\s*(\d+)$/i)
  if (!match) return undefined
  const longestSide = Math.max(Number(match[1]), Number(match[2]))
  if (!Number.isFinite(longestSide) || longestSide <= 0) return undefined
  if (longestSide <= 800) return '1K'
  if (longestSide <= 2000) return '2K'
  return '4K'
}

export async function generateImageWithGemini(
  profile: ImageGenProfile,
  input: GenerateImageInput,
  taskDir: string,
): Promise<GenerateImageResult> {
  const model = (profile.model || '').trim() || 'gemini-3.1-flash-image-preview'
  const aspectRatio = normalizeAspectRatio(input)
  const imageSize = normalizeImageSize(input)
  const body: Record<string, unknown> = {
    contents: [{
      role: 'user',
      parts: [{ text: input.prompt }],
    }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      ...(aspectRatio || imageSize
        ? {
          responseFormat: {
            image: {
              ...(aspectRatio ? { aspectRatio } : {}),
              ...(imageSize ? { imageSize } : {}),
            },
          },
        }
        : {}),
    },
  }

  const response = await fetch(buildGeminiUrl(profile.baseUrl || '', model), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': profile.apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  })

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: GeminiPart[] } }>
    error?: { message?: string }
  }

  if (!response.ok) {
    throw new Error(data.error?.message || 'Gemini 图片生成请求失败')
  }

  const parts = data.candidates?.[0]?.content?.parts || []
  const imagePart = parts.find((part) => part.inlineData?.data)
  if (!imagePart?.inlineData?.data) {
    throw new Error('Gemini 图片生成返回空结果')
  }

  const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64')
  const extension = inferExtension(imagePart.inlineData.mimeType)
  const requestedFileName = input.fileName?.trim()
  const fileName = requestedFileName
    ? (/\.[a-z0-9]+$/i.test(requestedFileName) ? requestedFileName : `${requestedFileName}.${extension}`)
    : `generated_${Date.now()}.${extension}`
  const { mkdirSync, writeFileSync } = await import('fs')
  const { dirname, join } = await import('path')
  const savedPath = join(taskDir, fileName)
  mkdirSync(dirname(savedPath), { recursive: true })
  writeFileSync(savedPath, imageBuffer)

  const textSummary = parts
    .map((part) => part.text || '')
    .filter(Boolean)
    .join('\n')
    .trim()
  const summary = [
    `图片已生成并保存到: ${fileName}`,
    `原始提示词: ${input.prompt}`,
    textSummary ? `模型说明: ${textSummary}` : '',
  ].filter(Boolean).join('\n')

  return { savedPath, summary }
}
