import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempHome = mkdtempSync(join(tmpdir(), 'laborany-remote-bot-'))
process.env.LABORANY_HOME = tempHome
process.env.SRC_API_BASE_URL = 'http://127.0.0.1:3620/api'
process.env.AGENT_SERVICE_URL = 'http://127.0.0.1:3002'

type FetchCall = {
  url: string
  method: string
  body?: any
}

const fetchCalls: FetchCall[] = []
let mockMessageSeq = 0

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
    return createSseResponse([
      { type: 'text', content: '路由器已接管这条新需求。' },
      { type: 'done' },
    ])
  }

  if (/\/skill\/stop\/[^/]+$/.test(url)) {
    return createJsonResponse({ success: true })
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
        { type: 'state', phase: 'waiting_input' },
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

async function run(): Promise<void> {
  const feishuHandler = await import('../agent-service/src/feishu/handler.ts')
  const feishuState = await import('../agent-service/src/feishu/index.ts')
  const qqHandler = await import('../agent-service/src/qq/handler.ts')
  const qqState = await import('../agent-service/src/qq/index.ts')
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

  const { client: feishuClient, sentTexts: feishuReplies } = createFeishuClient()
  const { client: qqClient, sentTexts: qqReplies } = createQQClient()

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
        chat_id: 'chat-1',
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

  console.log('verify-remote-bot-flow: PASS')
  console.log(`feishu replies: ${feishuReplies.length}, qq replies: ${qqReplies.length}`)
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
