/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流 Hook                                       ║
 * ║                                                                          ║
 * ║  职责：管理工作流状态、CRUD 操作、安装为技能                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useCallback } from 'react'

const API_BASE = '/api'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface WorkflowStep {
  skill: string
  name: string
  prompt: string
  position?: { x: number; y: number }
}

export interface WorkflowInputParam {
  type: 'string' | 'number' | 'boolean' | 'file'
  description: string
  required?: boolean
  default?: string | number | boolean
  accept?: string
}

export interface Workflow {
  id: string
  name: string
  description: string
  icon?: string
  steps: WorkflowStep[]
  input: Record<string, WorkflowInputParam>
  on_failure: 'stop' | 'continue' | 'retry'
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       工作流列表 Hook                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function useWorkflowList() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchWorkflows = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/workflow/list`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setWorkflows(data.workflows || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取工作流列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  return { workflows, loading, error, fetchWorkflows }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       工作流详情 Hook                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function useWorkflowDetail(workflowId: string | undefined) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchWorkflow = useCallback(async () => {
    if (!workflowId) return
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/workflow/${workflowId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('工作流不存在')
      const data = await res.json()
      setWorkflow(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取工作流详情失败')
    } finally {
      setLoading(false)
    }
  }, [workflowId])

  return { workflow, loading, error, fetchWorkflow, setWorkflow }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       工作流 CRUD Hook                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function useWorkflowCRUD() {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createWorkflow = useCallback(async (data: Omit<Workflow, 'id'>) => {
    setSaving(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/workflow/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || '创建失败')
      }
      return await res.json()
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败')
      throw e
    } finally {
      setSaving(false)
    }
  }, [])

  const updateWorkflow = useCallback(async (id: string, data: Partial<Workflow>) => {
    setSaving(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/workflow/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || '更新失败')
      }
      return await res.json()
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新失败')
      throw e
    } finally {
      setSaving(false)
    }
  }, [])

  const deleteWorkflow = useCallback(async (id: string) => {
    setSaving(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/workflow/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || '删除失败')
      }
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
      throw e
    } finally {
      setSaving(false)
    }
  }, [])

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                       安装工作流为技能                                     │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const installAsSkill = useCallback(async (id: string) => {
    setSaving(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/workflow/${id}/install`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || '安装失败')
      }
      const data = await res.json()
      return data.skillId as string
    } catch (e) {
      setError(e instanceof Error ? e.message : '安装失败')
      throw e
    } finally {
      setSaving(false)
    }
  }, [])

  return { createWorkflow, updateWorkflow, deleteWorkflow, installAsSkill, saving, error }
}
