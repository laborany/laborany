/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     QQ Bot 管理路由                                      ║
 * ║                                                                        ║
 * ║  职责：提供 QQ Bot 的启动、停止、状态查询等管理接口                      ║
 * ║  设计：参考飞书 Bot 管理路由                                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Router } from 'express'
import { isQQEnabled, isQQRunning, startQQBot, stopQQBot, restartQQBot } from '../qq/index.js'
import { loadQQConfig } from '../qq/config.js'

const router = Router()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     GET /qq/status - 查看状态                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */

router.get('/status', (_req, res) => {
  const enabled = isQQEnabled()
  const running = isQQRunning()
  const config = loadQQConfig()

  res.json({
    enabled,
    running,
    config: config
      ? {
        appId: config.appId,
        sandbox: config.sandbox,
        botName: config.botName,
        defaultSkillId: config.defaultSkillId,
        allowUsersCount: config.allowUsers.length,
        requireAllowlist: config.requireAllowlist,
      }
      : null,
  })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     POST /qq/start - 启动 Bot                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */

router.post('/start', async (_req, res) => {
  try {
    if (!isQQEnabled()) {
      return res.status(400).json({ error: 'QQ Bot is not enabled or missing config' })
    }

    if (isQQRunning()) {
      return res.json({ message: 'QQ Bot is already running' })
    }

    await startQQBot()
    res.json({ message: 'QQ Bot started successfully' })
  } catch (error) {
    console.error('[QQ] Failed to start bot:', error)
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to start QQ Bot' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     POST /qq/stop - 停止 Bot                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */

router.post('/stop', (_req, res) => {
  try {
    if (!isQQRunning()) {
      return res.json({ message: 'QQ Bot is not running' })
    }

    stopQQBot()
    res.json({ message: 'QQ Bot stopped successfully' })
  } catch (error) {
    console.error('[QQ] Failed to stop bot:', error)
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to stop QQ Bot' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     POST /qq/restart - 重启 Bot                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */

router.post('/restart', async (_req, res) => {
  try {
    if (!isQQEnabled()) {
      return res.status(400).json({ error: 'QQ Bot is not enabled or missing config' })
    }

    await restartQQBot('manual restart via API')
    res.json({ message: 'QQ Bot restarted successfully' })
  } catch (error) {
    console.error('[QQ] Failed to restart bot:', error)
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to restart QQ Bot' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     POST /qq/test - 测试消息发送                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */

router.post('/test', async (req, res) => {
  try {
    if (!isQQEnabled()) {
      return res.json({ success: false, error: 'QQ Bot 未启用或配置缺失' })
    }

    if (!isQQRunning()) {
      // 尝试启动 Bot
      try {
        await startQQBot()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return res.json({ success: false, error: `无法启动 QQ Bot: ${msg}` })
      }
    }

    // 如果有提供 targetId 和 targetType，则发送测试消息
    const { targetId, targetType, message } = req.body

    if (targetId && targetType && message) {
      if (targetType !== 'c2c') {
        return res.json({ success: false, error: 'Invalid targetType. Must be: c2c' })
      }

      const { sendTextToTarget } = await import('../qq/push.js')
      const success = await sendTextToTarget(targetId, 'c2c', message)

      if (success) {
        res.json({ success: true, message: '测试消息发送成功' })
      } else {
        res.json({ success: false, error: '测试消息发送失败' })
      }
    } else {
      // 仅测试连接状态
      res.json({ success: true, message: 'QQ Bot 已启动并运行中' })
    }
  } catch (error) {
    console.error('[QQ] Failed to test:', error)
    res.json({ success: false, error: error instanceof Error ? error.message : 'QQ Bot 测试失败' })
  }
})

export default router
