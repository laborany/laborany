/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Cron 定时任务 API 路由                            ║
 * ║                                                                          ║
 * ║  职责：处理所有定时任务相关的 HTTP 请求                                    ║
 * ║  包含：任务 CRUD、手动触发、执行历史、状态查询                              ║
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

export default router
