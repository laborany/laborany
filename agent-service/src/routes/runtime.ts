import { Router } from 'express'
import type { Request, Response } from 'express'
import { refreshRuntimeConfig } from '../runtime-config.js'
import {
  isFeishuEnabled,
  isFeishuRunning,
  restartFeishuBot,
  startFeishuBot,
  stopFeishuBot,
} from '../feishu/index.js'
import {
  isQQEnabled,
  isQQRunning,
  restartQQBot,
  startQQBot,
  stopQQBot,
} from '../qq/index.js'
import { isWechatEnabled } from '../wechat/config.js'
import { isWechatRunning, restartWechatBot, startWechatBot, stopWechatBot } from '../wechat/index.js'
import { resetNotifierTransport } from '../cron/index.js'

interface ApplyConfigRequest {
  source?: string
  requestId?: string
  changedKeys?: string[]
  force?: boolean
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function hasChangedPrefix(changedKeys: string[], prefixes: string[]): boolean {
  return changedKeys.some(key => prefixes.some(prefix => key.startsWith(prefix)))
}

const FEISHU_PREFIXES = ['FEISHU_']
const QQ_PREFIXES = ['QQ_']
const WECHAT_PREFIXES = ['WECHAT_']
const NOTIFY_PREFIXES = ['SMTP_', 'NOTIFICATION_', 'NOTIFY_']

const router = Router()

router.post('/apply-config', async (req: Request, res: Response) => {
  const body = (req.body || {}) as ApplyConfigRequest
  const startedAt = Date.now()
  const changedKeys = Array.isArray(body.changedKeys)
    ? body.changedKeys.filter(item => typeof item === 'string' && item.trim().length > 0)
    : []
  const applyAll = body.force === true || !Array.isArray(body.changedKeys)

  const runtimeSnapshot = refreshRuntimeConfig()

  const feishuResult: {
    attempted: boolean
    changed: boolean
    before: 'running' | 'stopped'
    after: 'running' | 'stopped'
    error?: string
  } = {
    attempted: false,
    changed: false,
    before: isFeishuRunning() ? 'running' : 'stopped',
    after: isFeishuRunning() ? 'running' : 'stopped',
  }

  const emailResult: {
    attempted: boolean
    changed: boolean
    error?: string
  } = {
    attempted: false,
    changed: false,
  }
  const wechatResult: {
    attempted: boolean
    changed: boolean
    before: 'running' | 'stopped'
    after: 'running' | 'stopped'
    enabled: boolean
    note?: string
    error?: string
  } = {
    attempted: false,
    changed: false,
    before: isWechatRunning() ? 'running' : 'stopped',
    after: isWechatRunning() ? 'running' : 'stopped',
    enabled: isWechatEnabled(),
  }
  const qqResult: {
    attempted: boolean
    changed: boolean
    before: 'running' | 'stopped'
    after: 'running' | 'stopped'
    error?: string
  } = {
    attempted: false,
    changed: false,
    before: isQQRunning() ? 'running' : 'stopped',
    after: isQQRunning() ? 'running' : 'stopped',
  }

  const warnings: string[] = []

  const shouldApplyFeishu = applyAll || hasChangedPrefix(changedKeys, FEISHU_PREFIXES)
  if (shouldApplyFeishu) {
    feishuResult.attempted = true
    const beforeRunning = isFeishuRunning()
    try {
      if (isFeishuEnabled()) {
        if (beforeRunning) {
          await restartFeishuBot('runtime config apply')
          feishuResult.changed = true
        } else {
          await startFeishuBot()
          feishuResult.changed = isFeishuRunning()
        }
      } else if (beforeRunning) {
        stopFeishuBot()
        feishuResult.changed = true
      }
    } catch (error) {
      feishuResult.error = toErrorMessage(error)
    } finally {
      feishuResult.after = isFeishuRunning() ? 'running' : 'stopped'
    }
  }

  const shouldApplyQQ = applyAll || hasChangedPrefix(changedKeys, QQ_PREFIXES)
  if (shouldApplyQQ) {
    qqResult.attempted = true
    const beforeRunning = isQQRunning()
    try {
      if (isQQEnabled()) {
        if (beforeRunning) {
          await restartQQBot('runtime config apply')
          qqResult.changed = true
        } else {
          await startQQBot()
          qqResult.changed = isQQRunning()
        }
      } else if (beforeRunning) {
        stopQQBot()
        qqResult.changed = true
      }
    } catch (error) {
      qqResult.error = toErrorMessage(error)
    } finally {
      qqResult.after = isQQRunning() ? 'running' : 'stopped'
    }
  }

  const shouldApplyWechat = applyAll || hasChangedPrefix(changedKeys, WECHAT_PREFIXES)
  if (shouldApplyWechat) {
    wechatResult.attempted = true
    const beforeRunning = isWechatRunning()
    try {
      if (isWechatEnabled()) {
        if (beforeRunning) {
          await restartWechatBot('runtime config apply')
          wechatResult.changed = true
        } else {
          await startWechatBot()
          wechatResult.changed = isWechatRunning()
        }
      } else if (beforeRunning) {
        stopWechatBot()
        wechatResult.changed = true
      }
    } catch (error) {
      wechatResult.error = toErrorMessage(error)
    } finally {
      wechatResult.enabled = isWechatEnabled()
      wechatResult.after = isWechatRunning() ? 'running' : 'stopped'
      wechatResult.note = isWechatEnabled() ? undefined : 'WeChat config refreshed.'
    }
  }

  const shouldApplyNotify = applyAll || hasChangedPrefix(changedKeys, NOTIFY_PREFIXES)
  if (shouldApplyNotify) {
    emailResult.attempted = true
    try {
      resetNotifierTransport()
      emailResult.changed = true
    } catch (error) {
      emailResult.error = toErrorMessage(error)
    }
  }

  if (!shouldApplyFeishu && !shouldApplyQQ && !shouldApplyWechat && !shouldApplyNotify) {
    warnings.push('No runtime module matched changed keys; env values were refreshed only.')
  }

  const success = !feishuResult.error && !qqResult.error && !wechatResult.error && !emailResult.error
  const summary = success ? 'Runtime config applied' : 'Config saved but runtime apply had errors'

  res.json({
    success,
    summary,
    source: body.source || 'unknown',
    requestId: body.requestId || null,
    tookMs: Date.now() - startedAt,
    changedKeys,
    warnings,
    modules: {
      env: {
        reloaded: true,
        loadedFrom: runtimeSnapshot.loadedFrom,
      },
      feishu: feishuResult,
      qq: qqResult,
      wechat: wechatResult,
      email: emailResult,
    },
  })
})

export { router as runtimeRouter }
