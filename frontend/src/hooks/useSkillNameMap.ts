import { useCallback, useEffect, useState } from 'react'
import { API_BASE } from '../config'
import type { Skill } from '../types'

interface WorkflowSummary {
  id: string
  name: string
}

export function useSkillNameMap() {
  const [skillNameMap, setSkillNameMap] = useState<Record<string, string>>({})
  const [workflowNameMap, setWorkflowNameMap] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false

    async function fetchSkillNames() {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`${API_BASE}/skill/list`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (cancelled) return

        const map = Object.fromEntries(
          ((data.skills || []) as Skill[])
            .filter(skill => skill.id)
            .map(skill => [skill.id, skill.name || skill.id]),
        )

        setSkillNameMap(map)
      } catch {
        if (!cancelled) {
          setSkillNameMap({})
        }
      }
    }

    async function fetchWorkflowNames() {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`${API_BASE}/workflow/list`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (cancelled) return

        const map = Object.fromEntries(
          ((data.workflows || []) as WorkflowSummary[])
            .filter(workflow => workflow.id)
            .map(workflow => [workflow.id, workflow.name || workflow.id]),
        )

        setWorkflowNameMap(map)
      } catch {
        if (!cancelled) {
          setWorkflowNameMap({})
        }
      }
    }

    fetchSkillNames()
    fetchWorkflowNames()
    return () => {
      cancelled = true
    }
  }, [])

  const getSkillName = useCallback((skillId?: string) => {
    if (!skillId) return ''
    return skillNameMap[skillId] || skillId
  }, [skillNameMap])

  const getWorkflowName = useCallback((workflowId?: string) => {
    if (!workflowId) return ''
    return workflowNameMap[workflowId] || workflowId
  }, [workflowNameMap])

  const getCapabilityName = useCallback(
    (targetType: 'skill' | 'workflow', targetId?: string) => {
      if (targetType === 'workflow') return getWorkflowName(targetId)
      return getSkillName(targetId)
    },
    [getSkillName, getWorkflowName],
  )

  return {
    skillNameMap,
    workflowNameMap,
    getSkillName,
    getWorkflowName,
    getCapabilityName,
  }
}
