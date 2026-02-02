/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Cron 定时任务 - 类型定义                              ║
 * ║                                                                          ║
 * ║  三种调度类型统一抽象：at（一次性）、every（周期）、cron（表达式）           ║
 * ║  设计哲学：扁平化存储，消除 JSON 解析，让查询和索引自然高效                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           调度类型定义                                    │
 * │  三种类型统一为 Schedule 联合类型，通过 kind 字段区分                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export type ScheduleKind = 'at' | 'every' | 'cron'

/** 一次性任务：指定时间点执行 */
export interface ScheduleAt {
  kind: 'at'
  atMs: number  // 执行时间戳（毫秒）
}

/** 周期性任务：固定间隔执行 */
export interface ScheduleEvery {
  kind: 'every'
  everyMs: number  // 间隔毫秒数
}

/** Cron 表达式任务 */
export interface ScheduleCron {
  kind: 'cron'
  expr: string     // Cron 表达式，如 "0 9 * * 1-5"
  tz?: string      // 时区，默认 Asia/Shanghai
}

export type Schedule = ScheduleAt | ScheduleEvery | ScheduleCron

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           执行目标定义                                    │
 * │  支持 Skill 和 Workflow 两种执行目标                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export type TargetType = 'skill' | 'workflow'

export interface ExecutionTarget {
  type: TargetType
  id: string       // skillId 或 workflowId
  query: string    // 执行时的 prompt 或 input
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           任务状态定义                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export type JobStatus = 'ok' | 'error' | 'running' | null

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           核心数据结构                                    │
 * │  CronJob：定时任务定义                                                    │
 * │  CronRun：执行记录                                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export interface CronJob {
  id: string
  name: string
  description?: string
  enabled: boolean

  // 调度配置（扁平化存储）
  scheduleKind: ScheduleKind
  scheduleAtMs?: number
  scheduleEveryMs?: number
  scheduleCronExpr?: string
  scheduleCronTz?: string

  // 执行目标
  targetType: TargetType
  targetId: string
  targetQuery: string

  // 运行状态
  nextRunAtMs?: number
  lastRunAtMs?: number
  lastStatus?: JobStatus
  lastError?: string
  runningSessionId?: string  // 并发锁：正在执行的会话 ID

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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           API 请求/响应类型                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/** 创建任务请求 */
export interface CreateJobRequest {
  name: string
  description?: string
  schedule: Schedule
  target: ExecutionTarget
  enabled?: boolean
}

/** 更新任务请求 */
export interface UpdateJobRequest {
  name?: string
  description?: string
  schedule?: Schedule
  target?: ExecutionTarget
  enabled?: boolean
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           辅助函数：Schedule 转换                         │
 * │  在 API 层的 Schedule 对象和数据库扁平字段之间转换                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/** 从 Schedule 对象提取扁平字段 */
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

/** 从扁平字段重建 Schedule 对象 */
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
    tz: job.scheduleCronTz
  }
}
