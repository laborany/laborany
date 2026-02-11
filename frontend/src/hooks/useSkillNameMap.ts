/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║              useSkillNameMap - 统一 Capability 名称查询                ║
 * ║                                                                        ║
 * ║  从 /skill/list 拉取所有 capability（含 composite），                  ║
 * ║  返回统一的 getCapabilityName(id) 查询函数                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useCallback, useEffect, useState } from 'react'
import { API_BASE } from '../config'
import type { Skill } from '../types'

export function useSkillNameMap() {
  const [nameMap, setNameMap] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false

    async function fetchNames() {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`${API_BASE}/skill/list`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (cancelled) return

        const map = Object.fromEntries(
          ((data.skills || []) as Skill[])
            .filter(s => s.id)
            .map(s => [s.id, s.name || s.id]),
        )
        setNameMap(map)
      } catch {
        if (!cancelled) setNameMap({})
      }
    }

    fetchNames()
    return () => { cancelled = true }
  }, [])

  /* ── 统一查询：所有 capability 共用一张表 ── */
  const getCapabilityName = useCallback(
    (id?: string) => {
      if (!id) return ''
      return nameMap[id] || id
    },
    [nameMap],
  )

  /* ── 向后兼容别名 ── */
  const getSkillName = getCapabilityName

  return { nameMap, getCapabilityName, getSkillName }
}
