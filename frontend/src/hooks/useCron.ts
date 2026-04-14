/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Cron 定时任务 - React Hook                            ║
 * ║                                                                          ║
 * ║  职责：封装 Cron API 调用，提供状态管理                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect, useCallback } from 'react'
import { AGENT_API_BASE, API_BASE } from '../config/api'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

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

export type TargetType = 'skill'

export interface ExecutionTarget {
  type: TargetType
  id: string
  query: string
}

export type JobSourceChannel = 'desktop' | 'feishu' | 'qq' | 'wechat'
export type JobNotifyChannel = 'app' | 'email' | 'feishu_dm' | 'qq_dm' | 'wechat_dm'

export interface JobSource {
  channel: JobSourceChannel
  feishuOpenId?: string
  feishuChatId?: string
  qqOpenId?: string
  wechatUserId?: string
}

export interface JobNotify {
  channel: JobNotifyChannel
  feishuOpenId?: string
  qqOpenId?: string
  wechatUserId?: string
}

export interface DeliveryChannelAvailability {
  enabled: boolean
  reason?: string
  resolvedRecipientLabel?: string
  resolvedRecipientId?: string
}

export interface DeliveryStatusResponse {
  channels: Record<JobNotifyChannel, DeliveryChannelAvailability>
}

interface ConfigItem {
  value: string
  masked: string
}

interface WechatStatusResponse {
  enabled: boolean
  running: boolean
  loggedIn: boolean
  credentialSource: 'env' | 'file' | null
  loginPending: boolean
  account: {
    accountId: string
    rawAccountId: string
    userId?: string
    savedAt: string
  } | null
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
  modelProfileId?: string
  sourceChannel: JobSourceChannel
  sourceFeishuOpenId?: string
  sourceFeishuChatId?: string
  sourceQqOpenId?: string
  sourceWechatUserId?: string
  notifyChannel: JobNotifyChannel
  notifyFeishuOpenId?: string
  notifyQqOpenId?: string
  notifyWechatUserId?: string
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
  modelProfileId?: string
  source?: JobSource
  notify?: JobNotify
}

interface FetchJobsResponse {
  jobs: CronJob[]
  degraded: boolean
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           API 调用函数                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */

async function fetchJobs(): Promise<FetchJobsResponse> {
  const res = await fetch(`${AGENT_API_BASE}/cron/jobs`)
  if (!res.ok) throw new Error('获取任务列表失败')
  const data = await res.json() as {
    jobs?: CronJob[]
    degraded?: boolean
  }
  return {
    jobs: Array.isArray(data.jobs) ? data.jobs : [],
    degraded: data.degraded === true,
  }
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

function parseListValue(rawValue?: string): string[] {
  return (rawValue || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

async function fetchDeliveryStatus(): Promise<DeliveryStatusResponse> {
  const [configRes, wechatRes, cronStatusRes] = await Promise.allSettled([
    fetch(`${API_BASE}/config`),
    fetch(`${AGENT_API_BASE}/wechat/status`),
    fetch(`${AGENT_API_BASE}/cron/delivery-status`),
  ])

  let configMap: Record<string, ConfigItem> = {}
  if (configRes.status === 'fulfilled' && configRes.value.ok) {
    const payload = await configRes.value.json() as { config?: Record<string, ConfigItem> }
    configMap = payload.config || {}
  }

  let wechatStatus: WechatStatusResponse | null = null
  if (wechatRes.status === 'fulfilled' && wechatRes.value.ok) {
    wechatStatus = await wechatRes.value.json() as WechatStatusResponse
  }

  let backendChannels: DeliveryStatusResponse['channels'] | null = null
  if (cronStatusRes.status === 'fulfilled' && cronStatusRes.value.ok) {
    const payload = await cronStatusRes.value.json() as DeliveryStatusResponse
    backendChannels = payload.channels || null
  }

  const email = (configMap.NOTIFICATION_EMAIL?.value || '').trim()
  const smtpHost = (configMap.SMTP_HOST?.value || '').trim()
  const smtpUser = (configMap.SMTP_USER?.value || '').trim()
  const smtpPass = (configMap.SMTP_PASS?.value || '').trim()
  const qqEnabled = (configMap.QQ_ENABLED?.value || '').trim().toLowerCase() === 'true'
  const qqAllowUsers = parseListValue(configMap.QQ_ALLOW_USERS?.value)
  const feishuEnabled = (configMap.FEISHU_ENABLED?.value || '').trim().toLowerCase() === 'true'

  return {
    channels: {
      app: {
        enabled: true,
        resolvedRecipientLabel: '应用内通知',
      },
      email: !email
        ? { enabled: false, reason: '未配置通知邮箱 (NOTIFICATION_EMAIL)' }
        : (!smtpHost || !smtpUser || !smtpPass)
          ? { enabled: false, reason: '未完整配置 SMTP_HOST / SMTP_USER / SMTP_PASS' }
          : { enabled: true, resolvedRecipientLabel: email },
      feishu_dm: backendChannels?.feishu_dm || (
        !feishuEnabled
          ? { enabled: false, reason: '未启用飞书 Bot' }
          : { enabled: false, reason: '请先用当前飞书账号与机器人对话一次，以建立送达对象' }
      ),
      qq_dm: backendChannels?.qq_dm || (
        !qqEnabled
          ? { enabled: false, reason: '未启用 QQ Bot' }
          : qqAllowUsers.length === 0
            ? { enabled: false, reason: '请先在 QQ_ALLOW_USERS 中配置至少一个接收账号' }
            : {
                enabled: true,
                resolvedRecipientLabel: qqAllowUsers[0],
                resolvedRecipientId: qqAllowUsers[0],
              }
      ),
      wechat_dm: backendChannels?.wechat_dm || (
        !wechatStatus?.enabled
          ? { enabled: false, reason: '未启用微信 Bot' }
          : (!wechatStatus.loggedIn || !wechatStatus.account)
            ? { enabled: false, reason: '未绑定微信账号' }
            : !wechatStatus.account.userId?.trim()
              ? { enabled: false, reason: '当前微信账号缺少 userId，无法作为送达对象' }
              : {
                  enabled: true,
                  resolvedRecipientLabel: wechatStatus.account.rawAccountId,
                  resolvedRecipientId: wechatStatus.account.userId.trim(),
                }
      ),
    },
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           useCronJobs Hook                               │
 * │  管理任务列表的获取、创建、更新、删除                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function useCronJobs() {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [degraded, setDegraded] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchJobs()
      setJobs(data.jobs)
      setDegraded(data.degraded)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
      setDegraded(false)
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
    degraded,
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

export function useCronDeliveryStatus() {
  const [status, setStatus] = useState<DeliveryStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchDeliveryStatus()
      setStatus(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载送达通道状态失败')
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    status,
    loading,
    error,
    refresh,
  }
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
