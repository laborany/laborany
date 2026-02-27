import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { API_BASE } from '../config/api'

export interface ModelProfile {
  id: string
  name: string
  apiKey: string
  baseUrl?: string
  model?: string
  createdAt: string
  updatedAt: string
}

interface ModelProfileContextValue {
  profiles: ModelProfile[]
  activeProfileId: string | null
  setActiveProfile: (id: string) => void
  refreshProfiles: () => Promise<void>
}

const STORAGE_KEY = 'laborany:active-model-profile-id'

const ModelProfileContext = createContext<ModelProfileContextValue>({
  profiles: [],
  activeProfileId: null,
  setActiveProfile: () => {},
  refreshProfiles: async () => {},
})

export function ModelProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<ModelProfile[]>([])
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY)
  })

  const refreshProfiles = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const headers: HeadersInit = {}
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(`${API_BASE}/config/model-profiles`, { headers })
      if (!res.ok) return
      const data = await res.json() as { profiles?: ModelProfile[] }
      const list = Array.isArray(data.profiles) ? data.profiles : []
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

  // Sync activeProfileId to localStorage whenever it changes
  useEffect(() => {
    if (activeProfileId) {
      localStorage.setItem(STORAGE_KEY, activeProfileId)
    }
  }, [activeProfileId])

  return (
    <ModelProfileContext.Provider value={{ profiles, activeProfileId, setActiveProfile, refreshProfiles }}>
      {children}
    </ModelProfileContext.Provider>
  )
}

export function useModelProfile(): ModelProfileContextValue {
  return useContext(ModelProfileContext)
}
