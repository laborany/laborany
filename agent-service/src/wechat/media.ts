import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'crypto'
import { existsSync, readFileSync, statSync } from 'fs'
import { mkdir, readdir, readFile, writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'
import { UPLOADS_DIR } from '../paths.js'
import type { WechatConfig } from './config.js'
import {
  WECHAT_MESSAGE_ITEM_TYPE_FILE,
  WECHAT_MESSAGE_ITEM_TYPE_IMAGE,
  WECHAT_MESSAGE_ITEM_TYPE_TEXT,
  WECHAT_MESSAGE_ITEM_TYPE_VIDEO,
  WECHAT_MESSAGE_ITEM_TYPE_VOICE,
  WECHAT_UPLOAD_MEDIA_TYPE_FILE,
  WECHAT_UPLOAD_MEDIA_TYPE_IMAGE,
  getWechatUploadUrl,
  sendWechatMessage,
  type WechatMessageFileItem,
  type WechatMessageImageItem,
  type WechatMessageItem,
} from './api.js'
import { sendWechatTextChunks } from './push.js'

const MAX_INBOUND_MEDIA_BYTES = 100 * 1024 * 1024
const MAX_OUTBOUND_ARTIFACT_BYTES = 20 * 1024 * 1024
const MAX_ARTIFACTS_PER_RUN = 5
const IGNORE_ARTIFACT_NAMES = new Set(['history.txt', 'CLAUDE.md'])
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])
const INPUT_ATTACHMENT_MANIFEST = '.laborany-input-files.json'

interface ParsedWechatInboundMessage {
  text: string
  fileIds: string[]
}

interface UploadedFileInfo {
  downloadEncryptedQueryParam: string
  aesKeyBase64: string
  rawFileMd5: string
  fileSize: number
  fileSizeCiphertext: number
}

interface TaskFileNode {
  name: string
  path: string
  type: 'file' | 'folder'
  size?: number
  mtimeMs?: number
  children?: TaskFileNode[]
}

interface TaskFileSnapshot {
  path: string
  size: number
  mtimeMs: number
}

interface TaskInputAttachmentManifest {
  version?: number
  inputFiles?: string[]
}

export interface WechatArtifactPushResult {
  sent: number
  failed: number
  skipped: number
}

export interface WechatDirectFileSendResult {
  attempted: number
  sent: number
  failed: number
  missing: number
  missingPaths: string[]
  failedPaths: string[]
}

function getSrcApiBaseUrl(): string {
  return (process.env.SRC_API_BASE_URL || 'http://127.0.0.1:3620/api').replace(/\/+$/, '')
}

function normalizeApiFilePath(path: string): string {
  return path
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')
}

function flattenTaskFiles(nodes: TaskFileNode[]): TaskFileSnapshot[] {
  const flattened: TaskFileSnapshot[] = []
  const visit = (node: TaskFileNode): void => {
    if (node.type === 'file') {
      flattened.push({
        path: node.path,
        size: Number(node.size || 0),
        mtimeMs: Number(node.mtimeMs || 0),
      })
      return
    }
    if (!Array.isArray(node.children)) return
    node.children.forEach(visit)
  }
  nodes.forEach(visit)
  return flattened
}

function shouldIgnoreArtifact(path: string): boolean {
  const name = basename(path)
  if (!name) return true
  if (IGNORE_ARTIFACT_NAMES.has(name)) return true
  if (name.startsWith('.')) return true
  return false
}

function normalizePathToken(pathToken: string): string {
  let normalized = pathToken.trim().replace(/^["'`]+|["'`]+$/g, '')
  while (/[，。！？；：,.;!?）)】]$/.test(normalized)) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

async function fetchTaskFiles(sessionId: string): Promise<TaskFileNode[]> {
  try {
    const response = await fetch(`${getSrcApiBaseUrl()}/task/${encodeURIComponent(sessionId)}/files`)
    if (!response.ok) return []
    const payload = await response.json() as { files?: unknown }
    return Array.isArray(payload.files) ? payload.files as TaskFileNode[] : []
  } catch {
    return []
  }
}

async function downloadTaskFile(sessionId: string, filePath: string): Promise<Buffer | null> {
  const normalizedPath = normalizeApiFilePath(filePath)
  try {
    const response = await fetch(`${getSrcApiBaseUrl()}/task/${encodeURIComponent(sessionId)}/files/${normalizedPath}`)
    if (!response.ok) return null
    const data = Buffer.from(await response.arrayBuffer())
    if (data.length > MAX_OUTBOUND_ARTIFACT_BYTES) {
      console.warn(`[WeChatMedia] skip oversized artifact ${filePath}: ${data.length} bytes`)
      return null
    }
    return data
  } catch (error) {
    console.warn(`[WeChatMedia] failed to download task artifact ${filePath}:`, error)
    return null
  }
}

async function fetchTaskInputFiles(sessionId: string): Promise<Set<string>> {
  const normalizedPath = normalizeApiFilePath(INPUT_ATTACHMENT_MANIFEST)
  try {
    const response = await fetch(`${getSrcApiBaseUrl()}/task/${encodeURIComponent(sessionId)}/files/${normalizedPath}`)
    if (!response.ok) return new Set()
    const payload = await response.json() as TaskInputAttachmentManifest
    const inputFiles = Array.isArray(payload.inputFiles) ? payload.inputFiles : []
    return new Set(
      inputFiles
        .map(filePath => (typeof filePath === 'string' ? filePath.trim() : ''))
        .filter(Boolean),
    )
  } catch {
    return new Set()
  }
}

function aesEcbPaddedSize(plaintextSize: number): number {
  return Math.ceil((plaintextSize + 1) / 16) * 16
}

function encryptAesEcb(plaintext: Buffer, key: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, null)
  return Buffer.concat([cipher.update(plaintext), cipher.final()])
}

function decryptAesEcb(ciphertext: Buffer, key: Buffer): Buffer {
  const decipher = createDecipheriv('aes-128-ecb', key, null)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

function buildCdnDownloadUrl(encryptedQueryParam: string, cdnBaseUrl: string): string {
  return `${cdnBaseUrl}/download?encrypted_query_param=${encodeURIComponent(encryptedQueryParam)}`
}

function buildCdnUploadUrl(params: {
  cdnBaseUrl: string
  uploadParam: string
  filekey: string
}): string {
  return `${params.cdnBaseUrl}/upload?encrypted_query_param=${encodeURIComponent(params.uploadParam)}&filekey=${encodeURIComponent(params.filekey)}`
}

function md5Hex(buffer: Buffer): string {
  return createHash('md5').update(buffer).digest('hex')
}

function encodeWechatAesKeyBase64(key: Buffer): string {
  return Buffer.from(key.toString('hex'), 'utf-8').toString('base64')
}

function parseAesKeyBase64(aesKeyBase64: string): Buffer {
  const decoded = Buffer.from(aesKeyBase64, 'base64')
  if (decoded.length === 16) return decoded
  if (decoded.length === 32 && /^[0-9a-fA-F]{32}$/.test(decoded.toString('ascii'))) {
    return Buffer.from(decoded.toString('ascii'), 'hex')
  }
  throw new Error(`invalid aes_key payload length: ${decoded.length}`)
}

async function fetchCdnBytes(url: string, maxBytes: number, label: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`${label}: CDN download ${response.status} ${response.statusText}${body ? ` ${body.slice(0, 200)}` : ''}`)
  }

  const data = Buffer.from(await response.arrayBuffer())
  if (data.length > maxBytes) {
    throw new Error(`${label}: payload too large (${data.length} bytes)`)
  }
  return data
}

async function downloadAndDecryptBuffer(
  encryptedQueryParam: string,
  aesKeyBase64: string,
  cdnBaseUrl: string,
  label: string,
): Promise<Buffer> {
  const key = parseAesKeyBase64(aesKeyBase64)
  const encrypted = await fetchCdnBytes(
    buildCdnDownloadUrl(encryptedQueryParam, cdnBaseUrl),
    MAX_INBOUND_MEDIA_BYTES,
    label,
  )
  return decryptAesEcb(encrypted, key)
}

async function downloadPlainCdnBuffer(
  encryptedQueryParam: string,
  cdnBaseUrl: string,
  label: string,
): Promise<Buffer> {
  return fetchCdnBytes(
    buildCdnDownloadUrl(encryptedQueryParam, cdnBaseUrl),
    MAX_INBOUND_MEDIA_BYTES,
    label,
  )
}

function inferImageExtension(buffer: Buffer): string {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return '.png'
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return '.jpg'
  }
  if (buffer.length >= 6) {
    const head = buffer.subarray(0, 6).toString('ascii')
    if (head === 'GIF87a' || head === 'GIF89a') return '.gif'
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return '.webp'
  }
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return '.bmp'
  }
  return '.jpg'
}

async function saveBufferToUploads(buffer: Buffer, extension: string): Promise<string> {
  await mkdir(UPLOADS_DIR, { recursive: true })
  const fileId = randomUUID()
  const normalizedExtension = extension.startsWith('.') ? extension : extension ? `.${extension}` : ''
  const filePath = join(UPLOADS_DIR, `${fileId}${normalizedExtension}`)
  await writeFile(filePath, buffer)
  return fileId
}

function isMediaItem(item?: WechatMessageItem): boolean {
  if (!item) return false
  return item.type === WECHAT_MESSAGE_ITEM_TYPE_IMAGE
    || item.type === WECHAT_MESSAGE_ITEM_TYPE_FILE
    || item.type === WECHAT_MESSAGE_ITEM_TYPE_VIDEO
    || item.type === WECHAT_MESSAGE_ITEM_TYPE_VOICE
}

function bodyFromItemList(itemList?: WechatMessageItem[]): string {
  if (!itemList?.length) return ''

  const texts: string[] = []
  for (const item of itemList) {
    if (item.type === WECHAT_MESSAGE_ITEM_TYPE_TEXT && item.text_item?.text != null) {
      const text = String(item.text_item.text || '').trim()
      if (!text) continue

      const ref = item.ref_msg
      if (!ref?.message_item) {
        texts.push(text)
        continue
      }

      if (isMediaItem(ref.message_item)) {
        texts.push(text)
        continue
      }

      const parts: string[] = []
      if (typeof ref.title === 'string' && ref.title.trim()) {
        parts.push(ref.title.trim())
      }
      const nested = bodyFromItemList([ref.message_item]).trim()
      if (nested) parts.push(nested)

      texts.push(parts.length > 0 ? `[引用: ${parts.join(' | ')}]\n${text}` : text)
      continue
    }

    if (item.type === WECHAT_MESSAGE_ITEM_TYPE_VOICE && item.voice_item?.text) {
      const text = String(item.voice_item.text || '').trim()
      if (text) texts.push(text)
    }
  }

  return texts.join('\n').trim()
}

function resolveInboundMediaKey(item: WechatMessageItem): string | null {
  if (item.type === WECHAT_MESSAGE_ITEM_TYPE_IMAGE) {
    const key = item.image_item?.media?.encrypt_query_param?.trim()
    return key ? `image:${key}` : null
  }
  if (item.type === WECHAT_MESSAGE_ITEM_TYPE_FILE) {
    const key = item.file_item?.media?.encrypt_query_param?.trim()
    return key ? `file:${key}` : null
  }
  return null
}

function collectDownloadableItems(itemList?: WechatMessageItem[]): WechatMessageItem[] {
  if (!itemList?.length) return []

  const seen = new Set<string>()
  const items: WechatMessageItem[] = []
  const push = (item?: WechatMessageItem) => {
    if (!item) return
    if (item.type !== WECHAT_MESSAGE_ITEM_TYPE_IMAGE && item.type !== WECHAT_MESSAGE_ITEM_TYPE_FILE) return
    const key = resolveInboundMediaKey(item)
    if (!key || seen.has(key)) return
    seen.add(key)
    items.push(item)
  }

  for (const item of itemList) {
    push(item)
    push(item.ref_msg?.message_item)
  }

  return items
}

function resolveImageAesKeyBase64(item: WechatMessageImageItem): string | null {
  if (typeof item.aeskey === 'string' && item.aeskey.trim()) {
    return Buffer.from(item.aeskey.trim(), 'hex').toString('base64')
  }
  const raw = item.media?.aes_key?.trim()
  return raw || null
}

async function saveInboundMediaItem(config: WechatConfig, item: WechatMessageItem): Promise<string | null> {
  if (item.type === WECHAT_MESSAGE_ITEM_TYPE_IMAGE) {
    const image = item.image_item
    const encryptedQueryParam = image?.media?.encrypt_query_param?.trim()
    if (!image || !encryptedQueryParam) return null

    const aesKeyBase64 = resolveImageAesKeyBase64(image)
    const buffer = aesKeyBase64
      ? await downloadAndDecryptBuffer(encryptedQueryParam, aesKeyBase64, config.cdnBaseUrl, 'wechat-image')
      : await downloadPlainCdnBuffer(encryptedQueryParam, config.cdnBaseUrl, 'wechat-image-plain')
    return saveBufferToUploads(buffer, inferImageExtension(buffer))
  }

  if (item.type === WECHAT_MESSAGE_ITEM_TYPE_FILE) {
    const fileItem = item.file_item
    const encryptedQueryParam = fileItem?.media?.encrypt_query_param?.trim()
    const aesKeyBase64 = fileItem?.media?.aes_key?.trim()
    if (!fileItem || !encryptedQueryParam || !aesKeyBase64) return null

    const buffer = await downloadAndDecryptBuffer(encryptedQueryParam, aesKeyBase64, config.cdnBaseUrl, 'wechat-file')
    const extension = extname(fileItem.file_name || '').toLowerCase() || '.bin'
    return saveBufferToUploads(buffer, extension)
  }

  return null
}

async function uploadBufferToCdn(params: {
  config: WechatConfig
  toUserId: string
  buffer: Buffer
  mediaType: number
}): Promise<UploadedFileInfo> {
  const rawSize = params.buffer.length
  const rawFileMd5 = md5Hex(params.buffer)
  const fileSize = aesEcbPaddedSize(rawSize)
  const filekey = randomBytes(16).toString('hex')
  const aesKey = randomBytes(16)

  const uploadUrlResp = await getWechatUploadUrl({
    baseUrl: params.config.baseUrl,
    token: params.config.token,
    filekey,
    mediaType: params.mediaType,
    toUserId: params.toUserId,
    rawSize,
    rawFileMd5,
    fileSize,
    noNeedThumb: true,
    aesKeyHex: aesKey.toString('hex'),
  })

  const uploadParam = (uploadUrlResp.upload_param || '').trim()
  if (!uploadParam) {
    throw new Error('getuploadurl returned no upload_param')
  }

  const ciphertext = encryptAesEcb(params.buffer, aesKey)
  const response = await fetch(buildCdnUploadUrl({
    cdnBaseUrl: params.config.cdnBaseUrl,
    uploadParam,
    filekey,
  }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(ciphertext),
  })

  if (response.status !== 200) {
    const errMsg = response.headers.get('x-error-message') || await response.text().catch(() => '')
    throw new Error(`CDN upload failed: ${response.status}${errMsg ? ` ${errMsg}` : ''}`)
  }

  const downloadEncryptedQueryParam = response.headers.get('x-encrypted-param')?.trim()
  if (!downloadEncryptedQueryParam) {
    throw new Error('CDN upload response missing x-encrypted-param header')
  }

  return {
    downloadEncryptedQueryParam,
    aesKeyBase64: encodeWechatAesKeyBase64(aesKey),
    rawFileMd5,
    fileSize: rawSize,
    fileSizeCiphertext: fileSize,
  }
}

async function sendWechatImageBuffer(params: {
  config: WechatConfig
  toUserId: string
  contextToken: string
  buffer: Buffer
}): Promise<void> {
  const uploaded = await uploadBufferToCdn({
    config: params.config,
    toUserId: params.toUserId,
    buffer: params.buffer,
    mediaType: WECHAT_UPLOAD_MEDIA_TYPE_IMAGE,
  })

  await sendWechatMessage({
    baseUrl: params.config.baseUrl,
    token: params.config.token,
    toUserId: params.toUserId,
    contextToken: params.contextToken,
    itemList: [
      {
        type: WECHAT_MESSAGE_ITEM_TYPE_IMAGE,
        image_item: {
          media: {
            encrypt_query_param: uploaded.downloadEncryptedQueryParam,
            aes_key: uploaded.aesKeyBase64,
            encrypt_type: 1,
          },
          mid_size: uploaded.fileSizeCiphertext,
        },
      },
    ],
  })
}

async function sendWechatFileBuffer(params: {
  config: WechatConfig
  toUserId: string
  contextToken: string
  fileName: string
  buffer: Buffer
}): Promise<void> {
  const uploaded = await uploadBufferToCdn({
    config: params.config,
    toUserId: params.toUserId,
    buffer: params.buffer,
    mediaType: WECHAT_UPLOAD_MEDIA_TYPE_FILE,
  })

  await sendWechatMessage({
    baseUrl: params.config.baseUrl,
    token: params.config.token,
    toUserId: params.toUserId,
    contextToken: params.contextToken,
    itemList: [
      {
        type: WECHAT_MESSAGE_ITEM_TYPE_FILE,
        file_item: {
          media: {
            encrypt_query_param: uploaded.downloadEncryptedQueryParam,
            aes_key: uploaded.aesKeyBase64,
            encrypt_type: 1,
          },
          file_name: params.fileName,
          len: String(uploaded.fileSize),
        },
      },
    ],
  })
}

async function sendWechatBufferAsMedia(
  config: WechatConfig,
  toUserId: string,
  fileName: string,
  buffer: Buffer,
  options?: {
    accountId?: string
    contextToken?: string
  },
): Promise<'sent' | 'failed'> {
  const normalizedFileName = basename(fileName || 'artifact.bin')
  const extension = extname(normalizedFileName).toLowerCase()
  const contextToken = options?.contextToken?.trim()
  if (!contextToken) {
    throw new Error('current context_token is required for media send')
  }

  try {
    if (IMAGE_EXTENSIONS.has(extension)) {
      await sendWechatImageBuffer({
        config,
        toUserId,
        contextToken,
        buffer,
      })
    } else {
      await sendWechatFileBuffer({
        config,
        toUserId,
        contextToken,
        fileName: normalizedFileName,
        buffer,
      })
    }
    return 'sent'
  } catch (error) {
    console.warn(`[WeChatMedia] failed to send media ${normalizedFileName}:`, error)
    return 'failed'
  }
}

export async function sendWechatFilesByAbsolutePaths(
  config: WechatConfig,
  toUserId: string,
  paths: string[],
  options?: {
    accountId?: string
    contextToken?: string
  },
): Promise<WechatDirectFileSendResult> {
  const normalizedPaths = paths.map(item => normalizePathToken(item)).filter(Boolean)
  if (!normalizedPaths.length) {
    return {
      attempted: 0,
      sent: 0,
      failed: 0,
      missing: 0,
      missingPaths: [],
      failedPaths: [],
    }
  }

  let sent = 0
  let failed = 0
  let missing = 0
  const missingPaths: string[] = []
  const failedPaths: string[] = []

  for (const candidatePath of normalizedPaths) {
    const tryPaths = [candidatePath]
    if (candidatePath.includes('/')) {
      tryPaths.push(candidatePath.replace(/\//g, '\\'))
    } else if (candidatePath.includes('\\')) {
      tryPaths.push(candidatePath.replace(/\\/g, '/'))
    }

    const absolutePath = tryPaths.find(item => existsSync(item))
    if (!absolutePath) {
      missing += 1
      missingPaths.push(candidatePath)
      continue
    }

    try {
      const fileStat = statSync(absolutePath)
      if (!fileStat.isFile()) {
        missing += 1
        missingPaths.push(candidatePath)
        continue
      }
      if (fileStat.size > MAX_OUTBOUND_ARTIFACT_BYTES) {
        failed += 1
        failedPaths.push(absolutePath)
        continue
      }

      const fileName = basename(absolutePath) || absolutePath
      const payload = readFileSync(absolutePath)
      const result = await sendWechatBufferAsMedia(config, toUserId, fileName, payload, options)
      console.log(`[WeChatMedia] direct send file ${fileName}: ${result}`)
      if (result === 'sent') {
        sent += 1
      } else {
        failed += 1
        failedPaths.push(absolutePath)
      }
    } catch {
      failed += 1
      failedPaths.push(candidatePath)
    }
  }

  return {
    attempted: normalizedPaths.length,
    sent,
    failed,
    missing,
    missingPaths,
    failedPaths,
  }
}

export async function parseWechatInboundMessageContent(
  config: WechatConfig,
  itemList?: WechatMessageItem[],
): Promise<ParsedWechatInboundMessage> {
  const text = bodyFromItemList(itemList)
  const downloadableItems = collectDownloadableItems(itemList)
  const fileIds: string[] = []

  for (const item of downloadableItems) {
    try {
      const fileId = await saveInboundMediaItem(config, item)
      if (fileId) fileIds.push(fileId)
    } catch (error) {
      console.warn('[WeChatMedia] failed to persist inbound media:', error)
    }
  }

  const nextText = fileIds.length > 0
    ? [text.trim(), `[LABORANY_FILE_IDS: ${fileIds.join(', ')}]`].filter(Boolean).join('\n\n')
    : text.trim()

  return {
    text: nextText,
    fileIds,
  }
}

export async function sendWechatArtifactsFromSession(
  config: WechatConfig,
  toUserId: string,
  sessionId: string,
  startedAfterMs?: number,
  options?: {
    accountId?: string
    contextToken?: string
  },
): Promise<WechatArtifactPushResult> {
  const contextToken = options?.contextToken?.trim()
  if (!contextToken) {
    return { sent: 0, failed: 0, skipped: 0 }
  }

  const nodes = await fetchTaskFiles(sessionId)
  const inputFiles = await fetchTaskInputFiles(sessionId)
  const files = flattenTaskFiles(nodes)
    .filter(item => !shouldIgnoreArtifact(item.path))
    .filter(item => !inputFiles.has(item.path))
    .filter(item => !startedAfterMs || item.mtimeMs >= startedAfterMs - 1000)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)

  if (!files.length) {
    return { sent: 0, failed: 0, skipped: 0 }
  }

  const selected = files.slice(0, MAX_ARTIFACTS_PER_RUN)
  let sent = 0
  let failed = 0
  let skipped = Math.max(0, files.length - selected.length)

  for (const item of selected) {
    const fileName = basename(item.path) || item.path
    const payload = await downloadTaskFile(sessionId, item.path)
    if (!payload) {
      skipped += 1
      continue
    }

    const result = await sendWechatBufferAsMedia(config, toUserId, fileName, payload, {
      accountId: options?.accountId,
      contextToken,
    })
    if (result === 'sent') sent += 1
    else failed += 1
  }

  if (failed > 0 || skipped > 0 || sent === 0) {
    await sendWechatTextChunks(config, toUserId, `本轮文件回传：成功 ${sent}，失败 ${failed}，跳过 ${skipped}。`, {
      accountId: options?.accountId,
      contextToken,
    })
  }

  return { sent, failed, skipped }
}

export async function ensureWechatUploadsDir(): Promise<void> {
  if (existsSync(UPLOADS_DIR)) return
  await mkdir(UPLOADS_DIR, { recursive: true })
}

export async function listWechatUploadedFiles(): Promise<string[]> {
  if (!existsSync(UPLOADS_DIR)) return []
  return readdir(UPLOADS_DIR)
}

export async function readWechatUploadedFile(fileName: string): Promise<Buffer> {
  return readFile(join(UPLOADS_DIR, fileName))
}
