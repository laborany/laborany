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
  readModelProfiles,
  writeModelProfiles,
  maskApiKey,
  syncDefaultProfileToEnv,
  migrateFromEnvIfNeeded,
  type ModelProfile,
} from '../lib/model-profiles.js'

const router = new Hono()

const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || 'laborany-internal'

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
  if (token !== INTERNAL_TOKEN) {
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
      createdAt: existingProfile?.createdAt || now,
      updatedAt: now,
    }
  })

  writeModelProfiles({ version: 1, profiles: newProfiles })
  syncDefaultProfileToEnv()

  // 通知 agent-service 重新加载配置
  try {
    const agentServiceUrl = process.env.AGENT_SERVICE_URL || 'http://localhost:3002'
    await fetch(`${agentServiceUrl}/runtime/apply-config`, {
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
router.post('/test', async (c) => {
  const body = await c.req.json<{
    apiKey?: string
    baseUrl?: string
    model?: string
    profileId?: string
  }>()

  let apiKey = (body.apiKey || '').trim()
  let baseUrl = (body.baseUrl || '').trim()
  let model = (body.model || '').trim()

  // 如果 apiKey 是脱敏格式，从现有 profile 中取
  if (/^sk-\*{3}\.\.\./.test(apiKey) && body.profileId) {
    const store = readModelProfiles()
    const profile = store.profiles.find((p) => p.id === body.profileId)
    if (profile) {
      apiKey = profile.apiKey
      if (!baseUrl) baseUrl = profile.baseUrl || ''
      if (!model) model = profile.model || ''
    }
  }

  if (!apiKey) {
    return c.json({ success: false, message: 'apiKey 不能为空' }, 400)
  }

  // 调用 setup 路由的验证逻辑（通过内部 fetch）
  try {
    const apiBase = `http://127.0.0.1:${process.env.PORT || '3620'}/api`
    const res = await fetch(`${apiBase}/setup/validate-api`, {
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
