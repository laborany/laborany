/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    Cron 定时任务 & 通知 API 路由                         ║
 * ║                                                                          ║
 * ║  职责：处理定时任务 + 通知相关的 HTTP 请求                                ║
 * ║  包含：任务 CRUD、手动触发、执行历史、通知列表、已读标记                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Router, Request, Response } from 'express'
import {
  listJobs,
  getJob,
  createJob,
  updateJob,
  deleteJob,
  getJobRuns,
  triggerJob,
  getCronTimerStatus,
  validateCronExpr,
  describeSchedule,
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  sendTestEmail,
} from '../cron/index.js'
import type { CreateJobRequest, UpdateJobRequest, Schedule } from '../cron/index.js'

const router = Router()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取定时任务列表                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.get('/jobs', (_req: Request, res: Response) => {
  try {
    const jobs = listJobs()
    res.json({ jobs })
  } catch (error) {
    res.status(500).json({ error: '获取任务列表失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取单个定时任务                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.get('/jobs/:id', (req: Request, res: Response) => {
  const { id } = req.params
  const job = getJob(id)
  if (!job) {
    res.status(404).json({ error: '任务不存在' })
    return
  }
  res.json(job)
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       创建定时任务                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.post('/jobs', (req: Request, res: Response) => {
  const { name, description, schedule, target, enabled } = req.body as CreateJobRequest

  if (!name || !schedule || !target) {
    res.status(400).json({ error: '缺少必要参数: name, schedule, target' })
    return
  }

  if (schedule.kind === 'cron') {
    const error = validateCronExpr(schedule.expr)
    if (error) {
      res.status(400).json({ error: `无效的 Cron 表达式: ${error}` })
      return
    }
  }

  try {
    const job = createJob({ name, description, schedule, target, enabled })
    res.json(job)
  } catch (error) {
    res.status(500).json({ error: '创建任务失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       更新定时任务                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.patch('/jobs/:id', (req: Request, res: Response) => {
  const { id } = req.params
  const updates = req.body as UpdateJobRequest

  if (updates.schedule?.kind === 'cron') {
    const error = validateCronExpr(updates.schedule.expr)
    if (error) {
      res.status(400).json({ error: `无效的 Cron 表达式: ${error}` })
      return
    }
  }

  try {
    const job = updateJob(id, updates)
    if (!job) {
      res.status(404).json({ error: '任务不存在' })
      return
    }
    res.json(job)
  } catch (error) {
    res.status(500).json({ error: '更新任务失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       删除定时任务                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.delete('/jobs/:id', (req: Request, res: Response) => {
  const { id } = req.params
  const success = deleteJob(id)
  if (!success) {
    res.status(404).json({ error: '任务不存在' })
    return
  }
  res.json({ success: true })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       手动触发定时任务                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.post('/jobs/:id/run', async (req: Request, res: Response) => {
  const { id } = req.params
  const result = await triggerJob(id)
  if (!result.success) {
    res.status(result.error === '任务不存在' ? 404 : 500).json({ error: result.error })
    return
  }
  res.json({ success: true, sessionId: result.sessionId })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取任务执行历史                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.get('/jobs/:id/runs', (req: Request, res: Response) => {
  const { id } = req.params
  const limit = parseInt(req.query.limit as string) || 20

  const job = getJob(id)
  if (!job) {
    res.status(404).json({ error: '任务不存在' })
    return
  }

  const runs = getJobRuns(id, limit)
  res.json({ runs })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取定时器状态                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.get('/status', (_req: Request, res: Response) => {
  res.json(getCronTimerStatus())
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       解析调度描述（辅助 API）                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.post('/describe', (req: Request, res: Response) => {
  const schedule = req.body as Schedule
  if (!schedule || !schedule.kind) {
    res.status(400).json({ error: '缺少 schedule 参数' })
    return
  }
  res.json({ description: describeSchedule(schedule) })
})

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         通知路由（原 notifications.ts）                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

const notifRouter = Router()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取通知列表                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
notifRouter.get('/', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50
  try {
    const notifications = listNotifications(limit)
    res.json({ notifications })
  } catch (error) {
    res.status(500).json({ error: '获取通知列表失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取未读通知数量                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
notifRouter.get('/unread-count', (_req: Request, res: Response) => {
  try {
    const count = getUnreadCount()
    res.json({ count })
  } catch (error) {
    res.status(500).json({ error: '获取未读数量失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       标记单个通知为已读                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
notifRouter.post('/:id/read', (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  if (isNaN(id)) {
    res.status(400).json({ error: '无效的通知 ID' })
    return
  }
  const success = markNotificationRead(id)
  res.json({ success })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       标记所有通知为已读                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
notifRouter.post('/read-all', (_req: Request, res: Response) => {
  try {
    const count = markAllNotificationsRead()
    res.json({ success: true, count })
  } catch (error) {
    res.status(500).json({ error: '标记已读失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       发送测试邮件                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
notifRouter.post('/test-email', async (_req: Request, res: Response) => {
  try {
    const result = await sendTestEmail()
    if (result.success) {
      res.json({ success: true, message: '测试邮件已发送，请检查收件箱' })
    } else {
      res.status(400).json({ success: false, error: result.error })
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : '发送失败'
    res.status(500).json({ success: false, error: msg })
  }
})

export default router
export { notifRouter as notificationsRouter }
