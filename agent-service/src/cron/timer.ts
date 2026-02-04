/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Cron 定时任务 - 动态定时器                            ║
 * ║                                                                          ║
 * ║  核心机制：动态计算下次唤醒时间，精确到毫秒级                               ║
 * ║  设计哲学：事件驱动优于轮询，只在需要时唤醒                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { getDueJobs, getNextWakeTime } from './store.js'
import { runJob } from './executor.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           定时器状态                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */

let timerId: ReturnType<typeof setTimeout> | null = null
let isRunning = false

/* ════════════════════════════════════════════════════════════════════════════
 *  setTimeout 最大值约 24.8 天（2^31 - 1 毫秒）
 *  超过此值需要分段设置定时器
 * ════════════════════════════════════════════════════════════════════════════ */
const MAX_TIMEOUT_MS = 2147483647

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           启动定时器                                      │
 * │  服务启动时调用，开始动态调度                                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function startCronTimer(): void {
  if (isRunning) return

  isRunning = true
  console.log('[Cron] 动态定时器已启动')
  armTimer()
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
 * │                           动态设置定时器                                  │
 * │  计算下次唤醒时间，精确调度                                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function armTimer(): void {
  if (!isRunning) return

  if (timerId) {
    clearTimeout(timerId)
    timerId = null
  }

  const nextAt = getNextWakeTime()

  /* ────────────────────────────────────────────────────────────────────────
   *  无待执行任务时，每 60 秒检查一次（兜底）
   *  这处理了新任务创建但未调用 triggerPoll 的边缘情况
   * ──────────────────────────────────────────────────────────────────────── */
  if (nextAt === null) {
    timerId = setTimeout(armTimer, 60_000)
    return
  }

  const delay = Math.max(nextAt - Date.now(), 0)
  const actualDelay = Math.min(delay, MAX_TIMEOUT_MS)

  if (delay > 0) {
    console.log(`[Cron] 下次唤醒: ${new Date(nextAt).toLocaleString()} (${Math.round(delay / 1000)}s 后)`)
  }

  timerId = setTimeout(poll, actualDelay)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           轮询逻辑                                        │
 * │  检查到期任务 → 并发执行 → 重新设置定时器                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */

async function poll(): Promise<void> {
  if (!isRunning) return

  try {
    const dueJobs = getDueJobs()

    if (dueJobs.length > 0) {
      console.log(`[Cron] 发现 ${dueJobs.length} 个到期任务`)

      await Promise.allSettled(
        dueJobs.map(job => runJob(job).catch(err => {
          console.error(`[Cron] 任务 ${job.id} 执行失败:`, err)
        }))
      )
    }
  } catch (err) {
    console.error('[Cron] 轮询出错:', err)
  }

  armTimer()
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           立即触发重新调度                                │
 * │  任务创建/更新/删除后调用，重新计算下次唤醒时间                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function triggerPoll(): void {
  if (!isRunning) return

  /* ────────────────────────────────────────────────────────────────────────
   *  延迟 100ms 执行，合并短时间内的多次触发
   *  然后重新设置定时器
   * ──────────────────────────────────────────────────────────────────────── */
  if (timerId) {
    clearTimeout(timerId)
    timerId = null
  }

  setTimeout(() => {
    poll()
  }, 100)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           获取定时器状态                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function getCronTimerStatus(): { running: boolean; nextWakeAt: number | null } {
  return {
    running: isRunning,
    nextWakeAt: getNextWakeTime()
  }
}
