import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempHome = mkdtempSync(join(tmpdir(), 'laborany-remote-bot-'))
process.env.LABORANY_HOME = tempHome
process.env.SRC_API_BASE_URL = 'http://127.0.0.1:3620/api'
process.env.AGENT_SERVICE_URL = 'http://127.0.0.1:3002'
const directSendFilePath = join(tempHome, 'direct-send-report.md')
writeFileSync(directSendFilePath, '# direct send\n\nhello from verify-remote-bot-flow\n', 'utf-8')

type FetchCall = {
  url: string
  method: string
  body?: any
}

const fetchCalls: FetchCall[] = []
let mockMessageSeq = 0
const wechatReplies: Array<{ toUserId: string; itemList: any[] }> = []

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function createSseResponse(events: Array<Record<string, unknown>>): Response {
  const body = events
    .map(event => `data: ${JSON.stringify(event)}\n\n`)
    .join('')
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

const originalFetch = globalThis.fetch
const originalConsoleError = console.error
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url
  const method = init?.method || (input instanceof Request ? input.method : 'GET')
  const bodyText = typeof init?.body === 'string'
    ? init.body
    : input instanceof Request
      ? await input.clone().text().catch(() => '')
      : ''
  const body = bodyText ? JSON.parse(bodyText) : undefined
  fetchCalls.push({ url, method, body })

  if (url.endsWith('/skill/list')) {
    return createJsonResponse({
      skills: [
        { id: 'wechat-writer', name: 'WeChat Writer', description: 'Mock skill' },
        { id: '__generic__', name: 'Generic', description: 'Mock generic skill' },
      ],
    })
  }

  if (/\/task\/[^/]+\/files(?:\/.*)?$/.test(url)) {
    return createJsonResponse({ files: [] })
  }

  if (url.endsWith('/converse')) {
    const latestUserContent = Array.isArray(body?.messages)
      ? String(body.messages[body.messages.length - 1]?.content || '')
      : ''
    if (latestUserContent.includes('附件执行回归测试')) {
      return createSseResponse([
        {
          type: 'action',
          action: 'execute_generic',
          query: '请根据上传文件生成一份摘要文件',
          attachmentIds: ['att-a', 'att-b'],
        },
        { type: 'done' },
      ])
    }
    if (latestUserContent.includes('文件直发回归测试')) {
      return createSseResponse([
        {
          type: 'action',
          action: 'send_file',
          filePaths: [directSendFilePath],
        },
        { type: 'done' },
      ])
    }
    return createSseResponse([
      { type: 'text', content: '路由器已接管这条新需求。' },
      { type: 'done' },
    ])
  }

  if (/\/skill\/stop\/[^/]+$/.test(url)) {
    return createJsonResponse({ success: true })
  }

  if (url.includes('/ilink/bot/sendmessage')) {
    wechatReplies.push({
      toUserId: String(body?.msg?.to_user_id || ''),
      itemList: Array.isArray(body?.msg?.item_list) ? body.msg.item_list : [],
    })
    return createJsonResponse({ ret: 0, errcode: 0, errmsg: 'ok' })
  }

  if (url.includes('/ilink/bot/getuploadurl')) {
    return createJsonResponse({
      upload_param: `upload-${String(body?.filekey || 'file-key')}`,
    })
  }

  if (url.startsWith('https://novac2c.cdn.weixin.qq.com/c2c/upload')) {
    return new Response(Buffer.alloc(0), {
      status: 200,
      headers: {
        'x-encrypted-param': 'download-direct-send-key',
      },
    })
  }

  if (url.endsWith('/skill/execute')) {
    const sessionId = String(body?.sessionId || '')
    const query = String(body?.query || '')
    const source = String(body?.source || '')

    if (query.includes('ai搜索')) {
      return createSseResponse([
        { type: 'session', sessionId },
        { type: 'text', content: '老板好!收到您的需求，我先给您几个方向。' },
        {
          type: 'question',
          content: '老板，您更倾向哪个方向?或者有其他想法?',
          questions: [
            {
              header: '选题方向',
              question: '老板，您更倾向哪个方向?或者有其他想法?',
              options: [
                { label: '方向1', description: '问题导向' },
                { label: '方向4', description: '趋势导向' },
              ],
            },
          ],
        },
        { type: 'state', phase: 'completed' },
        { type: 'done' },
      ])
    }

    if (query === '方向4') {
      return createSseResponse([
        { type: 'session', sessionId },
        { type: 'text', content: `${source} 已收到方向4，我继续沿用原 skill 上下文完成正文。` },
        { type: 'state', phase: 'completed' },
        { type: 'done' },
      ])
    }

    return createSseResponse([
      { type: 'session', sessionId },
      { type: 'text', content: '默认执行完成。' },
      { type: 'state', phase: 'completed' },
      { type: 'done' },
    ])
  }

  if (url.includes('/auth/v3/tenant_access_token/internal')) {
    return createJsonResponse({ code: 999, msg: 'test fallback' }, 200)
  }

  throw new Error(`Unhandled fetch: ${method} ${url}`)
}

console.error = (...args: unknown[]) => {
  const joined = args.map(item => String(item ?? '')).join(' ')
  if (joined.includes('[Feishu] 创建流式卡片失败:')) {
    return
  }
  originalConsoleError(...args)
}

function createFeishuClient() {
  const sentTexts: string[] = []
  const client = {
    im: {
      message: {
        create: async ({ data }: any) => {
          if (data?.msg_type === 'text') {
            const parsed = JSON.parse(data.content || '{}')
            sentTexts.push(String(parsed.text || ''))
          } else if (data?.msg_type === 'interactive') {
            sentTexts.push('[interactive-card]')
          } else {
            sentTexts.push(String(data?.content || ''))
          }
          return {
            code: 0,
            msg: 'ok',
            data: { message_id: `feishu-msg-${++mockMessageSeq}` },
          }
        },
      },
      file: {
        create: async () => ({ file_key: 'file-key' }),
      },
      image: {
        create: async () => ({ image_key: 'image-key' }),
      },
      messageResource: {
        get: async () => {
          throw new Error('not implemented in test')
        },
      },
    },
  }
  return { client, sentTexts }
}

function createQQClient() {
  const sentTexts: string[] = []
  const client = {
    c2cApi: {
      postMessage: async (_targetId: string, payload: any) => {
        sentTexts.push(String(payload?.content || ''))
        return {
          data: { msg_seq: ++mockMessageSeq },
        }
      },
    },
  }
  return { client, sentTexts }
}

function extractWechatText(itemList: any[]): string {
  if (!Array.isArray(itemList)) return ''
  return itemList
    .map((item) => {
      if (item?.type === 1) {
        return String(item?.text_item?.text || '').trim()
      }
      if (item?.type === 2) return '[image]'
      if (item?.type === 4) return `[file:${String(item?.file_item?.file_name || '')}]`
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

async function run(): Promise<void> {
  const feishuHandler = await import('../agent-service/src/feishu/handler.ts')
  const feishuState = await import('../agent-service/src/feishu/index.ts')
  const qqHandler = await import('../agent-service/src/qq/handler.ts')
  const qqState = await import('../agent-service/src/qq/index.ts')
  const wechatHandler = await import('../agent-service/src/wechat/handler.ts')
  const wechatState = await import('../agent-service/src/wechat/index.ts')
  const skillSessionGuard = await import('../src-api/src/lib/skill-session-guard.ts')

  assert.equal(skillSessionGuard.isExistingSkillSessionBusy('running'), true)
  assert.equal(skillSessionGuard.isExistingSkillSessionBusy('waiting_input'), false)

  const feishuConfig = {
    appId: 'test-app',
    appSecret: 'test-secret',
    domain: 'feishu',
    allowUsers: ['feishu-user'],
    requireAllowlist: true,
    botName: 'LaborAny',
    defaultSkillId: '__generic__',
  }

  const qqConfig = {
    appId: 'test-app',
    token: 'test-token',
    secret: 'test-secret',
    sandbox: false,
    allowUsers: ['qq-user'],
    requireAllowlist: true,
    botName: 'LaborAny',
    defaultSkillId: '__generic__',
  }

  const wechatConfig = {
    token: 'wechat-token',
    baseUrl: 'https://ilinkai.weixin.qq.com',
    cdnBaseUrl: 'https://novac2c.cdn.weixin.qq.com/c2c',
    allowUsers: ['wechat-user'],
    requireAllowlist: true,
    botName: 'LaborAny',
    defaultSkillId: '__generic__',
    pollTimeoutMs: 35_000,
    textChunkLimit: 1_000,
    credentialSource: 'file',
    accountId: 'wechat-bot-1',
    rawAccountId: 'wechat-bot-1@im.bot',
    userId: 'wechat-bot-1@im.wechat',
  }

  const { client: feishuClient, sentTexts: feishuReplies } = createFeishuClient()
  const { client: qqClient, sentTexts: qqReplies } = createQQClient()

  assert.equal(feishuState.buildUserStateKey('feishu-user', 'chat-1'), 'feishu-user')
  assert.equal(feishuState.buildUserStateKey('feishu-user', 'chat-2'), 'feishu-user')
  const feishuStateKey = feishuState.buildUserStateKey('feishu-user', 'chat-1')
  feishuState.resetUser(feishuStateKey)

  await feishuHandler.handleFeishuMessage(
    feishuClient as any,
    {
      sender: { sender_id: { open_id: 'feishu-user' } },
      message: {
        chat_id: 'chat-1',
        message_id: 'feishu-msg-1',
        message_type: 'text',
        content: JSON.stringify({ text: '/skill wechat-writer 创建一个关于ai搜索的文章' }),
      },
    },
    feishuConfig as any,
  )

  const feishuFirstState = feishuState.getUserState(feishuStateKey)
  assert.equal(feishuFirstState.activeSkillId, 'wechat-writer')
  assert.equal(feishuFirstState.executeAwaitingInput, true)
  assert.ok(feishuFirstState.executeSessionId)

  await feishuHandler.handleFeishuMessage(
    feishuClient as any,
    {
      sender: { sender_id: { open_id: 'feishu-user' } },
      message: {
        chat_id: 'chat-2',
        message_id: 'feishu-msg-2',
        message_type: 'text',
        content: JSON.stringify({ text: '方向4' }),
      },
    },
    feishuConfig as any,
  )

  const feishuExecuteCalls = fetchCalls.filter(call => call.url.endsWith('/skill/execute') && call.body?.source === 'feishu')
  assert.equal(feishuExecuteCalls.length, 2)
  assert.equal(feishuExecuteCalls[1]?.body?.sessionId, feishuExecuteCalls[0]?.body?.sessionId)
  assert.equal(feishuState.getUserState(feishuStateKey).executeAwaitingInput, false)
  assert.ok(feishuReplies.some(text => text.includes('方向4')))

  await feishuHandler.handleFeishuMessage(
    feishuClient as any,
    {
      sender: { sender_id: { open_id: 'feishu-user' } },
      message: {
        chat_id: 'chat-1',
        message_id: 'feishu-msg-3',
        message_type: 'text',
        content: JSON.stringify({ text: '/home' }),
      },
    },
    feishuConfig as any,
  )

  await feishuHandler.handleFeishuMessage(
    feishuClient as any,
    {
      sender: { sender_id: { open_id: 'feishu-user' } },
      message: {
        chat_id: 'chat-1',
        message_id: 'feishu-msg-4',
        message_type: 'text',
        content: JSON.stringify({ text: '帮我重新路由一个新任务' }),
      },
    },
    feishuConfig as any,
  )
  assert.ok(fetchCalls.some(call => call.url.endsWith('/converse') && call.body?.source === 'feishu'))

  const feishuExecuteCountBeforeAttachment = fetchCalls.filter(call => call.url.endsWith('/skill/execute') && call.body?.source === 'feishu').length
  await feishuHandler.handleFeishuMessage(
    feishuClient as any,
    {
      sender: { sender_id: { open_id: 'feishu-user' } },
      message: {
        chat_id: 'chat-1',
        message_id: 'feishu-msg-5',
        message_type: 'text',
        content: JSON.stringify({ text: '附件执行回归测试' }),
      },
    },
    feishuConfig as any,
  )
  const feishuAttachmentExecute = fetchCalls
    .filter(call => call.url.endsWith('/skill/execute') && call.body?.source === 'feishu')
    .slice(feishuExecuteCountBeforeAttachment)
  assert.equal(feishuAttachmentExecute.length, 1)
  assert.match(String(feishuAttachmentExecute[0]?.body?.query || ''), /\[LABORANY_FILE_IDS:\s*att-a,\s*att-b\]/)

  assert.equal(qqState.buildUserStateKey('qq-user', 'guild-a', 'channel-a', 'group-a'), 'qq-user')
  const qqStateKey = qqState.buildUserStateKey('qq-user')
  qqState.resetUser(qqStateKey)

  await qqHandler.handleQQMessage(
    qqClient as any,
    {
      id: 'qq-msg-1',
      author: { id: 'qq-user', username: 'boss' },
      content: '/skill wechat-writer 创建一个关于ai搜索的文章',
      channel_id: 'channel-a',
      guild_id: 'guild-a',
      group_openid: 'group-a',
    },
    qqConfig as any,
    'c2c',
  )

  const qqFirstState = qqState.getUserState(qqStateKey)
  assert.equal(qqFirstState.activeSkillId, 'wechat-writer')
  assert.equal(qqFirstState.executeAwaitingInput, true)
  assert.ok(qqFirstState.executeSessionId)

  await qqHandler.handleQQMessage(
    qqClient as any,
    {
      id: 'qq-msg-2',
      author: { id: 'qq-user', username: 'boss' },
      content: '方向4',
      channel_id: 'channel-b',
      guild_id: 'guild-b',
      group_openid: 'group-b',
    },
    qqConfig as any,
    'c2c',
  )

  const qqExecuteCalls = fetchCalls.filter(call => call.url.endsWith('/skill/execute') && call.body?.source === 'qq')
  assert.equal(qqExecuteCalls.length, 2)
  assert.equal(qqExecuteCalls[1]?.body?.sessionId, qqExecuteCalls[0]?.body?.sessionId)
  assert.equal(qqState.getUserState(qqStateKey).executeAwaitingInput, false)
  assert.ok(qqReplies.some(text => text.includes('方向4')))

  await qqHandler.handleQQMessage(
    qqClient as any,
    {
      id: 'qq-msg-3',
      author: { id: 'qq-user', username: 'boss' },
      content: '/home',
      channel_id: 'channel-c',
    },
    qqConfig as any,
    'c2c',
  )

  await qqHandler.handleQQMessage(
    qqClient as any,
    {
      id: 'qq-msg-4',
      author: { id: 'qq-user', username: 'boss' },
      content: '帮我重新路由一个新任务',
      channel_id: 'channel-d',
    },
    qqConfig as any,
    'c2c',
  )
  assert.ok(fetchCalls.some(call => call.url.endsWith('/converse') && call.body?.source === 'qq'))

  const qqExecuteCountBeforeAttachment = fetchCalls.filter(call => call.url.endsWith('/skill/execute') && call.body?.source === 'qq').length
  await qqHandler.handleQQMessage(
    qqClient as any,
    {
      id: 'qq-msg-5',
      author: { id: 'qq-user', username: 'boss' },
      content: '附件执行回归测试',
      channel_id: 'channel-e',
    },
    qqConfig as any,
    'c2c',
  )
  const qqAttachmentExecute = fetchCalls
    .filter(call => call.url.endsWith('/skill/execute') && call.body?.source === 'qq')
    .slice(qqExecuteCountBeforeAttachment)
  assert.equal(qqAttachmentExecute.length, 1)
  assert.match(String(qqAttachmentExecute[0]?.body?.query || ''), /\[LABORANY_FILE_IDS:\s*att-a,\s*att-b\]/)

  assert.equal(wechatState.buildUserStateKey('wechat-bot-1', 'wechat-user'), 'wechat-bot-1@@wechat-user')
  const wechatStateKey = wechatState.buildUserStateKey('wechat-bot-1', 'wechat-user')
  wechatState.resetUser(wechatStateKey)

  await wechatHandler.handleWechatMessage(
    wechatConfig as any,
    {
      message_id: 1,
      from_user_id: 'wechat-user',
      context_token: 'wechat-ctx-1',
      item_list: [
        {
          type: 1,
          text_item: { text: '/skill wechat-writer 创建一个关于ai搜索的文章' },
        },
      ],
    },
  )

  const wechatFirstState = wechatState.getUserState(wechatStateKey)
  assert.equal(wechatFirstState.activeSkillId, 'wechat-writer')
  assert.equal(wechatFirstState.executeAwaitingInput, true)
  assert.ok(wechatFirstState.executeSessionId)

  await wechatHandler.handleWechatMessage(
    wechatConfig as any,
    {
      message_id: 2,
      from_user_id: 'wechat-user',
      context_token: 'wechat-ctx-2',
      item_list: [
        {
          type: 1,
          text_item: { text: '方向4' },
        },
      ],
    },
  )

  const wechatExecuteCalls = fetchCalls.filter(call => call.url.endsWith('/skill/execute') && call.body?.source === 'wechat')
  assert.equal(wechatExecuteCalls.length, 2)
  assert.equal(wechatExecuteCalls[1]?.body?.sessionId, wechatExecuteCalls[0]?.body?.sessionId)
  assert.equal(wechatState.getUserState(wechatStateKey).executeAwaitingInput, false)
  assert.ok(wechatReplies.some(reply => extractWechatText(reply.itemList).includes('方向4')))

  await wechatHandler.handleWechatMessage(
    wechatConfig as any,
    {
      message_id: 3,
      from_user_id: 'wechat-user',
      context_token: 'wechat-ctx-3',
      item_list: [
        {
          type: 1,
          text_item: { text: '/cron help' },
        },
      ],
    },
  )
  assert.ok(wechatReplies.some(reply => extractWechatText(reply.itemList).includes('/cron create')))

  await wechatHandler.handleWechatMessage(
    wechatConfig as any,
    {
      message_id: 4,
      from_user_id: 'wechat-user',
      context_token: 'wechat-ctx-4',
      item_list: [
        {
          type: 1,
          text_item: { text: '/home' },
        },
      ],
    },
  )

  await wechatHandler.handleWechatMessage(
    wechatConfig as any,
    {
      message_id: 5,
      from_user_id: 'wechat-user',
      context_token: 'wechat-ctx-5',
      item_list: [
        {
          type: 1,
          text_item: { text: '帮我重新路由一个新任务' },
        },
      ],
    },
  )

  const wechatConverseCalls = fetchCalls.filter(call => call.url.endsWith('/converse') && call.body?.source === 'wechat')
  assert.ok(wechatConverseCalls.length >= 1)
  assert.equal(wechatConverseCalls[0]?.body?.context?.channel, 'wechat')
  assert.equal(wechatConverseCalls[0]?.body?.context?.capabilities?.canSendFile, true)
  assert.equal(wechatConverseCalls[0]?.body?.context?.capabilities?.canSendImage, true)

  const wechatExecuteCountBeforeAttachment = fetchCalls.filter(call => call.url.endsWith('/skill/execute') && call.body?.source === 'wechat').length
  await wechatHandler.handleWechatMessage(
    wechatConfig as any,
    {
      message_id: 6,
      from_user_id: 'wechat-user',
      context_token: 'wechat-ctx-6',
      item_list: [
        {
          type: 1,
          text_item: { text: '附件执行回归测试' },
        },
      ],
    },
  )
  const wechatAttachmentExecute = fetchCalls
    .filter(call => call.url.endsWith('/skill/execute') && call.body?.source === 'wechat')
    .slice(wechatExecuteCountBeforeAttachment)
  assert.equal(wechatAttachmentExecute.length, 1)
  assert.match(String(wechatAttachmentExecute[0]?.body?.query || ''), /\[LABORANY_FILE_IDS:\s*att-a,\s*att-b\]/)

  await wechatHandler.handleWechatMessage(
    wechatConfig as any,
    {
      message_id: 61,
      from_user_id: 'wechat-user',
      context_token: 'wechat-ctx-61',
      item_list: [
        {
          type: 1,
          text_item: { text: '/home' },
        },
      ],
    },
  )

  await wechatHandler.handleWechatMessage(
    wechatConfig as any,
    {
      message_id: 7,
      from_user_id: 'wechat-user',
      context_token: 'wechat-ctx-7',
      item_list: [
        {
          type: 1,
          text_item: { text: '文件直发回归测试' },
        },
      ],
    },
  )
  assert.ok(wechatReplies.some(reply => reply.itemList.some(item => item?.type === 4 && item?.file_item?.file_name === 'direct-send-report.md')))
  assert.ok(!wechatReplies.some(reply => extractWechatText(reply.itemList).includes('文件发送结果：成功 1，失败 0，未找到 0。')))

  console.log('verify-remote-bot-flow: PASS')
  console.log(`feishu replies: ${feishuReplies.length}, qq replies: ${qqReplies.length}, wechat replies: ${wechatReplies.length}`)
}

run()
  .catch((error) => {
    console.error('verify-remote-bot-flow: FAIL')
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    console.error = originalConsoleError
    globalThis.fetch = originalFetch
    rmSync(tempHome, { recursive: true, force: true })
  })
