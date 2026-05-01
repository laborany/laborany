import type { VisionProfile } from './anthropic-vision.js'

function inferMediaType(imagePath: string): string {
  const lower = imagePath.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/jpeg'
}

export async function analyzeImageWithOpenAiCompatible(
  profile: VisionProfile,
  imageBase64: string,
  imagePath: string,
  prompt: string,
): Promise<string> {
  const response = await fetch(`${(profile.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${profile.apiKey}`,
    },
    body: JSON.stringify({
      model: (profile.model || '').trim() || 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${inferMediaType(imagePath)};base64,${imageBase64}` } },
        ],
      }],
      max_tokens: 300,
    }),
    signal: AbortSignal.timeout(30000),
  })

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }
  const analysis = data.choices?.[0]?.message?.content?.trim()
  if (!response.ok || !analysis) {
    throw new Error(data.error?.message || 'OpenAI-compatible 视觉理解请求失败')
  }
  return analysis
}
