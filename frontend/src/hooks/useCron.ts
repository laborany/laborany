/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Cron 定时任务 - React Hook                            ║
 * ║                                                                          ║
 * ║  职责：封装 Cron API 调用，提供状态管理                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect, useCallback } from 'react'
import { AGENT_API_BASE } from '../config/api'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────��───────────────┘ */

export type ScheduleKind = 'at' | 'every' | 'cron'

export interface ScheduleAt {
  kind: 'at'
  atMs: number
}

export interface ScheduleEvery {
  kind: 'every'
  everyMs: number
}

export interface ScheduleCron {
  kind: 'cron'
  expr: string
  tz?: string
}

export type Schedule = ScheduleAt | ScheduleEvery | ScheduleCron

export type TargetType = 'skill' | 'workflow'

export interface ExecutionTarget {
  type: TargetType
  id: string
  query: string
}

export interface CronJob {
  id: string
  name: string
  description?: string
  enabled: boolean
  scheduleKind: ScheduleKind
  scheduleAtMs?: number
  scheduleEveryMs?: number
  scheduleCronExpr?: string
  scheduleCronTz?: string
  targetType: TargetType
  targetId: string
  targetQuery: string
  nextRunAtMs?: number
  lastRunAtMs?: number
  lastStatus?: 'ok' | 'error' | 'running' | null
  lastError?: string
  createdAt: string
  updatedAt: string
}

export interface CronRun {
  id: number
  jobId: string
  sessionId?: string
  status: 'ok' | 'error'
  error?: string
  durationMs?: number
  startedAt: string
  completedAt?: string
}

export interface CreateJobRequest {
  name: string
  description?: string
  schedule: Schedule
  target: ExecutionTarget
  enabled?: boolean
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           API 调用函数                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */

async function fetchJobs(): Promise<CronJob[]> {
  const res = await fetch(`${AGENT_API_BASE}/cron/jobs`)
  if (!res.ok) throw new Error('获取任务列表失败')
  const data = await res.json()
  return data.jobs
}

async function createJobApi(req: CreateJobRequest): Promise<CronJob> {
  const res = await fetch(`${AGENT_API_BASE}/cron/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || '创建任务失败')
  }
  return res.json()
}

async function updateJobApi(id: string, updates: Partial<CreateJobRequest>): Promise<CronJob> {
  const res = await fetch(`${AGENT_API_BASE}/cron/jobs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || '更新任务失败')
  }
  return res.json()
}

async function deleteJobApi(id: string): Promise<void> {
  const res = await fetch(`${AGENT_API_BASE}/cron/jobs/${id}`, {
    method: 'DELETE'
  })
  if (!res.ok) throw new Error('删除任务失败')
}

async function triggerJobApi(id: string): Promise<{ sessionId?: string }> {
  const res = await fetch(`${AGENT_API_BASE}/cron/jobs/${id}/run`, {
    method: 'POST'
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || '触发任务失败')
  }
  return res.json()
}

async function fetchJobRuns(id: string, limit = 20): Promise<CronRun[]> {
  const res = await fetch(`${AGENT_API_BASE}/cron/jobs/${id}/runs?limit=${limit}`)
  if (!res.ok) throw new Error('获取执行历史失败')
  const data = await res.json()
  return data.runs
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           useCronJobs Hook                               │
 * │  管理任务列表的获取、创建、更新、删除                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function useCronJobs() {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchJobs()
      setJobs(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createJob = useCallback(async (req: CreateJobRequest) => {
    const job = await createJobApi(req)
    setJobs(prev => [job, ...prev])
    return job
  }, [])

  const updateJob = useCallback(async (id: string, updates: Partial<CreateJobRequest>) => {
    const job = await updateJobApi(id, updates)
    setJobs(prev => prev.map(j => j.id === id ? job : j))
    return job
  }, [])

  const deleteJob = useCallback(async (id: string) => {
    await deleteJobApi(id)
    setJobs(prev => prev.filter(j => j.id !== id))
  }, [])

  const triggerJob = useCallback(async (id: string) => {
    const result = await triggerJobApi(id)
    // 刷新任务状态
    await refresh()
    return result
  }, [refresh])

  return {
    jobs,
    loading,
    error,
    refresh,
    createJob,
    updateJob,
    deleteJob,
    triggerJob
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           useCronJobRuns Hook                            │
 * │  管理单个任务的执行历史                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function useCronJobRuns(jobId: string | null) {
  const [runs, setRuns] = useState<CronRun[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!jobId) return
    try {
      setLoading(true)
      setError(null)
      const data = await fetchJobRuns(jobId)
      setRuns(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { runs, loading, error, refresh }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           辅助函数                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/** 从 CronJob 重建 Schedule 对象 */
export function jobToSchedule(job: CronJob): Schedule {
  if (job.scheduleKind === 'at') {
    return { kind: 'at', atMs: job.scheduleAtMs! }
  }
  if (job.scheduleKind === 'every') {
    return { kind: 'every', everyMs: job.scheduleEveryMs! }
  }
  return {
    kind: 'cron',
    expr: job.scheduleCronExpr!,
    tz: job.scheduleCronTz
  }
}

/** 格式化调度描述 */
export function describeSchedule(schedule: Schedule): string {
  if (schedule.kind === 'at') {
    return `在 ${new Date(schedule.atMs).toLocaleString('zh-CN')} 执行一次`
  }

  if (schedule.kind === 'every') {
    const ms = schedule.everyMs
    if (ms < 60000) return `每 ${Math.round(ms / 1000)} 秒`
    if (ms < 3600000) return `每 ${Math.round(ms / 60000)} 分钟`
    if (ms < 86400000) return `每 ${Math.round(ms / 3600000)} 小时`
    return `每 ${Math.round(ms / 86400000)} 天`
  }

  const patterns: Record<string, string> = {
    '0 * * * *': '每小时整点',
    '0 0 * * *': '每天 0 点',
    '0 9 * * *': '每天 9 点',
    '0 9 * * 1-5': '工作日 9 点',
    '0 0 * * 0': '每周日 0 点',
    '0 0 1 * *': '每月 1 号 0 点',
  }

  return patterns[schedule.expr] || `Cron: ${schedule.expr}`
}

/** 格式化时间戳 */
export function formatTime(ms: number | undefined): string {
  if (!ms) return '-'
  return new Date(ms).toLocaleString('zh-CN')
}

/** 格式化持续时间 */
export function formatDuration(ms: number | undefined): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}min`
}
