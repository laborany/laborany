/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Model Profiles API 路由                              ║
 * ║                                                                          ║
 * ║  GET  /api/config/model-profiles          - 列表（脱敏）                  ║
 * ║  PUT  /api/config/model-profiles          - 全量保存                      ║
 * ║  POST /api/config/model-profiles/test     - 测试连通性                    ║
 * ║  GET  /api/config/model-profiles/internal/:id - 内部接口（明文）          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Hono } from 'hono'
import { v4 as uuid } from 'uuid'
import {
  encodeOpenAiBridgeApiKey,
  normalizeModelCapabilities,
  normalizeModelInterfaceType,
  type ModelInterfaceType,
} from 'laborany-shared'
import {
  readModelProfiles,
  writeModelProfiles,
  maskApiKey,
  syncDefaultProfileToEnv,
  migrateFromEnvIfNeeded,
  type ModelProfile,
} from '../lib/model-profiles.js'

const router = new Hono()

function getInternalToken(): string {
  return process.env.INTERNAL_TOKEN || 'laborany-internal'
}

function getAgentServiceUrl(): string {
  return process.env.AGENT_SERVICE_URL || 'http://localhost:3002'
}

function getApiBaseUrl(): string {
  return `http://127.0.0.1:${process.env.PORT || '3620'}/api`
}

function extractAnthropicText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  const chunks: string[] = []
  for (const item of content) {
    if (!item || typeof item !== 'object') continue
    const block = item as Record<string, unknown>
    if (block.type === 'text' && typeof block.text === 'string') {
      chunks.push(block.text)
    }
  }
  return chunks.join('\n').trim()
}

async function validateVisionConfig(params: {
  apiKey: string
  baseUrl?: string
  model?: string
  interfaceType?: ModelInterfaceType
  imagePath?: string
  prompt?: string
}): Promise<{ success: boolean; message: string; analysis?: string }> {
  const apiKey = params.apiKey.trim()
  const interfaceType = normalizeModelInterfaceType(params.interfaceType)
  const prompt = (params.prompt || '').trim() || '请描述这张图片的主要内容。'
  const imagePath = (params.imagePath || '').trim()
  if (!imagePath) {
    return { success: false, message: '缺少 imagePath' }
  }

  try {
    const { readFile } = await import('fs/promises')
    const imageBuffer = await readFile(imagePath)
    const mediaType = imagePath.endsWith('.png') ? 'image/png' : imagePath.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
    const imageBase64 = imageBuffer.toString('base64')

    if (interfaceType === 'openai_compatible') {
      const response = await fetch(`${(params.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: (params.model || '').trim() || 'gpt-4o-mini',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
            ],
          }],
          max_tokens: 300,
        }),
        signal: AbortSignal.timeout(30000),
      })
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }
      const analysis = data.choices?.[0]?.message?.content?.trim()
      if (!response.ok || !analysis) {
        return { success: false, message: data.error?.message || '视觉模型请求失败' }
      }
      return { success: true, message: '视觉理解测试通过', analysis }
    }

    const response = await fetch(`${(params.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: (params.model || '').trim() || 'claude-3-5-sonnet-latest',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          ],
        }],
      }),
      signal: AbortSignal.timeout(30000),
    })
    const data = await response.json() as { content?: Array<{ type?: string; text?: string }>; error?: { message?: string } }
    const analysis = data.content?.filter(item => item.type === 'text').map(item => item.text || '').join('\n').trim()
    if (!response.ok || !analysis) {
      return { success: false, message: data.error?.message || '视觉模型请求失败' }
    }
    return { success: true, message: '视觉理解测试通过', analysis }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : '视觉模型测试失败' }
  }
}

async function validateOpenAiCompatibleConfig(params: {
  apiKey: string
  baseUrl?: string
  model?: string
}): Promise<{ success: boolean; message: string; diagnostic?: string }> {
  const apiKey = params.apiKey.trim()
  const model = (params.model || '').trim() || 'gpt-4o-mini'
  const bridgeKey = encodeOpenAiBridgeApiKey({
    apiKey,
    baseUrl: (params.baseUrl || '').trim() || undefined,
    model,
  })

  try {
    const res = await fetch(`${getApiBaseUrl()}/llm-bridge/anthropic/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': bridgeKey,
      },
      body: JSON.stringify({
        model,
        max_tokens: 64,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Reply with exactly: OK' }],
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    const raw = await res.text()
    let data: Record<string, unknown> = {}
    try {
      data = raw ? JSON.parse(raw) as Record<string, unknown> : {}
    } catch {
      data = {}
    }

    if (!res.ok) {
      const errorMessage = (() => {
        const err = data.error
        if (err && typeof err === 'object' && typeof (err as Record<string, unknown>).message === 'string') {
          return (err as Record<string, unknown>).message as string
        }
        if (typeof data.message === 'string') return data.message
        return raw || `HTTP ${res.status}`
      })()
      return {
        success: false,
        message: 'OpenAI-compatible 配置验证失败',
        diagnostic: errorMessage.slice(0, 600),
      }
    }

    const text = extractAnthropicText(data.content)
    return {
      success: true,
      message: `OpenAI-compatible 连接验证通过${text ? `（响应: ${text.slice(0, 60)}）` : ''}`,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    return {
      success: false,
      message: `OpenAI-compatible 测试请求失败: ${message}`,
    }
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  GET /api/config/model-profiles                                          │
 * │  返回脱敏列表                                                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.get('/', (c) => {
  migrateFromEnvIfNeeded()
  const store = readModelProfiles()
  const masked = store.profiles.map((p) => ({
    ...p,
    apiKey: maskApiKey(p.apiKey),
  }))
  return c.json({ profiles: masked })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  GET /api/config/model-profiles/internal/:id                             │
 * │  内部接口，返回明文 profile（X-Internal-Token 鉴权）                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.get('/internal/:id', (c) => {
  const token = c.req.header('X-Internal-Token')
  if (token !== getInternalToken()) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  migrateFromEnvIfNeeded()
  const { id } = c.req.param()
  const store = readModelProfiles()
  const profile = store.profiles.find((p) => p.id === id)

  if (!profile) {
    return c.json({ error: 'Profile not found' }, 404)
  }

  return c.json({ profile })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  PUT /api/config/model-profiles                                          │
 * │  全量保存 profiles，同步回写 .env，通知 agent-service                     │
 * └──────────────────────────="──────────────────────────────────────────────┘ */
router.put('/', async (c) => {
  const body = await c.req.json<{ profiles: Array<Partial<ModelProfile>> }>()

  if (!Array.isArray(body?.profiles) || body.profiles.length === 0) {
    return c.json({ error: '至少需要一个 profile' }, 400)
  }

  // 验证每个 profile
  const errors: string[] = []
  const seenNames = new Set<string>()
  const seenIds = new Set<string>()

  for (let i = 0; i < body.profiles.length; i++) {
    const p = body.profiles[i]
    const name = (p.name || '').trim()
    const apiKey = (p.apiKey || '').trim()
    const interfaceType = normalizeModelInterfaceType(p.interfaceType)
    const capabilities = normalizeModelCapabilities(p.capabilities)

    if (!name) {
      errors.push(`Profile[${i}]: name 不能为空`)
    } else {
      const normalized = name.toLowerCase()
      if (seenNames.has(normalized)) {
        errors.push(`Profile[${i}]: name "${name}" 重复`)
      }
      seenNames.add(normalized)
    }

    if (i === 0 && !apiKey) {
      errors.push('第一个 profile 的 apiKey 不能为空')
    }

    if (interfaceType !== 'anthropic' && interfaceType !== 'openai_compatible') {
      errors.push(`Profile[${i}]: interfaceType 无效`)
    }

    if (capabilities.length === 0) {
      errors.push(`Profile[${i}]: capabilities 至少需要一个能力`)
    }

    // 如果有 id 且不是新建，检查重复
    if (p.id) {
      if (seenIds.has(p.id)) {
        errors.push(`Profile[${i}]: id "${p.id}" 重复`)
      }
      seenIds.add(p.id)
    }
  }

  if (errors.length > 0) {
    return c.json({ error: errors.join('; ') }, 400)
  }

  // 读取现有 profiles 以保留 apiKey（前端传来的可能是脱敏值）
  const existing = readModelProfiles()
  const existingMap = new Map(existing.profiles.map((p) => [p.id, p]))

  const now = new Date().toISOString()
  const newProfiles: ModelProfile[] = body.profiles.map((p) => {
    const id = p.id || uuid()
    const existingProfile = existingMap.get(id)

    // 如果 apiKey 是脱敏格式（sk-***...xxxx），保留原始值
    const isMasked = /^sk-\*{3}\.\.\./.test(p.apiKey || '')
    const apiKey = isMasked && existingProfile
      ? existingProfile.apiKey
      : (p.apiKey || '').trim()

    return {
      id,
      name: (p.name || '').trim(),
      apiKey,
      baseUrl: (p.baseUrl || '').trim() || undefined,
      model: (p.model || '').trim() || undefined,
      interfaceType: normalizeModelInterfaceType(p.interfaceType || existingProfile?.interfaceType),
      capabilities: normalizeModelCapabilities(p.capabilities ?? existingProfile?.capabilities),
      createdAt: existingProfile?.createdAt || now,
      updatedAt: now,
    }
  })

  writeModelProfiles({ version: 2, profiles: newProfiles })
  syncDefaultProfileToEnv()

  // 通知 agent-service 重新加载配置
  try {
    await fetch(`${getAgentServiceUrl()}/runtime/apply-config`, {
      method: 'POST',
      signal: AbortSignal.timeout(2000),
    })
  } catch {
    // agent-service 可能未启动，忽略
  }

  const masked = newProfiles.map((p) => ({
    ...p,
    apiKey: maskApiKey(p.apiKey),
  }))

  return c.json({ success: true, profiles: masked })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  POST /api/config/model-profiles/test                                    │
 * │  测试指定 profile 的连通性                                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.post('/test-vision', async (c) => {
  const token = c.req.header('X-Internal-Token')
  const body = await c.req.json<{
    apiKey?: string
    baseUrl?: string
    model?: string
    profileId?: string
    interfaceType?: ModelInterfaceType
    imagePath?: string
    prompt?: string
  }>()

  let apiKey = (body.apiKey || '').trim()
  let baseUrl = (body.baseUrl || '').trim()
  let model = (body.model || '').trim()
  let interfaceType = normalizeModelInterfaceType(body.interfaceType)

  if (!apiKey && body.profileId) {
    const store = readModelProfiles()
    const profile = store.profiles.find((p) => p.id === body.profileId)
    if (profile) {
      apiKey = profile.apiKey
      baseUrl = profile.baseUrl || ''
      model = profile.model || ''
      interfaceType = normalizeModelInterfaceType(profile.interfaceType)
    }
  }

  if (!apiKey) {
    return c.json({ success: false, message: 'apiKey 不能为空' }, 400)
  }

  if (!body.imagePath) {
    return c.json({ success: false, message: 'imagePath 不能为空' }, 400)
  }

  if (token && token !== getInternalToken()) {
    return c.json({ success: false, message: 'Unauthorized' }, 401)
  }

  const result = await validateVisionConfig({
    apiKey,
    baseUrl: baseUrl || undefined,
    model: model || undefined,
    interfaceType,
    imagePath: body.imagePath,
    prompt: body.prompt,
  })
  return c.json(result, result.success ? 200 : 400)
})

router.post('/test', async (c) => {
  const body = await c.req.json<{
    apiKey?: string
    baseUrl?: string
    model?: string
    profileId?: string
    interfaceType?: ModelInterfaceType
    capabilities?: string[]
  }>()

  let apiKey = (body.apiKey || '').trim()
  let baseUrl = (body.baseUrl || '').trim()
  let model = (body.model || '').trim()
  let interfaceType = normalizeModelInterfaceType(body.interfaceType)

  // 如果 apiKey 是脱敏格式，从现有 profile 中取
  if (/^sk-\*{3}\.\.\./.test(apiKey) && body.profileId) {
    const store = readModelProfiles()
    const profile = store.profiles.find((p) => p.id === body.profileId)
    if (profile) {
      apiKey = profile.apiKey
      if (!baseUrl) baseUrl = profile.baseUrl || ''
      if (!model) model = profile.model || ''
      interfaceType = normalizeModelInterfaceType(profile.interfaceType)
    }
  }

  if (!apiKey) {
    return c.json({ success: false, message: 'apiKey 不能为空' }, 400)
  }

  if (interfaceType === 'openai_compatible') {
    const result = await validateOpenAiCompatibleConfig({
      apiKey,
      baseUrl: baseUrl || undefined,
      model: model || undefined,
    })
    return c.json(result, result.success ? 200 : 400)
  }

  // Anthropic 走 setup 路由验证逻辑（通过内部 fetch）
  try {
    const res = await fetch(`${getApiBaseUrl()}/setup/validate-api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ANTHROPIC_API_KEY: apiKey,
        ANTHROPIC_BASE_URL: baseUrl || undefined,
        ANTHROPIC_MODEL: model || undefined,
      }),
      signal: AbortSignal.timeout(30000),
    })

    const result = await res.json() as { success: boolean; message: string; diagnostic?: string }
    return c.json(result, res.ok ? 200 : 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    return c.json({ success: false, message: `测试请求失败: ${message}` }, 500)
  }
})

export default router
