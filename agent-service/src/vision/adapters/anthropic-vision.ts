export interface VisionProfile {
  apiKey: string
  baseUrl?: string
  model?: string
}

function inferMediaType(imagePath: string): string {
  const lower = imagePath.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/jpeg'
}

export async function analyzeImageWithAnthropic(
  profile: VisionProfile,
  imageBase64: string,
  imagePath: string,
  prompt: string,
): Promise<string> {
  const response = await fetch(`${(profile.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': profile.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: (profile.model || '').trim() || 'claude-3-5-sonnet-latest',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: inferMediaType(imagePath),
              data: imageBase64,
            },
          },
        ],
      }],
    }),
    signal: AbortSignal.timeout(30000),
  })

  const data = await response.json() as { content?: Array<{ type?: string; text?: string }>; error?: { message?: string } }
  const analysis = data.content?.filter(item => item.type === 'text').map(item => item.text || '').join('\n').trim()
  if (!response.ok || !analysis) {
    throw new Error(data.error?.message || 'Anthropic 视觉理解请求失败')
  }
  return analysis
}
