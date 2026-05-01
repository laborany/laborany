import { resolveModelProfile } from '../lib/resolve-model-profile.js'
import { generateImageWithOpenAi, type GenerateImageInput, type GenerateImageResult } from './adapters/openai-image-gen.js'

export type { GenerateImageResult }

export async function generateImageWithProfile(input: GenerateImageInput): Promise<GenerateImageResult> {
  const profileId = (process.env.LABORANY_MODEL_PROFILE_ID || '').trim()
  const modelOverride = await resolveModelProfile(profileId)
  if (!modelOverride?.apiKey) {
    throw new Error('未配置可用的图片生成模型')
  }

  const taskDir = (process.env.LABORANY_TASK_DIR || '').trim()

  return generateImageWithOpenAi({
    apiKey: modelOverride.apiKey,
    baseUrl: modelOverride.baseUrl,
    model: modelOverride.model,
  }, input, taskDir)
}
