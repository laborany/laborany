/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Cron 定时任务 - 任务执行器                            ║
 * ║                                                                          ║
 * ║  职责：执行到期的定时任务，复用 executeAgent                               ║
 * ║  设计：并发锁防止重复执行，完整记录执行历史                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { v4 as uuid } from 'uuid'
import { executeAgent } from '../agent-executor.js'
import { loadSkill } from 'laborany-shared'
import { executeWorkflow } from '../workflow/executor.js'
import { loadWorkflow } from '../workflow/loader.js'
import type { CronJob } from './types.js'
import {
  markJobRunning,
  markJobCompleted,
  scheduleRetry,
  createRun,
  completeRun
} from './store.js'
import { notifyJobComplete } from './notifier.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           执行定时任务                                    │
 * │  1. 获取并发锁                                                            │
 * │  2. 记录执行开始                                                          │
 * │  3. 执行 Agent/Workflow                                                   │
 * │  4. 处理重试逻辑                                                          │
 * │  5. 记录执行结果                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export async function runJob(job: CronJob): Promise<void> {
  const sessionId = `cron-${job.id}-${uuid().slice(0, 8)}`

  // 尝试获取并发锁
  const locked = markJobRunning(job.id, sessionId)
  if (!locked) {
    console.log(`[Cron] 任务 ${job.name} 正在执行中，跳过`)
    return
  }

  console.log(`[Cron] 开始执行任务: ${job.name} (${job.id})`)
  const startTime = Date.now()
  const runId = createRun(job.id, sessionId)

  try {
    if (job.targetType === 'skill') {
      await runSkillJob(job, sessionId)
    } else {
      await runWorkflowJob(job, sessionId)
    }

    const durationMs = Date.now() - startTime
    markJobCompleted(job.id, 'ok')
    completeRun(runId, 'ok', undefined, durationMs)
    console.log(`[Cron] 任务完成: ${job.name}，耗时 ${durationMs}ms`)

    // 发送成功通知
    await notifyJobComplete(job, 'ok', sessionId)

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    const durationMs = Date.now() - startTime
    completeRun(runId, 'error', error, durationMs)
    console.error(`[Cron] 任务失败: ${job.name}`, error)

    /* ────────────────────────────────────────────────────────────────────────
     *  重试逻辑：如果配置了重试且未达到最大次数，安排重试
     * ──────────────────────────────────────────────────────────────────────── */
    const canRetry = job.retryMaxRetries > 0 && job.retryCount < job.retryMaxRetries

    if (canRetry) {
      scheduleRetry(job.id, job.retryCount)
      // 重试时不发送失败通知，等最终结果
    } else {
      markJobCompleted(job.id, 'error', error)
      // 发送失败通知（已达到最大重试次数或未配置重试）
      await notifyJobComplete(job, 'error', sessionId, error)
    }
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           执行 Skill 任务                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */

async function runSkillJob(job: CronJob, sessionId: string): Promise<void> {
  const skill = await loadSkill.byId(job.targetId)
  if (!skill) {
    throw new Error(`Skill 不存在: ${job.targetId}`)
  }

  const abortController = new AbortController()

  /* ────────────────────────────────────────────────────────────────────────
   *  使用结构化错误收集，避免依赖字符串前缀判断
   * ──────────────────────────────────────────────────────────────────────── */
  const errors: string[] = []

  await executeAgent({
    skill,
    query: job.targetQuery,
    sessionId,
    signal: abortController.signal,
    onEvent: (event) => {
      // 通过 type === 'error' 或 isError 标记判断错误
      if (event.type === 'error' && event.content) {
        errors.push(event.content)
      }
    }
  })

  if (errors.length > 0) {
    throw new Error(errors.join('; '))
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           执行 Workflow 任务                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */

async function runWorkflowJob(job: CronJob, sessionId: string): Promise<void> {
  const workflow = await loadWorkflow.byId(job.targetId)
  if (!workflow) {
    throw new Error(`Workflow 不存在: ${job.targetId}`)
  }

  const abortController = new AbortController()

  // 解析 input（targetQuery 存储的是 JSON 字符串）
  let input: Record<string, string> = {}
  try {
    input = JSON.parse(job.targetQuery)
  } catch {
    // 如果不是 JSON，作为单一输入处理
    input = { query: job.targetQuery }
  }

  let lastError: string | undefined

  await executeWorkflow({
    workflow,
    input,
    runId: sessionId,
    signal: abortController.signal,
    onEvent: (event) => {
      if (event.type === 'workflow_error') {
        lastError = event.error
      } else if (event.type === 'step_error') {
        lastError = event.error
      }
    }
  })

  if (lastError) {
    throw new Error(lastError)
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           手动触发任务                                    │
 * │  用于 API 的 POST /cron/jobs/:id/run 端点                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export async function triggerJob(jobId: string): Promise<{
  success: boolean
  sessionId?: string
  error?: string
}> {
  // 动态导入避免循环依赖
  const { getJob } = await import('./store.js')

  const job = getJob(jobId)
  if (!job) {
    return { success: false, error: '任务不存在' }
  }

  const sessionId = `cron-manual-${job.id}-${uuid().slice(0, 8)}`
  const startTime = Date.now()

  // 手动触发不检查并发锁，直接执行
  console.log(`[Cron] 手动触发任务: ${job.name}`)
  const runId = createRun(job.id, sessionId)

  try {
    if (job.targetType === 'skill') {
      await runSkillJob(job, sessionId)
    } else {
      await runWorkflowJob(job, sessionId)
    }

    const durationMs = Date.now() - startTime
    completeRun(runId, 'ok', undefined, durationMs)

    // 发送成功通知
    await notifyJobComplete(job, 'ok', sessionId)

    return { success: true, sessionId }

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    completeRun(runId, 'error', error, Date.now() - startTime)

    // 发送失败通知
    await notifyJobComplete(job, 'error', sessionId, error)

    return { success: false, error, sessionId }
  }
}
