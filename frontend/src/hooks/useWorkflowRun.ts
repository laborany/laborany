/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     工作流执行 Hook                                      ║
 * ║                                                                          ║
 * ║  职责：SSE 流式通信、消息管理、执行控制、步骤进度追踪                       ║
 * ║  设计：复用 useAgent 的 SSE 模式，面向工作流执行端点                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useCallback, useRef } from 'react'
import type { AgentMessage } from '../types'
import { AGENT_API_BASE } from '../config/api'
import type { WorkflowStep as WorkflowStepUI } from '../components/execution/StepProgress'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           执行状态                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export type WorkflowRunStatus = 'idle' | 'running' | 'done' | 'error'

interface WorkflowRunState {
  messages: AgentMessage[]
  status: WorkflowRunStatus
  runId: string | null
  error: string | null
  steps: WorkflowStepUI[]
  currentStep: number
}

const INITIAL_STATE: WorkflowRunState = {
  messages: [],
  status: 'idle',
  runId: null,
  error: null,
  steps: [],
  currentStep: -1,
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  终态事件集合 —— 用数据结构消除分支                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const DONE_EVENTS = new Set(['done', 'stopped', 'workflow_stopped'])
const ERROR_EVENTS = new Set(['error', 'workflow_error'])

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  步骤状态更新 —— 纯函数，按索引更新指定步骤                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function updateStep(
  steps: WorkflowStepUI[],
  index: number,
  patch: Partial<WorkflowStepUI>,
): WorkflowStepUI[] {
  return steps.map((s, i) => i === index ? { ...s, ...patch } : s)
}

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                           Hook 实现                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */
export function useWorkflowRun(workflowId: string) {
  const [state, setState] = useState<WorkflowRunState>(INITIAL_STATE)
  const abortRef = useRef<AbortController | null>(null)
  const textRef = useRef('')
  const aidRef = useRef(crypto.randomUUID())
  const runIdRef = useRef<string | null>(null)

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                     处理 SSE 事件                                        │
   * │  事件类型：run / text / tool_use / done / stopped /                     │
   * │           workflow_start / step_start / step_done / step_error /        │
   * │           workflow_stopped / error / workflow_error                      │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const handleEvent = useCallback((event: Record<string, unknown>) => {
    const type = event.type as string

    /* 捕获 runId（后端首个事件） */
    if (type === 'run') {
      const rid = event.runId as string
      runIdRef.current = rid
      setState(s => ({ ...s, runId: rid }))
      return
    }

    /* 工作流开始 —— 初始化步骤列表 */
    if (type === 'workflow_start') {
      const total = (event.totalSteps as number) || 0
      const names = (event.stepNames as string[]) || []
      const steps: WorkflowStepUI[] = Array.from({ length: total }, (_, i) => ({
        name: names[i] || `步骤 ${i + 1}`,
        status: 'pending',
      }))
      setState(s => ({ ...s, steps, currentStep: -1 }))
      return
    }

    /* 步骤开始 */
    if (type === 'step_start') {
      const idx = event.stepIndex as number
      const name = event.stepName as string
      setState(s => ({
        ...s,
        currentStep: idx,
        steps: updateStep(s.steps, idx, {
          status: 'running',
          name: name || s.steps[idx]?.name || `步骤 ${idx + 1}`,
          startedAt: new Date().toISOString(),
        }),
      }))
      return
    }

    /* 步骤完成 */
    if (type === 'step_done') {
      const idx = event.stepIndex as number
      const result = event.result as Record<string, unknown> | undefined
      setState(s => ({
        ...s,
        steps: updateStep(s.steps, idx, {
          status: 'completed',
          output: (result?.output as string) || '',
          completedAt: (result?.completedAt as string) || new Date().toISOString(),
        }),
      }))
      /* 重置文本累积，为下一步骤准备 */
      textRef.current = ''
      aidRef.current = crypto.randomUUID()
      return
    }

    /* 步骤失败 */
    if (type === 'step_error') {
      const idx = event.stepIndex as number
      setState(s => ({
        ...s,
        steps: updateStep(s.steps, idx, {
          status: 'failed',
          output: (event.error as string) || '执行失败',
          completedAt: new Date().toISOString(),
        }),
      }))
      return
    }

    /* 流式文本累积 */
    if (type === 'text') {
      const aid = aidRef.current
      textRef.current += event.content as string
      const snapshot = textRef.current
      setState(s => {
        const exists = s.messages.find(m => m.id === aid)
        if (exists) {
          return { ...s, messages: s.messages.map(m => m.id === aid ? { ...m, content: snapshot } : m) }
        }
        return { ...s, messages: [...s.messages, { id: aid, type: 'assistant', content: snapshot, timestamp: new Date() }] }
      })
      return
    }

    /* 工具调用 */
    if (type === 'tool_use') {
      setState(s => ({
        ...s,
        messages: [...s.messages, {
          id: crypto.randomUUID(),
          type: 'tool',
          content: '',
          toolName: event.toolName as string,
          toolInput: event.toolInput as Record<string, unknown>,
          timestamp: new Date(),
        }],
      }))
      textRef.current = ''
      aidRef.current = crypto.randomUUID()
      return
    }

    /* 错误（兼容 error 和 workflow_error） */
    if (ERROR_EVENTS.has(type)) {
      const msg = (event.error || event.message || event.content || '执行失败') as string
      setState(s => ({ ...s, error: msg, status: 'error' }))
      return
    }

    /* 完成（兼容 done / stopped / workflow_stopped） */
    if (DONE_EVENTS.has(type)) {
      setState(s => ({ ...s, status: 'done' }))
    }
  }, [])

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                     读取 SSE 流                                          │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const readStream = useCallback(async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const lines = decoder.decode(value).split('\n')
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try { handleEvent(JSON.parse(line.slice(6))) } catch { /* 忽略解析错误 */ }
      }
    }
  }, [handleEvent])

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                     执行工作流                                           │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const execute = useCallback(async (input: Record<string, unknown>) => {
    const token = localStorage.getItem('token')
    if (!token) {
      setState(s => ({ ...s, error: '未登录，请重新登录', status: 'error' }))
      return
    }

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    aidRef.current = crypto.randomUUID()
    textRef.current = ''
    runIdRef.current = null

    setState({ messages: [], status: 'running', runId: null, error: null, steps: [], currentStep: -1 })

    try {
      const res = await fetch(`${AGENT_API_BASE}/workflows/${workflowId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ input }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '请求失败' }))
        throw new Error(data.error || data.detail || `请求失败: ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('无法读取响应流')
      await readStream(reader)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setState(s => ({ ...s, error: (err as Error).message, status: 'error' }))
      }
    } finally {
      setState(s => ({ ...s, status: s.status === 'running' ? 'done' : s.status }))
      abortRef.current = null
    }
  }, [workflowId, readStream])

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                     停止执行（前端中断 + 后端通知）                       │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const stop = useCallback(() => {
    abortRef.current?.abort()

    /* 通知后端停止工作流 */
    const rid = runIdRef.current
    if (rid) {
      const token = localStorage.getItem('token')
      fetch(`${AGENT_API_BASE}/workflows/stop/${rid}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => { /* 静默失败 */ })
    }

    setState(s => ({ ...s, status: 'done' }))
  }, [])

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                     清空状态                                             │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const clear = useCallback(() => {
    abortRef.current?.abort()
    textRef.current = ''
    aidRef.current = crypto.randomUUID()
    runIdRef.current = null
    setState(INITIAL_STATE)
  }, [])

  return { ...state, execute, stop, clear }
}
