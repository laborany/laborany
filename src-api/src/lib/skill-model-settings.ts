import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { readModelProfiles } from './model-profiles.js'
import { getConfigDir } from './app-config.js'

export interface SkillModelSetting {
  modelProfileId?: string
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
          const setting = value as Partial<SkillModelSetting>
          return [[skillId, {
            modelProfileId: typeof setting.modelProfileId === 'string'
              ? setting.modelProfileId.trim() || undefined
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
  return getSkillModelSetting(skillId)?.modelProfileId
}

export function upsertSkillModelSetting(skillId: string, modelProfileId?: string): SkillModelSetting | null {
  const normalizedSkillId = skillId.trim()
  if (!normalizedSkillId) return null

  const normalizedProfileId = (modelProfileId || '').trim() || undefined
  const store = readSkillModelSettings()

  if (!normalizedProfileId) {
    delete store.skills[normalizedSkillId]
    writeSkillModelSettings(store)
    return null
  }

  const nextSetting: SkillModelSetting = {
    modelProfileId: normalizedProfileId,
    updatedAt: new Date().toISOString(),
  }
  store.skills[normalizedSkillId] = nextSetting
  writeSkillModelSettings(store)
  return nextSetting
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
  modelProfileId?: string
  modelProfileName?: string
  updatedAt?: string
  usesOverride: boolean
} {
  const setting = getSkillModelSetting(skillId)
  if (!setting?.modelProfileId) {
    return { usesOverride: false }
  }

  const store = readModelProfiles()
  const profile = store.profiles.find((item) => item.id === setting.modelProfileId)

  return {
    modelProfileId: setting.modelProfileId,
    modelProfileName: profile?.name,
    updatedAt: setting.updatedAt,
    usesOverride: true,
  }
}
