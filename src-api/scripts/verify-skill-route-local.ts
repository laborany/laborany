import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import skillRoutes from '../src/routes/skill.ts'
import { initDb } from '../src/core/database.ts'
import { runtimeTaskManager } from '../src/core/agent/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = join(__dirname, 'fixtures', 'skill-provision')

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

async function readFixture(file: string): Promise<string> {
  return readFile(join(FIXTURE_DIR, file), 'utf8')
}

async function postJson(path: string, payload: unknown): Promise<Response> {
  return skillRoutes.request(`http://local${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

function extractSsePayloads(raw: string): Array<Record<string, unknown>> {
  return raw
    .split('\n\n')
    .map(block => block
      .split('\n')
      .filter(line => line.startsWith('data: '))
      .map(line => line.slice('data: '.length))
      .join('\n')
      .trim())
    .filter(Boolean)
    .map(text => JSON.parse(text) as Record<string, unknown>)
}

async function readFirstSsePayload(response: Response): Promise<Record<string, unknown>> {
  assert(response.body, 'SSE response body is missing')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() || ''
      for (const block of blocks) {
        const line = block.split('\n').find(item => item.startsWith('data: '))
        if (!line) continue
        return JSON.parse(line.slice('data: '.length))
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
  }

  throw new Error('No SSE payload received')
}

async function waitForTaskStop(sessionId: string, timeoutMs = 3000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (!runtimeTaskManager.isRunning(sessionId)) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

await initDb()

const inlineSpec = await readFixture('eastmoney-inline.md')
const missingSource = await readFixture('install-without-source.txt')

const installRes = await postJson('/install', { source: inlineSpec })
assert(installRes.status === 400, `Expected /install inline spec to fail with 400, got ${installRes.status}`)
const installJson = await installRes.json()
assert(installJson.code === 'UNSUPPORTED_SOURCE', 'Inline spec should not be accepted by /install')

const missingRes = await postJson('/execute', {
  skill_id: 'skill-creator',
  query: missingSource,
})
const missingText = await missingRes.text()
const missingPayloads = extractSsePayloads(missingText)
const missingAssistantText = missingPayloads
  .filter(item => item.type === 'text')
  .map(item => String(item.content || ''))
  .join('\n')
assert(missingAssistantText.includes('已识别到你想安装 Skill，但我还缺安装来源。'), 'Missing-source SSE should include guidance')
assert(missingAssistantText.includes('GitHub 仓库/子目录'), 'Missing-source SSE should include GitHub guidance')

const inlineRes = await postJson('/execute', {
  skill_id: 'skill-creator',
  query: inlineSpec,
})
const firstPayload = await readFirstSsePayload(inlineRes)
assert(firstPayload.type === 'session', 'Inline-spec execute should start a runtime session')
const sessionId = String(firstPayload.sessionId || '')
assert(sessionId, 'Inline-spec execute should return a session id')

const snapshot = runtimeTaskManager.getLiveSnapshot(sessionId)
assert(snapshot, 'Runtime snapshot should exist for inline-spec session')
assert(snapshot.query.includes('不要把文中的 API URL、curl 示例、接口地址当作下载来源。'), 'Inline-spec query should include no-download-source constraint')
assert(snapshot.query.includes('用户提供的原始 Skill 规范'), 'Inline-spec query should embed raw skill spec')
assert(snapshot.query.includes('东方财富资讯搜索'), 'Inline-spec query should preserve original skill content')

runtimeTaskManager.stop(sessionId)
await waitForTaskStop(sessionId)

console.log(JSON.stringify({
  install: installJson,
  missingSourcePreview: missingAssistantText.slice(0, 120),
  inlineSessionId: sessionId,
  inlineQueryPreview: snapshot.query.slice(0, 180),
}, null, 2))

process.exit(0)
