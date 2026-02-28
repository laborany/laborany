/**
 * Cron scheduling and execution target types.
 *
 * Note: execution target is unified as `skill`.
 * Composite skills are represented by skill metadata and handled by runtime.
 */

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

export interface RetryPolicy {
  maxRetries: number
  backoffMs: number
}

export type JobSourceChannel = 'desktop' | 'feishu'
export type JobNotifyChannel = 'app' | 'feishu_dm'

export interface JobSource {
  channel: JobSourceChannel
  feishuOpenId?: string
  feishuChatId?: string
}

export interface JobNotify {
  channel: JobNotifyChannel
  feishuOpenId?: string
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 0,
  backoffMs: 1000,
}

export type JobStatus = 'ok' | 'error' | 'running' | null

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
  notifyChannel: JobNotifyChannel
  notifyFeishuOpenId?: string

  retryMaxRetries: number
  retryBackoffMs: number

  nextRunAtMs?: number
  lastRunAtMs?: number
  lastStatus?: JobStatus
  lastError?: string
  runningSessionId?: string
  retryCount: number

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
  retry?: RetryPolicy
  modelProfileId?: string
  source?: JobSource
  notify?: JobNotify
}

export interface UpdateJobRequest {
  name?: string
  description?: string
  schedule?: Schedule
  target?: ExecutionTarget
  enabled?: boolean
  retry?: RetryPolicy
  modelProfileId?: string
  notify?: JobNotify
}

export function flattenSchedule(s: Schedule): {
  scheduleKind: ScheduleKind
  scheduleAtMs?: number
  scheduleEveryMs?: number
  scheduleCronExpr?: string
  scheduleCronTz?: string
} {
  const base = { scheduleKind: s.kind }

  if (s.kind === 'at') return { ...base, scheduleAtMs: s.atMs }
  if (s.kind === 'every') return { ...base, scheduleEveryMs: s.everyMs }
  return { ...base, scheduleCronExpr: s.expr, scheduleCronTz: s.tz }
}

export function unflattenSchedule(job: CronJob): Schedule {
  if (job.scheduleKind === 'at') {
    return { kind: 'at', atMs: job.scheduleAtMs! }
  }
  if (job.scheduleKind === 'every') {
    return { kind: 'every', everyMs: job.scheduleEveryMs! }
  }
  return {
    kind: 'cron',
    expr: job.scheduleCronExpr!,
    tz: job.scheduleCronTz,
  }
}
