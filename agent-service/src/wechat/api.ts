import { randomBytes, randomUUID } from 'crypto'

const WECHAT_CHANNEL_VERSION = '0.4.5'
const DEFAULT_LONG_POLL_TIMEOUT_MS = 35_000
const DEFAULT_API_TIMEOUT_MS = 15_000

export const WECHAT_MESSAGE_TYPE_BOT = 2
export const WECHAT_MESSAGE_STATE_FINISH = 2
export const WECHAT_MESSAGE_ITEM_TYPE_TEXT = 1
export const WECHAT_MESSAGE_ITEM_TYPE_IMAGE = 2
export const WECHAT_MESSAGE_ITEM_TYPE_VOICE = 3
export const WECHAT_MESSAGE_ITEM_TYPE_FILE = 4
export const WECHAT_MESSAGE_ITEM_TYPE_VIDEO = 5

export const WECHAT_UPLOAD_MEDIA_TYPE_IMAGE = 1
export const WECHAT_UPLOAD_MEDIA_TYPE_VIDEO = 2
export const WECHAT_UPLOAD_MEDIA_TYPE_FILE = 3

export interface WechatMessageTextItem {
  text?: string
}

export interface WechatCdnMedia {
  encrypt_query_param?: string
  aes_key?: string
  encrypt_type?: number
}

export interface WechatMessageImageItem {
  media?: WechatCdnMedia
  thumb_media?: WechatCdnMedia
  aeskey?: string
  url?: string
  mid_size?: number
  thumb_size?: number
  thumb_height?: number
  thumb_width?: number
  hd_size?: number
}

export interface WechatMessageFileItem {
  media?: WechatCdnMedia
  file_name?: string
  md5?: string
  len?: string
}

export interface WechatMessageVoiceItem {
  media?: WechatCdnMedia
  text?: string
}

export interface WechatMessageVideoItem {
  media?: WechatCdnMedia
  video_size?: number
}

export interface WechatRefMessage {
  message_item?: WechatMessageItem
  title?: string
}

export interface WechatMessageItem {
  type?: number
  ref_msg?: WechatRefMessage
  text_item?: WechatMessageTextItem
  image_item?: WechatMessageImageItem
  file_item?: WechatMessageFileItem
  voice_item?: WechatMessageVoiceItem
  video_item?: WechatMessageVideoItem
}

export interface WechatInboundMessage {
  seq?: number
  message_id?: number
  from_user_id?: string
  to_user_id?: string
  session_id?: string
  context_token?: string
  item_list?: WechatMessageItem[]
}

export interface WechatGetUpdatesResponse {
  ret?: number
  errcode?: number
  errmsg?: string
  msgs?: WechatInboundMessage[]
  get_updates_buf?: string
  longpolling_timeout_ms?: number
}

export interface WechatSendTextMessageParams {
  baseUrl: string
  token: string
  toUserId: string
  contextToken: string
  text: string
  timeoutMs?: number
}

export interface WechatSendMessageParams {
  baseUrl: string
  token: string
  toUserId: string
  contextToken: string
  itemList: WechatMessageItem[]
  timeoutMs?: number
}

export interface WechatGetUploadUrlParams {
  baseUrl: string
  token: string
  filekey: string
  mediaType: number
  toUserId: string
  rawSize: number
  rawFileMd5: string
  fileSize: number
  thumbRawSize?: number
  thumbRawFileMd5?: string
  thumbFileSize?: number
  noNeedThumb?: boolean
  aesKeyHex: string
  timeoutMs?: number
}

export interface WechatGetUploadUrlResponse {
  upload_param?: string
  thumb_upload_param?: string
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

function buildBaseInfo(): { channel_version: string } {
  return { channel_version: WECHAT_CHANNEL_VERSION }
}

function randomWechatUin(): string {
  const uint32 = randomBytes(4).readUInt32BE(0)
  return Buffer.from(String(uint32), 'utf-8').toString('base64')
}

function buildHeaders(token: string, body: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    Authorization: `Bearer ${token.trim()}`,
    'Content-Length': String(Buffer.byteLength(body, 'utf-8')),
    'X-WECHAT-UIN': randomWechatUin(),
  }
}

async function postJson<T>(params: {
  baseUrl: string
  endpoint: string
  token: string
  body: unknown
  timeoutMs: number
  signal?: AbortSignal
  treatTimeoutAsEmpty?: boolean
  emptyValue?: T
}): Promise<T> {
  const body = JSON.stringify(params.body)
  const url = new URL(params.endpoint, ensureTrailingSlash(params.baseUrl))
  const controller = new AbortController()
  let timedOut = false

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, params.timeoutMs)

  const abortParent = () => controller.abort()
  params.signal?.addEventListener('abort', abortParent, { once: true })

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: buildHeaders(params.token, body),
      body,
      signal: controller.signal,
    })
    const raw = await response.text()

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}${raw ? `: ${raw.slice(0, 200)}` : ''}`)
    }

    return raw ? JSON.parse(raw) as T : {} as T
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError' && timedOut && params.treatTimeoutAsEmpty) {
      return params.emptyValue as T
    }
    throw error
  } finally {
    clearTimeout(timer)
    params.signal?.removeEventListener('abort', abortParent)
  }
}

export async function getWechatUpdates(params: {
  baseUrl: string
  token: string
  getUpdatesBuf?: string
  timeoutMs?: number
  signal?: AbortSignal
}): Promise<WechatGetUpdatesResponse> {
  return postJson<WechatGetUpdatesResponse>({
    baseUrl: params.baseUrl,
    endpoint: 'ilink/bot/getupdates',
    token: params.token,
    timeoutMs: params.timeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS,
    signal: params.signal,
    treatTimeoutAsEmpty: true,
    emptyValue: {
      ret: 0,
      msgs: [],
      get_updates_buf: params.getUpdatesBuf || '',
    },
    body: {
      get_updates_buf: params.getUpdatesBuf || '',
      base_info: buildBaseInfo(),
    },
  })
}

export async function getWechatUploadUrl(
  params: WechatGetUploadUrlParams,
): Promise<WechatGetUploadUrlResponse> {
  return postJson<WechatGetUploadUrlResponse>({
    baseUrl: params.baseUrl,
    endpoint: 'ilink/bot/getuploadurl',
    token: params.token,
    timeoutMs: params.timeoutMs ?? DEFAULT_API_TIMEOUT_MS,
    body: {
      filekey: params.filekey,
      media_type: params.mediaType,
      to_user_id: params.toUserId,
      rawsize: params.rawSize,
      rawfilemd5: params.rawFileMd5,
      filesize: params.fileSize,
      thumb_rawsize: params.thumbRawSize,
      thumb_rawfilemd5: params.thumbRawFileMd5,
      thumb_filesize: params.thumbFileSize,
      no_need_thumb: params.noNeedThumb,
      aeskey: params.aesKeyHex,
      base_info: buildBaseInfo(),
    },
  })
}

export async function sendWechatMessage(params: WechatSendMessageParams): Promise<{ clientId: string }> {
  const clientId = `laborany-wechat-${randomUUID()}`

  await postJson<Record<string, never>>({
    baseUrl: params.baseUrl,
    endpoint: 'ilink/bot/sendmessage',
    token: params.token,
    timeoutMs: params.timeoutMs ?? DEFAULT_API_TIMEOUT_MS,
    body: {
      msg: {
        from_user_id: '',
        to_user_id: params.toUserId,
        client_id: clientId,
        message_type: WECHAT_MESSAGE_TYPE_BOT,
        message_state: WECHAT_MESSAGE_STATE_FINISH,
        context_token: params.contextToken,
        item_list: params.itemList,
      },
      base_info: buildBaseInfo(),
    },
  })

  return { clientId }
}

export async function sendWechatTextMessage(params: WechatSendTextMessageParams): Promise<{ clientId: string }> {
  return sendWechatMessage({
    baseUrl: params.baseUrl,
    token: params.token,
    toUserId: params.toUserId,
    contextToken: params.contextToken,
    timeoutMs: params.timeoutMs,
    itemList: [
      {
        type: WECHAT_MESSAGE_ITEM_TYPE_TEXT,
        text_item: { text: params.text },
      },
    ],
  })
}
