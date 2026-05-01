export interface ImageGenProfile {
  apiKey: string
  baseUrl?: string
  model?: string
}

export interface GenerateImageInput {
  prompt: string
  fileName?: string
  size?: string
  style?: string
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
  const model = (profile.model || '').trim() || 'dall-e-3'
  const size = input.size || '1024x1024'
  const style = input.style || 'natural'

  const body: Record<string, unknown> = {
    model,
    prompt: input.prompt,
    n: 1,
    size,
    style,
    response_format: 'b64_json',
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
    error?: { message?: string }
  }

  if (!response.ok) {
    throw new Error(data.error?.message || '图片生成请求失败')
  }

  const item = data.data?.[0]
  if (!item) {
    throw new Error('图片生成返回空结果')
  }

  let imageBuffer: Buffer
  if (item.b64_json) {
    imageBuffer = Buffer.from(item.b64_json, 'base64')
  } else if (item.url) {
    const imgRes = await fetch(item.url, { signal: AbortSignal.timeout(30000) })
    if (!imgRes.ok) throw new Error('下载生成图片失败')
    const arrayBuf = await imgRes.arrayBuffer()
    imageBuffer = Buffer.from(arrayBuf)
  } else {
    throw new Error('图片生成返回无数据')
  }

  const fileName = input.fileName || `generated_${Date.now()}.png`
  const { writeFileSync } = await import('fs')
  const { join } = await import('path')
  const savedPath = join(taskDir, fileName)
  writeFileSync(savedPath, imageBuffer)

  const revisedPrompt = item.revised_prompt || input.prompt
  const summary = `图片已生成并保存到: ${fileName}\n原始提示词: ${input.prompt}\n实际提示词: ${revisedPrompt}`

  return { savedPath, summary }
}
