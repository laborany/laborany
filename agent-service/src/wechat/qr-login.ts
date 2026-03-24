import { randomUUID } from 'crypto'
import QRCode from 'qrcode'
import {
  getWechatEffectiveBaseUrl,
  getWechatEffectiveCdnBaseUrl,
  isWechatEnabled,
  normalizeWechatAccountId,
  saveWechatAccount,
  setActiveWechatAccount,
} from './config.js'

const DEFAULT_ILINK_BOT_TYPE = '3'
const ACTIVE_LOGIN_TTL_MS = 8 * 60 * 1000
const QR_LONG_POLL_TIMEOUT_MS = 35_000
const MAX_QR_REFRESH_COUNT = 3

interface QRCodeResponse {
  qrcode?: string
  qrcode_img_content?: string
}

interface StatusResponse {
  status?: string
  bot_token?: string
  ilink_bot_id?: string
  ilink_user_id?: string
  baseurl?: string
}

type WechatLoginStatusValue =
  | 'ready'
  | 'wait'
  | 'scaned'
  | 'confirmed'
  | 'expired'
  | 'cancelled'
  | 'failed'

interface WechatPublicAccount {
  accountId: string
  rawAccountId: string
  userId?: string
  savedAt: string
}

interface WechatLoginState {
  success: boolean
  sessionKey: string
  status: WechatLoginStatusValue
  message: string
  qrcodeDataUrl?: string
  account?: WechatPublicAccount
}

interface ActiveLogin {
  sessionKey: string
  qrcode: string
  qrcodeContent: string
  qrcodeDataUrl: string
  startedAt: number
  refreshCount: number
  result?: WechatLoginState
}

const activeLogins = new Map<string, ActiveLogin>()

function isLoginFresh(login: ActiveLogin): boolean {
  return Date.now() - login.startedAt < ACTIVE_LOGIN_TTL_MS
}

function purgeExpiredLogins(): void {
  for (const [key, value] of activeLogins.entries()) {
    if (!value.result && !isLoginFresh(value)) {
      activeLogins.delete(key)
    }
  }
}

function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}${raw ? `: ${raw.slice(0, 200)}` : ''}`)
  }
  return raw ? JSON.parse(raw) as T : {} as T
}

async function buildQrDataUrl(content: string): Promise<string> {
  return QRCode.toDataURL(content, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
  })
}

async function fetchQRCode(apiBaseUrl: string, botType: string): Promise<QRCodeResponse> {
  const base = apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`
  const url = new URL(`ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(botType)}`, base)
  return fetchJson<QRCodeResponse>(url.toString())
}

async function pollQRStatus(apiBaseUrl: string, qrcode: string): Promise<StatusResponse> {
  const base = apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`
  const url = new URL(`ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`, base)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), QR_LONG_POLL_TIMEOUT_MS)
  try {
    return await fetchJson<StatusResponse>(url.toString(), {
      headers: {
        'iLink-App-ClientVersion': '1',
      },
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { status: 'wait' }
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function buildPublicAccount(account: {
  accountId: string
  rawAccountId: string
  userId?: string
  savedAt: string
}): WechatPublicAccount {
  return {
    accountId: account.accountId,
    rawAccountId: account.rawAccountId,
    userId: account.userId,
    savedAt: account.savedAt,
  }
}

async function refreshQRCode(login: ActiveLogin, apiBaseUrl: string, botType: string): Promise<void> {
  const qrResponse = await fetchQRCode(apiBaseUrl, botType)
  const qrcode = trimOptionalString(qrResponse.qrcode)
  const qrcodeContent = trimOptionalString(qrResponse.qrcode_img_content)
  if (!qrcode || !qrcodeContent) {
    throw new Error('微信二维码响应缺少必要字段')
  }

  login.qrcode = qrcode
  login.qrcodeContent = qrcodeContent
  login.qrcodeDataUrl = await buildQrDataUrl(qrcodeContent)
  login.startedAt = Date.now()
}

export function hasActiveWechatLoginSession(): boolean {
  purgeExpiredLogins()
  for (const value of activeLogins.values()) {
    if (!value.result && isLoginFresh(value)) return true
  }
  return false
}

export async function startWechatLogin(): Promise<WechatLoginState> {
  purgeExpiredLogins()

  for (const value of activeLogins.values()) {
    if (!value.result && isLoginFresh(value)) {
      return {
        success: true,
        sessionKey: value.sessionKey,
        status: 'ready',
        message: '二维码已生成，请使用微信扫描。',
        qrcodeDataUrl: value.qrcodeDataUrl,
      }
    }
  }

  const apiBaseUrl = getWechatEffectiveBaseUrl()
  const qrResponse = await fetchQRCode(apiBaseUrl, DEFAULT_ILINK_BOT_TYPE)
  const qrcode = trimOptionalString(qrResponse.qrcode)
  const qrcodeContent = trimOptionalString(qrResponse.qrcode_img_content)
  if (!qrcode || !qrcodeContent) {
    throw new Error('微信二维码响应缺少 qrcode 或 qrcode_img_content')
  }

  const sessionKey = randomUUID()
  const login: ActiveLogin = {
    sessionKey,
    qrcode,
    qrcodeContent,
    qrcodeDataUrl: await buildQrDataUrl(qrcodeContent),
    startedAt: Date.now(),
    refreshCount: 1,
  }
  activeLogins.set(sessionKey, login)

  return {
    success: true,
    sessionKey,
    status: 'ready',
    message: '请使用微信扫描二维码完成绑定。',
    qrcodeDataUrl: login.qrcodeDataUrl,
  }
}

export async function getWechatLoginStatus(sessionKey: string): Promise<WechatLoginState> {
  purgeExpiredLogins()

  const login = activeLogins.get(sessionKey)
  if (!login) {
    return {
      success: false,
      sessionKey,
      status: 'failed',
      message: '登录会话不存在或已过期，请重新发起扫码绑定。',
    }
  }

  if (login.result) {
    return login.result
  }

  if (!isLoginFresh(login)) {
    activeLogins.delete(sessionKey)
    return {
      success: false,
      sessionKey,
      status: 'expired',
      message: '二维码已过期，请重新发起扫码绑定。',
    }
  }

  const apiBaseUrl = getWechatEffectiveBaseUrl()
  const statusResponse = await pollQRStatus(apiBaseUrl, login.qrcode)
  const currentStatus = trimOptionalString(statusResponse.status) || 'wait'

  if (currentStatus === 'wait') {
    return {
      success: true,
      sessionKey,
      status: 'wait',
      message: '等待扫码中...',
      qrcodeDataUrl: login.qrcodeDataUrl,
    }
  }

  if (currentStatus === 'scaned') {
    return {
      success: true,
      sessionKey,
      status: 'scaned',
      message: '已扫码，请在微信中确认登录。',
      qrcodeDataUrl: login.qrcodeDataUrl,
    }
  }

  if (currentStatus === 'expired') {
    if (login.refreshCount >= MAX_QR_REFRESH_COUNT) {
      const result: WechatLoginState = {
        success: false,
        sessionKey,
        status: 'failed',
        message: '二维码多次过期，请重新发起扫码绑定。',
      }
      login.result = result
      return result
    }

    login.refreshCount += 1
    await refreshQRCode(login, apiBaseUrl, DEFAULT_ILINK_BOT_TYPE)
    return {
      success: true,
      sessionKey,
      status: 'expired',
      message: '二维码已过期，已自动刷新，请重新扫描。',
      qrcodeDataUrl: login.qrcodeDataUrl,
    }
  }

  if (currentStatus === 'confirmed') {
    const rawAccountId = trimOptionalString(statusResponse.ilink_bot_id)
    const token = trimOptionalString(statusResponse.bot_token)
    if (!rawAccountId || !token) {
      const result: WechatLoginState = {
        success: false,
        sessionKey,
        status: 'failed',
        message: '扫码已确认，但微信未返回完整凭据，请重新尝试。',
      }
      login.result = result
      return result
    }

    const savedAccount = saveWechatAccount({
      accountId: normalizeWechatAccountId(rawAccountId),
      rawAccountId,
      userId: trimOptionalString(statusResponse.ilink_user_id),
      token,
      baseUrl: trimOptionalString(statusResponse.baseurl) || apiBaseUrl,
      cdnBaseUrl: getWechatEffectiveCdnBaseUrl(),
      savedAt: new Date().toISOString(),
    })
    setActiveWechatAccount(savedAccount.accountId)

    const result: WechatLoginState = {
      success: true,
      sessionKey,
      status: 'confirmed',
      message: '微信绑定成功。',
      account: buildPublicAccount(savedAccount),
    }
    login.result = result

    if (isWechatEnabled()) {
      void import('./index.js')
        .then(({ restartWechatBot }) => restartWechatBot('wechat login confirmed'))
        .catch((error) => {
          console.warn('[WeChat] failed to auto-restart after login:', error)
        })
    }

    return result
  }

  const result: WechatLoginState = {
    success: false,
    sessionKey,
    status: 'failed',
    message: `未知的微信登录状态：${currentStatus}`,
  }
  login.result = result
  return result
}

export function cancelWechatLogin(sessionKey: string): WechatLoginState {
  const login = activeLogins.get(sessionKey)
  if (!login) {
    return {
      success: false,
      sessionKey,
      status: 'failed',
      message: '登录会话不存在，无法取消。',
    }
  }

  const result: WechatLoginState = {
    success: true,
    sessionKey,
    status: 'cancelled',
    message: '已取消微信扫码绑定。',
  }
  login.result = result
  return result
}
