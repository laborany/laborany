import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { API_BASE } from '../config/api'

export type ModelInterfaceType = 'anthropic' | 'openai_compatible'
export type ReasoningEffort = 'default' | 'low' | 'medium' | 'high'

export interface ModelProfile {
  id: string
  name: string
  apiKey: string
  baseUrl?: string
  model?: string
  interfaceType: ModelInterfaceType
  createdAt: string
  updatedAt: string
}

interface ModelProfileContextValue {
  profiles: ModelProfile[]
  activeProfileId: string | null
  setActiveProfile: (id: string) => void
  activeReasoningEffort: ReasoningEffort
  setActiveReasoningEffort: (value: ReasoningEffort) => void
  refreshProfiles: () => Promise<void>
}

const STORAGE_KEY = 'laborany:active-model-profile-id'
const REASONING_STORAGE_KEY = 'laborany:active-reasoning-effort'

const ModelProfileContext = createContext<ModelProfileContextValue>({
  profiles: [],
  activeProfileId: null,
  setActiveProfile: () => {},
  activeReasoningEffort: 'default',
  setActiveReasoningEffort: () => {},
  refreshProfiles: async () => {},
})

export function ModelProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<ModelProfile[]>([])
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY)
  })
  const [activeReasoningEffort, setActiveReasoningEffortState] = useState<ReasoningEffort>(() => {
    const stored = localStorage.getItem(REASONING_STORAGE_KEY)
    return stored === 'low' || stored === 'medium' || stored === 'high' ? stored : 'default'
  })

  const refreshProfiles = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const headers: HeadersInit = {}
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(`${API_BASE}/config/model-profiles`, { headers })
      if (!res.ok) return
      const data = await res.json() as { profiles?: ModelProfile[] }
      const list = Array.isArray(data.profiles)
        ? data.profiles.map((profile) => {
          const interfaceType: ModelInterfaceType = profile.interfaceType === 'openai_compatible'
            ? 'openai_compatible'
            : 'anthropic'
          return {
            ...profile,
            interfaceType,
          }
        })
        : []
      setProfiles(list)

      // Validate activeProfileId — fall back to profiles[0] if stale
      setActiveProfileIdState(prev => {
        if (!list.length) return null
        if (prev && list.some(p => p.id === prev)) return prev
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored && list.some(p => p.id === stored)) return stored
        return list[0].id
      })
    } catch {
      // ignore network errors
    }
  }, [])

  useEffect(() => {
    void refreshProfiles()
  }, [refreshProfiles])

  const setActiveProfile = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id)
    setActiveProfileIdState(id)
  }, [])

  const setActiveReasoningEffort = useCallback((value: ReasoningEffort) => {
    localStorage.setItem(REASONING_STORAGE_KEY, value)
    setActiveReasoningEffortState(value)
  }, [])

  // Sync activeProfileId to localStorage whenever it changes
  useEffect(() => {
    if (activeProfileId) {
      localStorage.setItem(STORAGE_KEY, activeProfileId)
    }
  }, [activeProfileId])

  useEffect(() => {
    localStorage.setItem(REASONING_STORAGE_KEY, activeReasoningEffort)
  }, [activeReasoningEffort])

  return (
    <ModelProfileContext.Provider value={{
      profiles,
      activeProfileId,
      setActiveProfile,
      activeReasoningEffort,
      setActiveReasoningEffort,
      refreshProfiles,
    }}>
      {children}
    </ModelProfileContext.Provider>
  )
}

export function useModelProfile(): ModelProfileContextValue {
  return useContext(ModelProfileContext)
}
