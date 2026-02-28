/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Model Profile 解析工具                               ║
 * ║                                                                          ║
 * ║  调用 src-api 内部接口获取明文 profile                                    ║
 * ║  无 profileId → 返回 undefined（回退 process.env）                        ║
 * ║  无效 profileId → 返回 undefined + 打印 warning                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { ModelOverride } from '../claude-cli.js'

function getSrcApiBaseUrl(): string {
  return (process.env.SRC_API_BASE_URL || 'http://127.0.0.1:3620/api').replace(/\/+$/, '')
}

function getInternalToken(): string {
  return process.env.INTERNAL_TOKEN || 'laborany-internal'
}

export async function resolveModelProfile(profileId?: string): Promise<ModelOverride | undefined> {
  if (!profileId) return undefined

  try {
    const res = await fetch(`${getSrcApiBaseUrl()}/config/model-profiles/internal/${encodeURIComponent(profileId)}`, {
      headers: { 'X-Internal-Token': getInternalToken() },
      signal: AbortSignal.timeout(3000),
    })

    if (!res.ok) {
      console.warn(`[ModelProfile] Failed to resolve profile ${profileId}: HTTP ${res.status}`)
      return undefined
    }

    const data = await res.json() as {
      profile?: { apiKey?: string; baseUrl?: string; model?: string }
    }

    if (!data.profile?.apiKey) {
      console.warn(`[ModelProfile] Profile ${profileId} has no apiKey`)
      return undefined
    }

    return {
      apiKey: data.profile.apiKey,
      baseUrl: data.profile.baseUrl,
      model: data.profile.model,
    }
  } catch (error) {
    console.warn(`[ModelProfile] Error resolving profile ${profileId}:`, error)
    return undefined
  }
}
