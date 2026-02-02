/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Cron 定时任务 - 定时器管理                            ║
 * ║                                                                          ║
 * ║  核心机制：单一 setTimeout 轮询，检查到期任务并执行                        ║
 * ║  设计哲学：简单胜于复杂，一个定时器管理所有任务                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { getDueJobs } from './store.js'
import { runJob } from './executor.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           定时器状态                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */

let timerId: ReturnType<typeof setTimeout> | null = null
let isRunning = false

// 轮询间隔：30 秒检查一次
const POLL_INTERVAL_MS = 30_000

// 最小执行间隔：防止任务执行过于频繁
const MIN_INTERVAL_MS = 5_000

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           启动定时器                                      │
 * │  服务启动时调用，开始轮询检查到期任务                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function startCronTimer(): void {
  if (isRunning) return

  isRunning = true
  console.log('[Cron] 定时器已启动，轮询间隔:', POLL_INTERVAL_MS / 1000, '秒')
  scheduleNextPoll()
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           停止定时器                                      │
 * │  服务关闭时调用                                                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function stopCronTimer(): void {
  isRunning = false
  if (timerId) {
    clearTimeout(timerId)
    timerId = null
  }
  console.log('[Cron] 定时器已停止')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           轮询逻辑                                        │
 * │  检查到期任务 → 并发执行 → 重设定时器                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */

async function poll(): Promise<void> {
  if (!isRunning) return

  try {
    const dueJobs = getDueJobs()

    if (dueJobs.length > 0) {
      console.log(`[Cron] 发现 ${dueJobs.length} 个到期任务`)

      // 并发执行所有到期任务（每个任务有自己的并发锁）
      await Promise.allSettled(
        dueJobs.map(job => runJob(job).catch(err => {
          console.error(`[Cron] 任务 ${job.id} 执行失败:`, err)
        }))
      )
    }
  } catch (err) {
    console.error('[Cron] 轮询出错:', err)
  }

  // 继续下一轮轮询
  scheduleNextPoll()
}

function scheduleNextPoll(): void {
  if (!isRunning) return

  timerId = setTimeout(poll, POLL_INTERVAL_MS)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           立即触发轮询                                    │
 * │  用于任务创建/更新后立即检查                                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function triggerPoll(): void {
  if (!isRunning) return

  // 取消当前定时器，立即执行轮询
  if (timerId) {
    clearTimeout(timerId)
    timerId = null
  }

  // 延迟 100ms 执行，避免频繁触发
  setTimeout(poll, 100)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           获取定时器状态                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function getCronTimerStatus(): { running: boolean; pollIntervalMs: number } {
  return {
    running: isRunning,
    pollIntervalMs: POLL_INTERVAL_MS
  }
}
