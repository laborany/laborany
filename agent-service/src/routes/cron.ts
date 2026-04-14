/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    Cron 定时任务 & 通知 API 路由                         ║
 * ║                                                                          ║
 * ║  职责：处理定时任务 + 通知相关的 HTTP 请求                                ║
 * ║  包含：任务 CRUD、手动触发、执行历史、通知列表、已读标记                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Router, Request, Response } from 'express'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { loadCatalog } from '../catalog.js'
import {
  listJobs,
  listJobsBySourceOpenId,
  getJob,
  createJob,
  updateJob,
  deleteJob,
  getJobRuns,
  triggerJob,
  getCronTimerStatus,
  triggerPoll,
  validateCronExpr,
  describeSchedule,
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  sendTestEmail,
} from '../cron/index.js'
import { isCronStorageUnavailableError } from '../cron/db.js'
import { refreshRuntimeConfig } from '../runtime-config.js'
import { DATA_DIR } from '../paths.js'
import type {
  CreateJobRequest,
  UpdateJobRequest,
  Schedule,
  JobNotify,
  JobSource,
  JobSourceChannel,
} from '../cron/index.js'
import { isFeishuEnabled } from '../feishu/index.js'
import { isQQEnabled } from '../qq/index.js'
import { getWechatRuntimeStatus } from '../wechat/index.js'
import { loadFeishuConfig } from '../feishu/config.js'
import { loadQQConfig } from '../qq/config.js'

const router = Router()

function withDetail(fallback: string, error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return `${fallback}：${error.message}`
  }
  return fallback
}

function isSourceChannel(value: unknown): value is JobSourceChannel {
  return value === 'desktop' || value === 'feishu' || value === 'qq' || value === 'wechat'
}

function formatNextWakeAt(nextWakeAt: number | null): string {
  return nextWakeAt ? new Date(nextWakeAt).toLocaleString('zh-CN') : 'none'
}

function rearmCronTimer(reason: string): void {
  triggerPoll()
  const status = getCronTimerStatus()
  console.log(`[Cron] timer rearmed: reason=${reason}, nextWakeAt=${formatNextWakeAt(status.nextWakeAt)}`)
}

function validateSource(source: JobSource | undefined): string | null {
  if (!source) return null
  if (!isSourceChannel(source.channel)) return 'source.channel 必须是 desktop / feishu / qq / wechat'
  if (source.channel === 'feishu' && !source.feishuOpenId?.trim()) {
    return 'source.channel=feishu 时必须提供 source.feishuOpenId'
  }
  if (source.channel === 'qq' && !source.qqOpenId?.trim()) {
    return 'source.channel=qq 时必须提供 source.qqOpenId'
  }
  if (source.channel === 'wechat' && !source.wechatUserId?.trim()) {
    return 'source.channel=wechat 时必须提供 source.wechatUserId'
  }
  return null
}

function validateNotify(notify: JobNotify | undefined): string | null {
  if (!notify) return null
  if (notify.channel !== 'app' && notify.channel !== 'email' && notify.channel !== 'feishu_dm' && notify.channel !== 'qq_dm' && notify.channel !== 'wechat_dm') {
    return 'notify.channel 必须是 app / email / feishu_dm / qq_dm / wechat_dm'
  }
  if (notify.channel === 'email') return null
  if (notify.channel === 'feishu_dm' && !notify.feishuOpenId?.trim()) {
    return 'notify.channel=feishu_dm 时必须提供 notify.feishuOpenId'
  }
  if (notify.channel === 'qq_dm' && !notify.qqOpenId?.trim()) {
    return 'notify.channel=qq_dm 时必须提供 notify.qqOpenId'
  }
  if (notify.channel === 'wechat_dm' && !notify.wechatUserId?.trim()) {
    return 'notify.channel=wechat_dm 时必须提供 notify.wechatUserId'
  }
  return null
}

function getEmailDeliveryAvailability() {
  const email = (process.env.NOTIFICATION_EMAIL || '').trim()
  const host = (process.env.SMTP_HOST || '').trim()
  const user = (process.env.SMTP_USER || '').trim()
  const pass = (process.env.SMTP_PASS || '').trim()

  if (!email) {
    return { enabled: false, reason: '未配置通知邮箱 (NOTIFICATION_EMAIL)' }
  }
  if (!host || !user || !pass) {
    return { enabled: false, reason: '未完整配置 SMTP_HOST / SMTP_USER / SMTP_PASS' }
  }
  return {
    enabled: true,
    resolvedRecipientLabel: email,
  }
}

function loadSingleRemoteRecipient(stateFilePath: string): string | null {
  try {
    if (!existsSync(stateFilePath)) return null
    const raw = readFileSync(stateFilePath, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const keys = Object.keys(parsed || {}).map(key => key.trim()).filter(Boolean)
    if (keys.length !== 1) return null
    return keys[0]
  } catch {
    return null
  }
}

function getDesktopFeishuDeliveryAvailability() {
  if (!isFeishuEnabled()) {
    return { enabled: false, reason: '未启用飞书 Bot' }
  }
  const recentRecipient = loadSingleRemoteRecipient(join(DATA_DIR, 'feishu', 'user-states.json'))
  if (recentRecipient) {
    return {
      enabled: true,
      resolvedRecipientLabel: recentRecipient,
      resolvedRecipientId: recentRecipient,
    }
  }
  return { enabled: false, reason: '请先用当前飞书账号与机器人对话一次，以建立送达对象' }
}

function getDesktopQqDeliveryAvailability() {
  if (!isQQEnabled()) {
    return { enabled: false, reason: '未启用 QQ Bot' }
  }
  const recentRecipient = loadSingleRemoteRecipient(join(DATA_DIR, 'qq', 'user-states.json'))
  if (recentRecipient) {
    return {
      enabled: true,
      resolvedRecipientLabel: recentRecipient,
      resolvedRecipientId: recentRecipient,
    }
  }
  const config = loadQQConfig()
  const allowUsers = config?.allowUsers || []
  if (allowUsers.length === 1) {
    return {
      enabled: true,
      resolvedRecipientLabel: `${allowUsers[0]}（白名单）`,
      resolvedRecipientId: allowUsers[0],
    }
  }
  if (allowUsers.length > 1) {
    return { enabled: false, reason: '检测到多个 QQ 白名单账号，请先让目标账号与机器人私聊一次以自动识别' }
  }
  return { enabled: false, reason: '请先用当前 QQ 账号与机器人私聊一次，以建立送达对象' }
}

function getDesktopWechatDeliveryAvailability() {
  const runtime = getWechatRuntimeStatus()
  if (!runtime.enabled) {
    return { enabled: false, reason: '未启用微信 Bot' }
  }
  if (!runtime.loggedIn || !runtime.account) {
    return { enabled: false, reason: '未绑定微信账号' }
  }
  if (!runtime.account.userId?.trim()) {
    return { enabled: false, reason: '当前微信账号缺少 userId，无法作为送达对象' }
  }
  return {
    enabled: true,
    resolvedRecipientLabel: runtime.account.rawAccountId,
    resolvedRecipientId: runtime.account.userId.trim(),
  }
}

function validateTarget(target: CreateJobRequest['target'] | UpdateJobRequest['target'] | undefined): string | null {
  if (!target) return null
  if (target.type !== 'skill') return 'target.type 当前仅支持 skill'
  const exists = loadCatalog().some(item => item.type === 'skill' && item.id === target.id)
  if (!exists) return `未找到目标技能: ${target.id}`
  return null
}

function validateScheduleInput(schedule: Schedule | undefined): string | null {
  if (!schedule) return null

  if (schedule.kind === 'cron') {
    const error = validateCronExpr(schedule.expr)
    return error ? `无效的 Cron 表达式: ${error}` : null
  }

  if (schedule.kind === 'at') {
    if (!Number.isFinite(schedule.atMs)) {
      return 'schedule.atMs 必须是有效的毫秒时间戳'
    }
    if (schedule.atMs <= Date.now()) {
      return '一次性任务的执行时间必须晚于当前时间'
    }
    return null
  }

  if (!Number.isFinite(schedule.everyMs) || schedule.everyMs <= 0) {
    return 'schedule.everyMs 必须是大于 0 的毫秒间隔'
  }

  return null
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取定时任务列表                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.get('/jobs', (req: Request, res: Response) => {
  try {
    const sourceOpenId = typeof req.query.sourceOpenId === 'string' ? req.query.sourceOpenId.trim() : ''
    const sourceWechatUserId = typeof req.query.sourceWechatUserId === 'string' ? req.query.sourceWechatUserId.trim() : ''
    const sourceChannel = typeof req.query.sourceChannel === 'string' ? req.query.sourceChannel.trim() : ''
    const sourceIdentity = sourceWechatUserId || sourceOpenId

    let jobs = sourceIdentity ? listJobsBySourceOpenId(sourceIdentity, sourceChannel || undefined) : listJobs()
    if (sourceChannel) {
      if (!isSourceChannel(sourceChannel)) {
        res.status(400).json({ error: 'sourceChannel 必须是 desktop / feishu / qq / wechat' })
        return
      }
      jobs = jobs.filter(job => job.sourceChannel === sourceChannel)
    }
    res.json({ jobs })
  } catch (error) {
    if (isCronStorageUnavailableError(error)) {
      res.json({ jobs: [], degraded: true })
      return
    }
    res.status(500).json({ error: withDetail('获取任务列表失败', error) })
  }
})

router.get('/delivery-status', (_req: Request, res: Response) => {
  refreshRuntimeConfig()
  res.json({
    channels: {
      app: {
        enabled: true,
        resolvedRecipientLabel: '应用内通知',
      },
      email: getEmailDeliveryAvailability(),
      feishu_dm: getDesktopFeishuDeliveryAvailability(),
      qq_dm: getDesktopQqDeliveryAvailability(),
      wechat_dm: getDesktopWechatDeliveryAvailability(),
    },
  })
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
  const { name, description, schedule, target, enabled, modelProfileId, source, notify } = req.body as CreateJobRequest

  if (!name || !schedule || !target) {
    res.status(400).json({ error: '缺少必要参数: name, schedule, target' })
    return
  }

  const scheduleError = validateScheduleInput(schedule)
  if (scheduleError) {
    res.status(400).json({ error: scheduleError })
    return
  }

  const sourceError = validateSource(source)
  if (sourceError) {
    res.status(400).json({ error: sourceError })
    return
  }

  const notifyError = validateNotify(notify)
  if (notifyError) {
    res.status(400).json({ error: notifyError })
    return
  }

  const targetError = validateTarget(target)
  if (targetError) {
    res.status(400).json({ error: targetError })
    return
  }

  try {
    const job = createJob({ name, description, schedule, target, enabled, modelProfileId, source, notify })
    rearmCronTimer(`create:${job.id}`)
    res.json(job)
  } catch (error) {
    res.status(500).json({ error: withDetail('创建任务失败', error) })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       更新定时任务                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.patch('/jobs/:id', (req: Request, res: Response) => {
  const { id } = req.params
  const updates = req.body as UpdateJobRequest

  const scheduleError = validateScheduleInput(updates.schedule)
  if (scheduleError) {
    res.status(400).json({ error: scheduleError })
    return
  }

  const notifyError = validateNotify(updates.notify)
  if (notifyError) {
    res.status(400).json({ error: notifyError })
    return
  }

  const targetError = validateTarget(updates.target)
  if (targetError) {
    res.status(400).json({ error: targetError })
    return
  }

  try {
    const job = updateJob(id, updates)
    if (!job) {
      res.status(404).json({ error: '任务不存在' })
      return
    }
    rearmCronTimer(`update:${job.id}`)
    res.json(job)
  } catch (error) {
    res.status(500).json({ error: withDetail('更新任务失败', error) })
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
  rearmCronTimer(`delete:${id}`)
  res.json({ success: true })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       手动触发定时任务                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.post('/jobs/:id/run', async (req: Request, res: Response) => {
  const { id } = req.params
  const result = await triggerJob(id)
  if (!result.success) {
    const statusCode = result.errorCode === 'NOT_FOUND'
      ? 404
      : result.errorCode === 'ALREADY_RUNNING'
        ? 409
        : 500
    res.status(statusCode).json({ error: result.error, errorCode: result.errorCode, sessionId: result.sessionId })
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
  try {
    res.json(getCronTimerStatus())
  } catch (error) {
    if (isCronStorageUnavailableError(error)) {
      res.json({ running: false, nextWakeAt: null, degraded: true })
      return
    }
    res.status(500).json({ error: withDetail('获取定时器状态失败', error) })
  }
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
    if (isCronStorageUnavailableError(error)) {
      res.json({ notifications: [], degraded: true })
      return
    }
    console.error('[Notifications] list failed:', error)
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
    if (isCronStorageUnavailableError(error)) {
      res.json({ count: 0, degraded: true })
      return
    }
    console.error('[Notifications] unread-count failed:', error)
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
  try {
    const success = markNotificationRead(id)
    res.json({ success })
  } catch (error) {
    if (isCronStorageUnavailableError(error)) {
      res.json({ success: false, degraded: true })
      return
    }
    res.status(500).json({ error: '标记已读失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       标记所有通知为已读                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
notifRouter.post('/read-all', (_req: Request, res: Response) => {
  try {
    const count = markAllNotificationsRead()
    res.json({ success: true, count })
  } catch (error) {
    if (isCronStorageUnavailableError(error)) {
      res.json({ success: true, count: 0, degraded: true })
      return
    }
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
