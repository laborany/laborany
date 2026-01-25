/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流 Hook                                       ║
 * ║                                                                          ║
 * ║  职责：管理工作流状态、SSE 通信、执行控制                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useCallback, useRef } from 'react'

const API_BASE = 'http://localhost:8000/api'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────���───────────────────────────────────────────────────────────────────┘ */
export interface WorkflowStep {
  skill: string
  name: string
  prompt: string
  position?: { x: number; y: number }  // 画布位置（可选，兼容旧数据）
}

export interface WorkflowInputParam {
  type: 'string' | 'number' | 'boolean' | 'file'
  description: string
  required?: boolean
  default?: string | number | boolean
  accept?: string  // 文件类型限制，如 '.pdf,.doc' 或 'image/*'
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

export interface StepResult {
  stepIndex: number
  skillId: string
  sessionId: string
  status: 'completed' | 'failed'
  output: string
  error?: string
  files: string[]
  startedAt: string
  completedAt: string
}

export interface WorkflowRunState {
  runId: string | null
  status: 'idle' | 'running' | 'completed' | 'failed' | 'stopped'
  currentStep: number
  totalSteps: number
  steps: StepRunState[]
  error: string | null
}

export interface StepRunState {
  stepIndex: number
  skillId: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  output: string
  error: string | null
  sessionId: string | null  // 用于获取步骤产出的文件
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
 * │                       工作流执行 Hook                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function useWorkflowExecutor(workflow: Workflow | null) {
  const [runState, setRunState] = useState<WorkflowRunState>({
    runId: null,
    status: 'idle',
    currentStep: 0,
    totalSteps: workflow?.steps.length || 0,
    steps: [],
    error: null,
  })

  const abortControllerRef = useRef<AbortController | null>(null)

  // 初始化步骤状态
  const initSteps = useCallback((wf: Workflow): StepRunState[] => {
    return wf.steps.map((step, index) => ({
      stepIndex: index,
      skillId: step.skill,
      name: step.name,
      status: 'pending',
      output: '',
      error: null,
      sessionId: null,
    }))
  }, [])

  // 执行工作流
  const execute = useCallback(async (input: Record<string, unknown>) => {
    if (!workflow) return

    // 重置状态
    setRunState({
      runId: null,
      status: 'running',
      currentStep: 0,
      totalSteps: workflow.steps.length,
      steps: initSteps(workflow),
      error: null,
    })

    abortControllerRef.current = new AbortController()

    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/workflow/${workflow.id}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ input }),
        signal: abortControllerRef.current.signal,
      })

      const reader = res.body?.getReader()
      if (!reader) throw new Error('无法读取响应流')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          try {
            const event = JSON.parse(data)
            handleEvent(event)
          } catch {
            // 忽略解析错误
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setRunState(prev => ({ ...prev, status: 'stopped' }))
      } else {
        setRunState(prev => ({
          ...prev,
          status: 'failed',
          error: e instanceof Error ? e.message : '执行失败',
        }))
      }
    }
  }, [workflow, initSteps])

  // 处理 SSE 事件
  const handleEvent = useCallback((event: Record<string, unknown>) => {
    switch (event.type) {
      case 'run':
        setRunState(prev => ({ ...prev, runId: event.runId as string }))
        break

      case 'workflow_start':
        setRunState(prev => ({
          ...prev,
          totalSteps: event.totalSteps as number,
        }))
        break

      case 'step_start':
        setRunState(prev => ({
          ...prev,
          currentStep: event.stepIndex as number,
          steps: prev.steps.map((s, i) =>
            i === event.stepIndex ? { ...s, status: 'running' } : s
          ),
        }))
        break

      case 'step_progress':
        setRunState(prev => ({
          ...prev,
          steps: prev.steps.map((s, i) =>
            i === event.stepIndex
              ? { ...s, output: s.output + (event.content as string) }
              : s
          ),
        }))
        break

      case 'step_done':
        setRunState(prev => ({
          ...prev,
          steps: prev.steps.map((s, i) =>
            i === event.stepIndex
              ? {
                  ...s,
                  status: 'completed',
                  output: (event.result as StepResult)?.output || s.output,
                  sessionId: (event.result as StepResult)?.sessionId || null,
                }
              : s
          ),
        }))
        break

      case 'step_error':
        setRunState(prev => ({
          ...prev,
          steps: prev.steps.map((s, i) =>
            i === event.stepIndex
              ? { ...s, status: 'failed', error: event.error as string }
              : s
          ),
        }))
        break

      case 'workflow_done':
        setRunState(prev => ({ ...prev, status: 'completed' }))
        break

      case 'workflow_error':
        setRunState(prev => ({
          ...prev,
          status: 'failed',
          error: event.error as string,
        }))
        break

      case 'workflow_stopped':
        setRunState(prev => ({ ...prev, status: 'stopped' }))
        break
    }
  }, [])

  // 中止执行
  const stop = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    if (runState.runId) {
      const token = localStorage.getItem('token')
      await fetch(`${API_BASE}/workflow/stop/${runState.runId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    }
  }, [runState.runId])

  // 重置状态
  const reset = useCallback(() => {
    setRunState({
      runId: null,
      status: 'idle',
      currentStep: 0,
      totalSteps: workflow?.steps.length || 0,
      steps: workflow ? initSteps(workflow) : [],
      error: null,
    })
  }, [workflow, initSteps])

  return { runState, execute, stop, reset }
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

  return { createWorkflow, updateWorkflow, deleteWorkflow, saving, error }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       工作流历史 Hook                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface WorkflowRun {
  id: string
  workflowId: string
  workflowName: string
  workflowIcon?: string
  status: string
  input: Record<string, unknown>
  currentStep: number
  totalSteps: number
  startedAt: string
  completedAt?: string
}

export function useWorkflowHistory() {
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/workflow/history`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setRuns(data.runs || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取历史失败')
    } finally {
      setLoading(false)
    }
  }, [])

  return { runs, loading, error, fetchHistory }
}
