import { v4 as uuid } from 'uuid'
import { executeAgent } from '../agent-executor.js'
import { loadSkill } from 'laborany-shared'
import type { CronJob } from './types.js'
import {
  markJobRunning,
  markJobCompleted,
  scheduleRetry,
  createRun,
  completeRun,
} from './store.js'
import { notifyJobComplete } from './notifier.js'

export async function runJob(job: CronJob): Promise<void> {
  const sessionId = `cron-${job.id}-${uuid().slice(0, 8)}`

  const locked = markJobRunning(job.id, sessionId)
  if (!locked) {
    console.log(`[Cron] 任务 ${job.name} 正在执行中，跳过`)
    return
  }

  console.log(`[Cron] 开始执行任务: ${job.name} (${job.id})`)
  const startTime = Date.now()
  const runId = createRun(job.id, sessionId)

  try {
    await runSkillJob(job, sessionId)

    const durationMs = Date.now() - startTime
    markJobCompleted(job.id, 'ok')
    completeRun(runId, 'ok', undefined, durationMs)
    console.log(`[Cron] 任务完成: ${job.name}，耗时 ${durationMs}ms`)

    await notifyJobComplete(job, 'ok', sessionId)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    const durationMs = Date.now() - startTime
    completeRun(runId, 'error', error, durationMs)
    console.error(`[Cron] 任务失败: ${job.name}`, error)

    const shouldRetry = (job.retryCount ?? 0) < job.retryMaxRetries

    if (shouldRetry) {
      scheduleRetry(job.id, job.retryCount ?? 0)
      console.log(
        `[Cron] 已安排重试: ${job.name} (${(job.retryCount ?? 0) + 1}/${job.retryMaxRetries})`,
      )
    } else {
      markJobCompleted(job.id, 'error', error)
      await notifyJobComplete(job, 'error', sessionId, error)
    }
  }
}

async function runSkillJob(job: CronJob, sessionId: string): Promise<void> {
  const skill = await loadSkill.byId(job.targetId)
  if (!skill) {
    throw new Error(`Skill 不存在: ${job.targetId}`)
  }

  const abortController = new AbortController()
  const errors: string[] = []

  await executeAgent({
    skill,
    query: job.targetQuery,
    sessionId,
    signal: abortController.signal,
    onEvent: (event) => {
      if (event.type === 'error' && event.content) {
        errors.push(event.content)
      }
    },
  })

  if (errors.length > 0) {
    throw new Error(errors.join('; '))
  }
}

export async function triggerJob(jobId: string): Promise<{
  success: boolean
  sessionId?: string
  error?: string
}> {
  const { getJob } = await import('./store.js')

  const job = getJob(jobId)
  if (!job) {
    return { success: false, error: '任务不存在' }
  }

  const sessionId = `cron-manual-${job.id}-${uuid().slice(0, 8)}`
  const startTime = Date.now()
  const runId = createRun(job.id, sessionId)

  try {
    await runSkillJob(job, sessionId)

    const durationMs = Date.now() - startTime
    completeRun(runId, 'ok', undefined, durationMs)
    await notifyJobComplete(job, 'ok', sessionId)

    return { success: true, sessionId }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    completeRun(runId, 'error', error, Date.now() - startTime)
    await notifyJobComplete(job, 'error', sessionId, error)

    return { success: false, error, sessionId }
  }
}
