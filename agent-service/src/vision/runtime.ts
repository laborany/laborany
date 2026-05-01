import { readFile } from 'fs/promises'
import { resolveModelProfile } from '../lib/resolve-model-profile.js'
import { analyzeImageWithAnthropic } from './adapters/anthropic-vision.js'
import { analyzeImageWithOpenAiCompatible } from './adapters/openai-vision.js'

interface AnalyzeImageInput {
  imagePath: string
  query?: string
}

export async function analyzeImageWithProfile(input: AnalyzeImageInput): Promise<string> {
  const profileId = (process.env.LABORANY_MODEL_PROFILE_ID || '').trim()
  const modelOverride = await resolveModelProfile(profileId)
  if (!modelOverride?.apiKey) {
    throw new Error('未配置可用的视觉理解模型')
  }

  const imageBuffer = await readFile(input.imagePath)
  const imageBase64 = imageBuffer.toString('base64')
  const prompt = input.query || '请详细分析这张图片的内容。'

  if (modelOverride.interfaceType === 'openai_compatible') {
    return analyzeImageWithOpenAiCompatible({
      apiKey: modelOverride.apiKey,
      baseUrl: modelOverride.baseUrl,
      model: modelOverride.model,
    }, imageBase64, input.imagePath, prompt)
  }

  return analyzeImageWithAnthropic({
    apiKey: modelOverride.apiKey,
    baseUrl: modelOverride.baseUrl,
    model: modelOverride.model,
  }, imageBase64, input.imagePath, prompt)
}
