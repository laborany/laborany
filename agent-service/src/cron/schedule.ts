/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Cron 定时任务 - 调度计算                              ║
 * ║                                                                          ║
 * ║  核心设计：三种调度类型统一为 computeNextRunAtMs() 函数                    ║
 * ║  消除特殊情况，让调度逻辑自然融入统一接口                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Cron } from 'croner'
import type { Schedule, CronJob } from './types.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           计算下次执行时间                                │
 * │  输入：Schedule 配置 + 可选的上次执行时间                                  │
 * │  输出：下次执行的时间戳（毫秒），null 表示不再执行                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function computeNextRunAtMs(
  schedule: Schedule,
  lastRunAtMs?: number
): number | null {
  const now = Date.now()

  // at：一次性任务，只在指定时间执行一次
  if (schedule.kind === 'at') {
    return schedule.atMs > now ? schedule.atMs : null
  }

  // every：周期性任务，基于上次执行时间计算
  if (schedule.kind === 'every') {
    const base = lastRunAtMs ?? now
    const next = base + schedule.everyMs
    return next > now ? next : now + schedule.everyMs
  }

  // cron：使用 croner 库解析表达式
  const cron = new Cron(schedule.expr, { timezone: schedule.tz || 'Asia/Shanghai' })
  const nextDate = cron.nextRun()
  return nextDate ? nextDate.getTime() : null
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           从 Job 计算下次执行                             │
 * │  便捷函数：直接从 CronJob 对象提取 Schedule 并计算                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function computeNextRunFromJob(job: CronJob): number | null {
  const schedule = jobToSchedule(job)
  return computeNextRunAtMs(schedule, job.lastRunAtMs)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Job 转 Schedule                                │
 * │  从扁平化的 Job 字段重建 Schedule 对象                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function jobToSchedule(job: CronJob): Schedule {
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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           验证 Cron 表达式                                │
 * │  返回 null 表示有效，否则返回错误信息                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function validateCronExpr(expr: string): string | null {
  try {
    new Cron(expr)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : '无效的 Cron 表达式'
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           人类可读的调度描述                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */

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

  // cron 表达式的常见模式
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
