/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     后台任务管理器                                        ║
 * ║                                                                          ║
 * ║  职责：管理执行中的任务，支持断线重连和完成通知                             ║
 * ║  设计：内存缓存 + 事件订阅模式                                             ║
 * ║                                                                          ║
 * ║  核心理念：任务状态持久化在后端，前端只是视图层                             ║
 * ║  "让任务像河流一样流动，前端只是观察河流的窗口，而非河流本身"               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { AgentEvent } from './agent-executor.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export type TaskStatus = 'running' | 'completed' | 'failed'

export interface Task {
  sessionId: string
  skillId: string
  skillName: string                              // 用户友好的名称（用于通知）
  status: TaskStatus
  events: AgentEvent[]                           // 缓存事件，支持重连
  subscribers: Set<(event: AgentEvent) => void>  // SSE 订阅者
  startedAt: number
  completedAt?: number
  error?: string
}

export interface TaskStatusInfo {
  status: TaskStatus
  skillId: string
  startedAt: string
  completedAt?: string
  error?: string
  eventCount: number
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           任务管理器                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */

class TaskManager {
  private tasks = new Map<string, Task>()

  // 清理定时器
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    // 每 5 分钟清理一次超时任务
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 注册任务（执行开始时调用）
   * skillName: 用户友好的名称，用于通知显示
   * ──────────────────────────────────────────────────────────────────────── */
  register(sessionId: string, skillId: string, skillName?: string): Task {
    const task: Task = {
      sessionId,
      skillId,
      skillName: skillName || skillId,
      status: 'running',
      events: [],
      subscribers: new Set(),
      startedAt: Date.now(),
    }
    this.tasks.set(sessionId, task)
    console.log(`[TaskManager] 注册任务: ${sessionId} (${skillName || skillId})`)
    return task
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 添加事件（executeAgent 的 onEvent 回调中调用）
   * ──────────────────────────────────────────────────────────────────────── */
  addEvent(sessionId: string, event: AgentEvent): void {
    const task = this.tasks.get(sessionId)
    if (!task) return

    // 缓存事件
    task.events.push(event)

    // 分发给所有订阅者
    task.subscribers.forEach(fn => {
      try {
        fn(event)
      } catch (err) {
        console.error('[TaskManager] 事件分发失败:', err)
      }
    })

    // 检查任务是否完成
    if (event.type === 'done' || event.type === 'error') {
      task.status = event.type === 'done' ? 'completed' : 'failed'
      task.completedAt = Date.now()
      if (event.type === 'error') {
        task.error = event.content
      }

      console.log(`[TaskManager] 任务完成: ${sessionId} (${task.status})`)

      // 如果没有订阅者（用户已离开），发送通知
      if (task.subscribers.size === 0) {
        this.notifyCompletion(task)
      }
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 订阅任务事件（SSE 连接时调用）
   * 返回取消订阅函数
   * ──────────────────────────────────────────────────────────────────────── */
  subscribe(sessionId: string, onEvent: (e: AgentEvent) => void): () => void {
    const task = this.tasks.get(sessionId)
    if (!task) return () => {}

    // 重放历史事件
    task.events.forEach(onEvent)

    // 添加订阅者
    task.subscribers.add(onEvent)
    console.log(`[TaskManager] 订阅任务: ${sessionId} (订阅者: ${task.subscribers.size})`)

    // 返回取消订阅函数
    return () => {
      task.subscribers.delete(onEvent)
      console.log(`[TaskManager] 取消订阅: ${sessionId} (订阅者: ${task.subscribers.size})`)

      // 如果任务已完成且没有订阅者，发送通知
      if (task.status !== 'running' && task.subscribers.size === 0) {
        this.notifyCompletion(task)
      }
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 查询任务状态
   * ──────────────────────────────────────────────────────────────────────── */
  getStatus(sessionId: string): TaskStatusInfo | null {
    const task = this.tasks.get(sessionId)
    if (!task) return null

    return {
      status: task.status,
      skillId: task.skillId,
      startedAt: new Date(task.startedAt).toISOString(),
      completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : undefined,
      error: task.error,
      eventCount: task.events.length,
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 检查任务是否存在
   * ──────────────────────────────────────────────────────────────────────── */
  has(sessionId: string): boolean {
    return this.tasks.has(sessionId)
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 检查任务是否正在运行
   * ──────────────────────────────────────────────────────────────────────── */
  isRunning(sessionId: string): boolean {
    const task = this.tasks.get(sessionId)
    return task?.status === 'running'
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 发送完成通知（仅当用户已离开时）
   * ──────────────────────────────────────────────────────────────────────── */
  private notifyCompletion(task: Task): void {
    // 避免重复通知
    if ((task as Task & { notified?: boolean }).notified) return
    ;(task as Task & { notified?: boolean }).notified = true

    // 延迟导入避免循环依赖
    import('./cron/notifier.js').then(({ notifyTaskComplete }) => {
      notifyTaskComplete(
        task.sessionId,
        task.skillName,  // 使用友好名称
        task.status === 'completed' ? 'ok' : 'error',
        task.error
      )
    }).catch(err => {
      console.error('[TaskManager] 发送通知失败:', err)
    })
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 清理超时任务（默认 30 分钟）
   * ──────────────────────────────────────────────────────────────────────── */
  cleanup(maxAgeMs = 30 * 60 * 1000): number {
    const now = Date.now()
    let cleaned = 0

    for (const [id, task] of this.tasks) {
      // 只清理已完成的任务
      if (task.status === 'running') continue

      const age = now - (task.completedAt || task.startedAt)
      if (age > maxAgeMs) {
        this.tasks.delete(id)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`[TaskManager] 清理了 ${cleaned} 个超时任务`)
    }
    return cleaned
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 获取活跃任务数量
   * ──────────────────────────────────────────────────────────────────────── */
  get activeCount(): number {
    let count = 0
    for (const task of this.tasks.values()) {
      if (task.status === 'running') count++
    }
    return count
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 获取运行中的任务列表（用于前端显示）
   * ──────────────────────────────────────────────────────────────────────── */
  getRunningTasks(): Array<{
    sessionId: string
    skillId: string
    skillName: string
    startedAt: string
  }> {
    const result: Array<{
      sessionId: string
      skillId: string
      skillName: string
      startedAt: string
    }> = []

    for (const task of this.tasks.values()) {
      if (task.status === 'running') {
        result.push({
          sessionId: task.sessionId,
          skillId: task.skillId,
          skillName: task.skillName,
          startedAt: new Date(task.startedAt).toISOString(),
        })
      }
    }

    return result
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 销毁管理器
   * ──────────────────────────────────────────────────────────────────────── */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.tasks.clear()
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出单例                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export const taskManager = new TaskManager()
