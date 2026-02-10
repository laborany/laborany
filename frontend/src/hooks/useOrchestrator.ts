/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     编排调度 Hook - useOrchestrator                    ║
 * ║                                                                        ║
 * ║  职责：连接 HomeChat 和执行引擎，作为首页核心调度器                      ║
 * ║  流程：用户输入 → POST /orchestrate → 归一化结果 → 返回执行计划          ║
 * ║  设计：策略表驱动类型归一化，消除 if/else 分支                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useCallback } from 'react'
import { AGENT_API_BASE } from '../config/api'
import type { WorkflowStep as WorkflowStepUI } from '../components/execution/StepProgress'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/** 后端 OrchestratePlan 原始类型 */
type RawPlanType =
  | 'cron'
  | 'direct_skill'
  | 'workflow'
  | 'llm_skill'
  | 'llm_workflow'
  | 'create_and_run'

/** 前端归一化后的执行类型 */
export type OrchestrateType =
  | 'direct_skill'
  | 'workflow'
  | 'create_and_run'
  | 'cron'

export interface OrchestrateResult {
  type: OrchestrateType
  skillId?: string
  workflowId?: string
  schedule?: string
  targetQuery?: string
  confidence: number
  reason?: string
}

export interface UseOrchestratorReturn {
  orchestrate: (query: string) => Promise<void>
  result: OrchestrateResult | null
  status: 'idle' | 'routing' | 'ready'
  error: string | null
  reset: () => void
  workflowSteps: WorkflowStepUI[]
  updateWorkflowSteps: (steps: WorkflowStepUI[]) => void
  resetWorkflowSteps: () => void
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                  类型归一化表 —— 用数据结构消除分支                       │
 * │                                                                          │
 * │  后端返回 6 种类型，前端只关心 4 种执行路径                               │
 * │  llm_skill  → direct_skill（LLM 匹配的技能，执行方式相同）               │
 * │  llm_workflow → workflow（LLM 匹配的工作流，执行方式相同）                │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const TYPE_MAP: Record<RawPlanType, OrchestrateType> = {
  direct_skill: 'direct_skill',
  llm_skill: 'direct_skill',
  workflow: 'workflow',
  llm_workflow: 'workflow',
  create_and_run: 'create_and_run',
  cron: 'cron',
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                  归一化后端响应 → 前端结果                                │
 * │  单一职责：类型映射 + 字段提取，无分支逻辑                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function normalize(plan: Record<string, unknown>): OrchestrateResult {
  const rawType = plan.type as RawPlanType
  const type = TYPE_MAP[rawType] ?? 'create_and_run'

  return {
    type,
    skillId: (plan.skillId as string) ?? undefined,
    workflowId: (plan.workflowId as string) ?? undefined,
    schedule: (plan.schedule as string) ?? undefined,
    targetQuery: (plan.targetQuery ?? plan.description) as string | undefined,
    confidence: (plan.confidence as number) ?? 0,
    reason: (plan.reason as string) ?? undefined,
  }
}

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                           Hook 实现                                    ║
 * ║                                                                        ║
 * ║  状态机：idle → routing → ready                                        ║
 * ║  idle    ：等待用户输入                                                 ║
 * ║  routing ：正在调用 /orchestrate                                       ║
 * ║  ready   ：编排完成，result 可用                                        ║
 * ║                                                                        ║
 * ║  workflowSteps：工作流步骤进度（由调用方通过 SSE 事件更新）              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */
export function useOrchestrator(): UseOrchestratorReturn {
  const [result, setResult] = useState<OrchestrateResult | null>(null)
  const [status, setStatus] = useState<'idle' | 'routing' | 'ready'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStepUI[]>([])

  const orchestrate = useCallback(async (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return

    setStatus('routing')
    setError(null)
    setResult(null)

    try {
      const res = await fetch(`${AGENT_API_BASE}/orchestrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as Record<string, string>).error || `编排失败: ${res.status}`)
      }

      const plan = await res.json()
      setResult(normalize(plan))
      setStatus('ready')
    } catch (err) {
      setError((err as Error).message)
      setStatus('idle')
    }
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setStatus('idle')
    setError(null)
  }, [])

  const resetWorkflowSteps = useCallback(() => {
    setWorkflowSteps([])
  }, [])

  return {
    orchestrate, result, status, error, reset,
    workflowSteps,
    updateWorkflowSteps: setWorkflowSteps,
    resetWorkflowSteps,
  }
}
