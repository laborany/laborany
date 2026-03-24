import assert from 'node:assert/strict'
import { createCipheriv } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempHome = mkdtempSync(join(tmpdir(), 'laborany-wechat-media-'))
process.env.LABORANY_HOME = tempHome
process.env.SRC_API_BASE_URL = 'http://127.0.0.1:3620/api'

const CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c'
const API_BASE_URL = 'https://ilinkai.weixin.qq.com'

const inboundPayloads = new Map<string, Buffer>()
const taskFiles = new Map<string, Buffer>()
const sentMessages: Array<{ toUserId: string; itemList: any[] }> = []
const uploadRequests: Array<{ filekey: string; mediaType: number; body: any }> = []

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function createBinaryResponse(payload: Buffer, status = 200, headers?: Record<string, string>): Response {
  return new Response(payload, {
    status,
    headers,
  })
}

function encryptAesEcb(plaintext: Buffer, key: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, null)
  return Buffer.concat([cipher.update(plaintext), cipher.final()])
}

function parseBody(init?: RequestInit, input?: string | URL | Request): any {
  if (typeof init?.body === 'string') return JSON.parse(init.body)
  if (init?.body == null && input instanceof Request) {
    return input.clone().json().catch(() => undefined)
  }
  return undefined
}

const originalFetch = globalThis.fetch
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url
  const method = init?.method || (input instanceof Request ? input.method : 'GET')
  const parsedUrl = new URL(url)

  if (method === 'GET' && parsedUrl.origin === 'http://127.0.0.1:3620' && parsedUrl.pathname === '/api/task/wechat-session-1/files') {
    const now = Date.now()
    return createJsonResponse({
      files: [
        {
          name: '.laborany-input-files.json',
          path: '.laborany-input-files.json',
          type: 'file',
          size: taskFiles.get('.laborany-input-files.json')?.length || 0,
          mtimeMs: now,
        },
        {
          name: 'input.jpg',
          path: 'input.jpg',
          type: 'file',
          size: taskFiles.get('input.jpg')?.length || 0,
          mtimeMs: now,
        },
        {
          name: 'artifacts',
          path: 'artifacts',
          type: 'folder',
          children: [
            { name: 'chart.png', path: 'artifacts/chart.png', type: 'file', size: taskFiles.get('artifacts/chart.png')?.length || 0, mtimeMs: now },
            { name: 'report.md', path: 'artifacts/report.md', type: 'file', size: taskFiles.get('artifacts/report.md')?.length || 0, mtimeMs: now + 1 },
          ],
        },
        {
          name: 'history.txt',
          path: 'history.txt',
          type: 'file',
          size: 12,
          mtimeMs: now + 2,
        },
      ],
    })
  }

  if (method === 'GET' && parsedUrl.origin === 'http://127.0.0.1:3620' && parsedUrl.pathname.startsWith('/api/task/wechat-session-1/files/')) {
    const encodedPath = parsedUrl.pathname.replace('/api/task/wechat-session-1/files/', '')
    const filePath = encodedPath
      .split('/')
      .map(segment => decodeURIComponent(segment))
      .join('/')
    const payload = taskFiles.get(filePath)
    if (!payload) return new Response('not found', { status: 404 })
    return createBinaryResponse(payload)
  }

  if (method === 'GET' && parsedUrl.origin === 'https://novac2c.cdn.weixin.qq.com' && parsedUrl.pathname === '/c2c/download') {
    const encryptedQueryParam = parsedUrl.searchParams.get('encrypted_query_param') || ''
    const payload = inboundPayloads.get(encryptedQueryParam)
    if (!payload) return new Response('not found', { status: 404 })
    return createBinaryResponse(payload)
  }

  if (method === 'POST' && parsedUrl.origin === 'https://ilinkai.weixin.qq.com' && parsedUrl.pathname === '/ilink/bot/getuploadurl') {
    const body = await parseBody(init, input)
    const filekey = String(body?.filekey || '')
    const mediaType = Number(body?.media_type || 0)
    uploadRequests.push({ filekey, mediaType, body })
    return createJsonResponse({
      upload_param: `upload-${filekey}`,
    })
  }

  if (method === 'POST' && parsedUrl.origin === 'https://novac2c.cdn.weixin.qq.com' && parsedUrl.pathname === '/c2c/upload') {
    const filekey = parsedUrl.searchParams.get('filekey') || ''
    const encryptedParam = `download-${filekey}`
    return createBinaryResponse(Buffer.alloc(0), 200, {
      'x-encrypted-param': encryptedParam,
    })
  }

  if (method === 'POST' && parsedUrl.origin === 'https://ilinkai.weixin.qq.com' && parsedUrl.pathname === '/ilink/bot/sendmessage') {
    const body = await parseBody(init, input)
    sentMessages.push({
      toUserId: String(body?.msg?.to_user_id || ''),
      itemList: Array.isArray(body?.msg?.item_list) ? body.msg.item_list : [],
    })
    return createJsonResponse({ ret: 0, errcode: 0, errmsg: 'ok' })
  }

  throw new Error(`Unhandled fetch: ${method} ${url}`)
}

async function run(): Promise<void> {
  const media = await import('../agent-service/src/wechat/media.ts')
  const wechatApi = await import('../agent-service/src/wechat/api.ts')

  const imageKey = Buffer.from('00112233445566778899aabbccddeeff', 'hex')
  const fileKey = Buffer.from('ffeeddccbbaa99887766554433221100', 'hex')
  const imageBuffer = Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c49444154789c6360f8cf0000000300010065ae9f1d0000000049454e44ae426082',
    'hex',
  )
  const inboundFileBuffer = Buffer.from('wechat inbound file\n', 'utf-8')
  const outboundMarkdown = Buffer.from('# WeChat Artifact\n\nhello world\n', 'utf-8')

  inboundPayloads.set('image-download-key', encryptAesEcb(imageBuffer, imageKey))
  inboundPayloads.set('file-download-key', encryptAesEcb(inboundFileBuffer, fileKey))

  taskFiles.set('artifacts/chart.png', imageBuffer)
  taskFiles.set('artifacts/report.md', outboundMarkdown)
  taskFiles.set('input.jpg', imageBuffer)
  taskFiles.set('.laborany-input-files.json', Buffer.from(JSON.stringify({
    version: 1,
    inputFiles: ['input.jpg'],
  }), 'utf-8'))

  const config = {
    token: 'wechat-token',
    baseUrl: API_BASE_URL,
    cdnBaseUrl: CDN_BASE_URL,
    allowUsers: [],
    requireAllowlist: false,
    botName: 'LaborAny',
    defaultSkillId: '__generic__',
    pollTimeoutMs: 35_000,
    textChunkLimit: 1_000,
    credentialSource: 'file',
    accountId: 'wechat-bot-1',
  }

  const inboundParsed = await media.parseWechatInboundMessageContent(
    config as any,
    [
      {
        type: wechatApi.WECHAT_MESSAGE_ITEM_TYPE_TEXT,
        text_item: { text: '请处理这两个附件' },
      },
      {
        type: wechatApi.WECHAT_MESSAGE_ITEM_TYPE_IMAGE,
        image_item: {
          aeskey: imageKey.toString('hex'),
          media: {
            encrypt_query_param: 'image-download-key',
          },
        },
      },
      {
        type: wechatApi.WECHAT_MESSAGE_ITEM_TYPE_FILE,
        file_item: {
          file_name: 'brief.txt',
          media: {
            encrypt_query_param: 'file-download-key',
            aes_key: fileKey.toString('base64'),
          },
        },
      },
    ],
  )

  assert.match(inboundParsed.text, /请处理这两个附件/)
  assert.equal(inboundParsed.fileIds.length, 2)

  const uploadedFiles = await media.listWechatUploadedFiles()
  assert.equal(uploadedFiles.length, 2)

  const uploadedPayloads = await Promise.all(
    uploadedFiles.map((fileName: string) => media.readWechatUploadedFile(fileName)),
  )
  assert.ok(uploadedPayloads.some((payload: Buffer) => payload.equals(imageBuffer)))
  assert.ok(uploadedPayloads.some((payload: Buffer) => payload.equals(inboundFileBuffer)))

  const artifactResult = await media.sendWechatArtifactsFromSession(
    config as any,
    'wechat-user',
    'wechat-session-1',
    Date.now() - 5_000,
    {
      accountId: 'wechat-bot-1',
      contextToken: 'wechat-ctx-1',
    },
  )

  assert.deepEqual(artifactResult, { sent: 2, failed: 0, skipped: 0 })
  assert.equal(uploadRequests.length, 2)

  const itemTypes = sentMessages.map(entry => entry.itemList[0]?.type)
  assert.ok(itemTypes.includes(wechatApi.WECHAT_MESSAGE_ITEM_TYPE_IMAGE))
  assert.ok(itemTypes.includes(wechatApi.WECHAT_MESSAGE_ITEM_TYPE_FILE))

  const outboundAesKeys = sentMessages
    .flatMap(entry => entry.itemList)
    .map((item) => item?.image_item?.media?.aes_key || item?.file_item?.media?.aes_key || '')
    .filter(Boolean)
  assert.ok(outboundAesKeys.length >= 2)
  for (const aesKeyBase64 of outboundAesKeys) {
    const decoded = Buffer.from(String(aesKeyBase64), 'base64')
    assert.equal(decoded.length, 32)
    assert.match(decoded.toString('ascii'), /^[0-9a-f]{32}$/i)
  }

  const summaryTexts = sentMessages
    .filter(entry => entry.itemList[0]?.type === wechatApi.WECHAT_MESSAGE_ITEM_TYPE_TEXT)
    .map(entry => String(entry.itemList[0]?.text_item?.text || ''))
  assert.equal(summaryTexts.length, 0)

  console.log('verify-wechat-media: PASS')
  console.log(`inbound saved: ${uploadedFiles.length}, outbound messages: ${sentMessages.length}`)
}

run()
  .catch((error) => {
    console.error('verify-wechat-media: FAIL')
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    globalThis.fetch = originalFetch
    rmSync(tempHome, { recursive: true, force: true })
  })
