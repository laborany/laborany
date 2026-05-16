import { mkdtemp, readFile, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { spawn } from 'child_process'
import { resolveModelProfile } from '../lib/resolve-model-profile.js'
import { analyzeImageWithAnthropic } from './adapters/anthropic-vision.js'
import { analyzeImageWithOpenAiCompatible } from './adapters/openai-vision.js'
import { analyzeVideoWithGeminiNative } from './adapters/gemini-video.js'

interface AnalyzeImageInput {
  imagePath: string
  query?: string
}

type AnalyzeVideoMode = 'frames' | 'native' | 'auto'

interface AnalyzeVideoInput {
  videoPath: string
  query?: string
  frameCount?: number
  mode?: AnalyzeVideoMode
  fps?: number
  startOffset?: string
  endOffset?: string
  mediaResolution?: 'low' | 'medium' | 'high'
}

type ResolvedVisionProfile = NonNullable<Awaited<ReturnType<typeof resolveModelProfile>>>

async function resolveVisionProfile(): Promise<ResolvedVisionProfile> {
  const profileId = (process.env.LABORANY_MODEL_PROFILE_ID || '').trim()
  const modelOverride = await resolveModelProfile(profileId)
  if (!modelOverride?.apiKey) {
    throw new Error('未配置可用的视觉理解模型')
  }
  return modelOverride
}

function isGeminiProfile(profile: ResolvedVisionProfile): boolean {
  const model = (profile.model || '').toLowerCase()
  const baseUrl = (profile.baseUrl || '').toLowerCase()
  return model.includes('gemini') || baseUrl.includes('generativelanguage.googleapis.com')
}

function resolveFfmpegCommand(): string {
  const configured = (process.env.LABORANY_FFMPEG || '').trim()
  if (configured && existsSync(configured)) return configured
  return 'ffmpeg'
}

async function runFfmpeg(args: string[]): Promise<void> {
  const command = resolveFfmpegCommand()
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
      if (stderr.length > 2000) stderr = stderr.slice(-2000)
    })
    proc.on('error', (error) => {
      reject(new Error(`无法启动 ffmpeg，请确认已安装或已随包配置 LABORANY_FFMPEG: ${error.message}`))
    })
    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`ffmpeg 抽帧失败，退出码 ${code}: ${stderr.trim().slice(-800)}`))
    })
  })
}

async function extractVideoFrames(videoPath: string, frameCount: number): Promise<{ tempDir: string; frames: string[] }> {
  const tempDir = await mkdtemp(join(tmpdir(), 'laborany-video-frames-'))
  const safeFrameCount = Math.min(Math.max(Math.floor(frameCount) || 4, 1), 8)
  const pattern = join(tempDir, 'frame-%02d.jpg')

  await runFfmpeg([
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', videoPath,
    '-vf', `fps=${safeFrameCount}/60,scale=1024:-1`,
    '-frames:v', String(safeFrameCount),
    '-q:v', '3',
    pattern,
  ])

  const frames = Array.from({ length: safeFrameCount }, (_, index) => join(tempDir, `frame-${String(index + 1).padStart(2, '0')}.jpg`))
    .filter((frame) => existsSync(frame))
  if (frames.length === 0) {
    throw new Error('视频抽帧完成但没有生成可分析的帧')
  }

  return { tempDir, frames }
}

async function analyzeImageWithResolvedProfile(
  modelOverride: ResolvedVisionProfile,
  input: AnalyzeImageInput,
): Promise<string> {
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

export async function analyzeImageWithProfile(input: AnalyzeImageInput): Promise<string> {
  const modelOverride = await resolveVisionProfile()
  return analyzeImageWithResolvedProfile(modelOverride, input)
}

async function analyzeVideoByFrames(
  modelOverride: ResolvedVisionProfile,
  input: AnalyzeVideoInput,
  query: string,
): Promise<string> {
  let tempDir = ''

  try {
    const extracted = await extractVideoFrames(input.videoPath, input.frameCount || 4)
    tempDir = extracted.tempDir

    const frameAnalyses: string[] = []
    for (let index = 0; index < extracted.frames.length; index += 1) {
      const framePath = extracted.frames[index]
      const framePrompt = [
        `这是视频 "${basename(input.videoPath)}" 的第 ${index + 1}/${extracted.frames.length} 个抽样帧。`,
        query,
        '请只描述这一帧中与视频理解相关的可见信息，避免编造未出现的内容。',
      ].join('\n')
      const analysis = await analyzeImageWithResolvedProfile(modelOverride, { imagePath: framePath, query: framePrompt })
      frameAnalyses.push(`帧 ${index + 1}: ${analysis}`)
    }

    return [
      `视频分析结果: ${basename(input.videoPath)}`,
      `用户问题: ${query}`,
      '',
      '抽样帧理解:',
      ...frameAnalyses,
      '',
      '综合判断:',
      '以上结论基于视频抽样帧，适合判断画面内容、场景变化和可见元素；若需要精确时间轴、完整台词或音频内容，需要后续接入原生视频/音频理解。',
    ].join('\n')
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

export async function analyzeVideoWithProfile(input: AnalyzeVideoInput): Promise<string> {
  const modelOverride = await resolveVisionProfile()
  const query = input.query || '请分析这个视频的主要内容、人物/物体、场景变化、音频信息和重要细节。'
  const mode = input.mode || 'frames'

  if (mode === 'native' || (mode === 'auto' && isGeminiProfile(modelOverride))) {
    if (!isGeminiProfile(modelOverride)) {
      throw new Error('当前视觉理解模型配置不支持原生整视频输入；请改用 mode=frames，或绑定 Gemini 视频理解模型。')
    }

    const analysis = await analyzeVideoWithGeminiNative({
      apiKey: modelOverride.apiKey,
      baseUrl: modelOverride.baseUrl,
      model: modelOverride.model,
    }, {
      videoPath: input.videoPath,
      query,
      fps: input.fps,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      mediaResolution: input.mediaResolution,
    })

    return [
      `视频分析结果: ${basename(input.videoPath)}`,
      `理解模式: 原生整视频（Gemini）`,
      `用户问题: ${query}`,
      '',
      analysis,
    ].join('\n')
  }

  return analyzeVideoByFrames(modelOverride, input, query)
}
