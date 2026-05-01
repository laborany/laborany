import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { readModelProfiles } from './model-profiles.js'
import { getConfigDir } from './app-config.js'

export interface SkillModelSetting {
  textChatProfileId?: string
  visionProfileId?: string
  imageGenProfileId?: string
  videoGenProfileId?: string
  updatedAt: string
}

interface SkillModelSettingsStore {
  version: 1
  skills: Record<string, SkillModelSetting>
}

function getSkillModelSettingsPath(): string {
  return join(getConfigDir(), 'skill-model-settings.json')
}

function createEmptyStore(): SkillModelSettingsStore {
  return {
    version: 1,
    skills: {},
  }
}

export function readSkillModelSettings(): SkillModelSettingsStore {
  const path = getSkillModelSettingsPath()
  if (!existsSync(path)) {
    return createEmptyStore()
  }

  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<SkillModelSettingsStore>
    const skills = parsed.skills && typeof parsed.skills === 'object'
      ? Object.fromEntries(
        Object.entries(parsed.skills).flatMap(([skillId, value]) => {
          if (!value || typeof value !== 'object') return []
          const setting = value as Partial<SkillModelSetting> & { modelProfileId?: string }
          return [[skillId, {
            textChatProfileId: typeof setting.textChatProfileId === 'string'
              ? setting.textChatProfileId.trim() || undefined
              : typeof setting.modelProfileId === 'string'
                ? setting.modelProfileId.trim() || undefined
                : undefined,
            visionProfileId: typeof setting.visionProfileId === 'string'
              ? setting.visionProfileId.trim() || undefined
              : undefined,
            imageGenProfileId: typeof setting.imageGenProfileId === 'string'
              ? setting.imageGenProfileId.trim() || undefined
              : undefined,
            videoGenProfileId: typeof setting.videoGenProfileId === 'string'
              ? setting.videoGenProfileId.trim() || undefined
              : undefined,
            updatedAt: typeof setting.updatedAt === 'string' && setting.updatedAt.trim()
              ? setting.updatedAt
              : new Date().toISOString(),
          } satisfies SkillModelSetting]]
        }),
      )
      : {}

    return {
      version: 1,
      skills,
    }
  } catch (error) {
    console.error('[SkillModelSettings] Failed to read store:', error)
    return createEmptyStore()
  }
}

export function writeSkillModelSettings(store: SkillModelSettingsStore): void {
  const path = getSkillModelSettingsPath()
  writeFileSync(path, JSON.stringify(store, null, 2), 'utf-8')
}

export function getSkillModelSetting(skillId: string): SkillModelSetting | null {
  const normalizedSkillId = skillId.trim()
  if (!normalizedSkillId) return null
  const store = readSkillModelSettings()
  return store.skills[normalizedSkillId] || null
}

export function getSkillModelProfileId(skillId: string): string | undefined {
  return getSkillModelSetting(skillId)?.textChatProfileId
}

export function upsertSkillModelSetting(
  skillId: string,
  next: Partial<Pick<SkillModelSetting, 'textChatProfileId' | 'visionProfileId' | 'imageGenProfileId' | 'videoGenProfileId'>>,
): SkillModelSetting | null {
  const normalizedSkillId = skillId.trim()
  if (!normalizedSkillId) return null

  const store = readSkillModelSettings()
  const current = store.skills[normalizedSkillId]
  const nextSetting: SkillModelSetting = {
    textChatProfileId: (next.textChatProfileId || '').trim() || undefined,
    visionProfileId: (next.visionProfileId || '').trim() || undefined,
    imageGenProfileId: (next.imageGenProfileId || '').trim() || undefined,
    videoGenProfileId: (next.videoGenProfileId || '').trim() || undefined,
    updatedAt: new Date().toISOString(),
  }

  if (!nextSetting.textChatProfileId && !nextSetting.visionProfileId && !nextSetting.imageGenProfileId && !nextSetting.videoGenProfileId) {
    delete store.skills[normalizedSkillId]
    writeSkillModelSettings(store)
    return null
  }

  store.skills[normalizedSkillId] = {
    ...current,
    ...nextSetting,
  }
  writeSkillModelSettings(store)
  return store.skills[normalizedSkillId]
}

export function removeSkillModelSetting(skillId: string): void {
  const normalizedSkillId = skillId.trim()
  if (!normalizedSkillId) return
  const store = readSkillModelSettings()
  if (!(normalizedSkillId in store.skills)) return
  delete store.skills[normalizedSkillId]
  writeSkillModelSettings(store)
}

export function resolveSkillModelSettingDetail(skillId: string): {
  textChatProfileId?: string
  textChatProfileName?: string
  visionProfileId?: string
  visionProfileName?: string
  imageGenProfileId?: string
  imageGenProfileName?: string
  videoGenProfileId?: string
  videoGenProfileName?: string
  updatedAt?: string
  usesOverride: boolean
} {
  const setting = getSkillModelSetting(skillId)
  if (!setting) {
    return { usesOverride: false }
  }

  const store = readModelProfiles()
  const resolveName = (profileId?: string) => store.profiles.find((item) => item.id === profileId)?.name

  const usesOverride = Boolean(
    setting.textChatProfileId || setting.visionProfileId || setting.imageGenProfileId || setting.videoGenProfileId,
  )

  return {
    textChatProfileId: setting.textChatProfileId,
    textChatProfileName: resolveName(setting.textChatProfileId),
    visionProfileId: setting.visionProfileId,
    visionProfileName: resolveName(setting.visionProfileId),
    imageGenProfileId: setting.imageGenProfileId,
    imageGenProfileName: resolveName(setting.imageGenProfileId),
    videoGenProfileId: setting.videoGenProfileId,
    videoGenProfileName: resolveName(setting.videoGenProfileId),
    updatedAt: setting.updatedAt,
    usesOverride,
  }
}
