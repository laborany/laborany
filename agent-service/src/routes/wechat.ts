import { Router } from 'express'
import type { Request, Response } from 'express'
import {
  getWechatEffectiveBaseUrl,
  getWechatEffectiveCdnBaseUrl,
  isWechatEnabled,
  listWechatAccounts,
} from '../wechat/config.js'
import {
  getWechatRuntimeStatus,
  isWechatRunning,
  logoutWechatAccount,
  restartWechatBot,
  startWechatBot,
  stopWechatBot,
  testWechatConfig,
} from '../wechat/index.js'
import { cancelWechatLogin, getWechatLoginStatus, startWechatLogin } from '../wechat/qr-login.js'

const router = Router()

router.get('/status', (_req: Request, res: Response) => {
  const runtime = getWechatRuntimeStatus()
  res.json({
    ...runtime,
    config: {
      enabled: isWechatEnabled(),
      baseUrl: getWechatEffectiveBaseUrl(),
      cdnBaseUrl: getWechatEffectiveCdnBaseUrl(),
      storedAccountsCount: listWechatAccounts().length,
    },
  })
})

router.post('/test', async (_req: Request, res: Response) => {
  try {
    const result = await testWechatConfig()
    res.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.json({ success: false, message })
  }
})

router.post('/start', async (_req: Request, res: Response) => {
  try {
    if (!isWechatEnabled()) {
      res.status(400).json({ success: false, message: '微信未启用或缺少配置。' })
      return
    }

    if (isWechatRunning()) {
      res.json({ success: true, message: '微信 Bot 已在运行中。' })
      return
    }

    await startWechatBot()
    res.json({ success: true, message: '微信 Bot 已启动。' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ success: false, message })
  }
})

router.post('/stop', (_req: Request, res: Response) => {
  try {
    if (!isWechatRunning()) {
      res.json({ success: true, message: '微信 Bot 当前未运行。' })
      return
    }

    stopWechatBot()
    res.json({ success: true, message: '微信 Bot 已停止。' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ success: false, message })
  }
})

router.post('/restart', async (_req: Request, res: Response) => {
  try {
    if (!isWechatEnabled()) {
      res.status(400).json({ success: false, message: '微信未启用或缺少配置。' })
      return
    }

    await restartWechatBot('manual restart via API')
    res.json({ success: true, message: '微信 Bot 已重启。' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ success: false, message })
  }
})

router.post('/login/start', async (_req: Request, res: Response) => {
  try {
    const result = await startWechatLogin()
    res.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({
      success: false,
      status: 'failed',
      message,
    })
  }
})

router.get('/login/status', async (req: Request, res: Response) => {
  const sessionKey = typeof req.query.sessionKey === 'string' ? req.query.sessionKey.trim() : ''
  if (!sessionKey) {
    res.status(400).json({
      success: false,
      status: 'failed',
      message: '缺少 sessionKey',
    })
    return
  }

  try {
    const result = await getWechatLoginStatus(sessionKey)
    res.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({
      success: false,
      sessionKey,
      status: 'failed',
      message,
    })
  }
})

router.post('/login/cancel', (req: Request, res: Response) => {
  const sessionKey = typeof req.body?.sessionKey === 'string' ? req.body.sessionKey.trim() : ''
  if (!sessionKey) {
    res.status(400).json({
      success: false,
      status: 'failed',
      message: '缺少 sessionKey',
    })
    return
  }

  res.json(cancelWechatLogin(sessionKey))
})

router.post('/logout', (_req: Request, res: Response) => {
  res.json(logoutWechatAccount())
})

export { router as wechatRouter }
