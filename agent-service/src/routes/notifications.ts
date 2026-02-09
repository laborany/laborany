/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         通知系统 API 路由                                 ║
 * ║                                                                          ║
 * ║  职责：处理所有通知相关的 HTTP 请求                                        ║
 * ║  包含：通知列表、未读数量、标记已读、测试邮件                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Router, Request, Response } from 'express'
import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  sendTestEmail,
} from '../cron/index.js'

const router = Router()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取通知列表                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.get('/', (req: Request, res: Response) => {
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
router.get('/unread-count', (_req: Request, res: Response) => {
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
router.post('/:id/read', (req: Request, res: Response) => {
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
router.post('/read-all', (_req: Request, res: Response) => {
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
router.post('/test-email', async (_req: Request, res: Response) => {
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
