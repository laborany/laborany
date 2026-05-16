import { resolveModelProfile } from '../lib/resolve-model-profile.js'
import {
  generateVideoWithSeedance,
  type GenerateVideoInput,
  type GenerateVideoResult,
} from './adapters/seedance-video-gen.js'

export type { GenerateVideoResult, GenerateVideoInput, VideoReferenceInput } from './adapters/seedance-video-gen.js'

export async function generateVideoWithProfile(input: GenerateVideoInput): Promise<GenerateVideoResult> {
  const profileId = (process.env.LABORANY_MODEL_PROFILE_ID || '').trim()
  const modelOverride = await resolveModelProfile(profileId)
  if (!modelOverride?.apiKey) {
    throw new Error('未配置可用的视频生成模型')
  }

  const taskDir = (process.env.LABORANY_TASK_DIR || '').trim()
  return generateVideoWithSeedance({
    apiKey: modelOverride.apiKey,
    baseUrl: modelOverride.baseUrl,
    model: modelOverride.model,
  }, input, taskDir)
}
