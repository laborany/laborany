/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      数字员工管理 Hook                                     ║
 * ║                                                                          ║
 * ║  封装员工数据获取、过滤、状态管理                                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect, useCallback } from 'react'
import type { Skill, DigitalWorker } from '../types'
import { filterDisplayWorkers } from '../types'
import { API_BASE } from '../config'

interface UseWorkersResult {
  workers: DigitalWorker[]
  allSkills: Skill[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useWorkers(): UseWorkersResult {
  const [allSkills, setAllSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSkills = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/skill/list`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setAllSkills(data.skills || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取员工列表失败')
      setAllSkills([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSkills()
  }, [fetchSkills])

  // 过滤出可展示的员工（排除元类型如 skill-creator）
  const workers = filterDisplayWorkers(allSkills)

  return {
    workers,
    allSkills,
    loading,
    error,
    refresh: fetchSkills,
  }
}
