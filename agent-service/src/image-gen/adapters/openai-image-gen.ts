export interface ImageGenProfile {
  apiKey: string
  baseUrl?: string
  model?: string
}

export interface GenerateImageInput {
  prompt: string
  fileName?: string
  size?: string
  aspectRatio?: string
  imageSize?: string
  style?: string
  quality?: string
  background?: string
  outputFormat?: string
}

export interface GenerateImageResult {
  savedPath: string
  summary: string
}

export async function generateImageWithOpenAi(
  profile: ImageGenProfile,
  input: GenerateImageInput,
  taskDir: string,
): Promise<GenerateImageResult> {
  const baseUrl = (profile.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const model = (profile.model || '').trim() || 'gpt-image-2'
  const size = input.size || '1024x1024'

  const body: Record<string, unknown> = {
    model,
    prompt: input.prompt,
    n: 1,
    size,
  }

  if (model.startsWith('dall-e-')) {
    body.style = input.style || 'natural'
    body.response_format = 'b64_json'
  } else if (!model.startsWith('gpt-image-')) {
    body.response_format = 'b64_json'
  }

  if (!model.startsWith('dall-e-')) {
    if (input.quality) body.quality = input.quality
    if (input.background) body.background = input.background
    if (input.outputFormat) body.output_format = input.outputFormat
  }

  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${profile.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  })

  const data = await response.json() as {
    data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>
    output?: Array<{ type?: string; result?: string; b64_json?: string; url?: string }>
    error?: { message?: string }
  }

  if (!response.ok) {
    throw new Error(data.error?.message || '图片生成请求失败')
  }

  const item = data.data?.[0] || data.output?.find((entry) => entry.result || entry.b64_json || entry.url)
  if (!item) {
    throw new Error('图片生成返回空结果')
  }

  let imageBuffer: Buffer
  const base64Image = 'result' in item ? item.result : item.b64_json
  if (base64Image) {
    imageBuffer = Buffer.from(base64Image, 'base64')
  } else if (item.url) {
    const imgRes = await fetch(item.url, { signal: AbortSignal.timeout(30000) })
    if (!imgRes.ok) throw new Error('下载生成图片失败')
    const arrayBuf = await imgRes.arrayBuffer()
    imageBuffer = Buffer.from(arrayBuf)
  } else {
    throw new Error('图片生成返回无数据')
  }

  const outputExt = (input.outputFormat || 'png').replace(/^\./, '').toLowerCase() || 'png'
  const requestedFileName = input.fileName?.trim()
  const fileName = requestedFileName
    ? (/\.[a-z0-9]+$/i.test(requestedFileName) ? requestedFileName : `${requestedFileName}.${outputExt}`)
    : `generated_${Date.now()}.${outputExt}`
  const { mkdirSync, writeFileSync } = await import('fs')
  const { dirname, join } = await import('path')
  const savedPath = join(taskDir, fileName)
  mkdirSync(dirname(savedPath), { recursive: true })
  writeFileSync(savedPath, imageBuffer)

  const revisedPrompt = 'revised_prompt' in item && item.revised_prompt ? item.revised_prompt : input.prompt
  const summary = `图片已生成并保存到: ${fileName}\n原始提示词: ${input.prompt}\n实际提示词: ${revisedPrompt}`

  return { savedPath, summary }
}
