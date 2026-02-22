/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     飞书管理路由                                         ║
 * ║                                                                        ║
 * ║  职责：提供 Bot 状态查询、手动启停接口                                  ║
 * ║  挂载：/feishu                                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Router } from 'express'
import type { Request, Response } from 'express'
import { isFeishuEnabled, isFeishuRunning, startFeishuBot, stopFeishuBot } from '../feishu/index.js'

const router = Router()

router.get('/status', (_req: Request, res: Response) => {
  res.json({ enabled: isFeishuEnabled(), running: isFeishuRunning() })
})

router.post('/start', async (_req: Request, res: Response) => {
  try {
    await startFeishuBot()
    res.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ ok: false, error: msg })
  }
})

router.post('/stop', (_req: Request, res: Response) => {
  stopFeishuBot()
  res.json({ ok: true })
})

router.post('/test', async (_req: Request, res: Response) => {
  try {
    if (!isFeishuEnabled()) {
      res.json({ success: false, error: '飞书未启用，请先配置 FEISHU_ENABLED=true、FEISHU_APP_ID 和 FEISHU_APP_SECRET' })
      return
    }

    if (!isFeishuRunning()) {
      await startFeishuBot()
    }

    res.json({ success: true, message: '飞书 Bot 连接成功！WebSocket 已建立。' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.json({ success: false, error: `连接失败: ${msg}` })
  }
})

export { router as feishuRouter }
