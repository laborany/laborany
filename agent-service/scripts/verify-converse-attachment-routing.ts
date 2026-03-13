import assert from 'assert'
import express from 'express'
import type { AddressInfo } from 'net'
import { converseRouter } from '../src/routes/index.js'

interface RecordedRequest {
  url: string
  body: Record<string, unknown>
}

function parseSse(text: string): Array<{ event: string; data: Record<string, unknown> }> {
  return text
    .trim()
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const lines = block.split(/\r?\n/)
      let event = ''
      let dataText = ''
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        if (line.startsWith('data:')) dataText += line.slice(5).trimStart()
      }
      return {
        event,
        data: dataText ? JSON.parse(dataText) as Record<string, unknown> : {},
      }
    })
    .filter((item) => item.event)
}

async function main() {
  const recorded: RecordedRequest[] = []
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const bodyText = typeof init?.body === 'string' ? init.body : ''
    const body = bodyText ? JSON.parse(bodyText) as Record<string, unknown> : {}
    recorded.push({ url, body })

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  const app = express()
  app.use(express.json())
  app.use('/converse', converseRouter)

  const server = app.listen(0)

  try {
    const port = (server.address() as AddressInfo).port
    const response = await originalFetch(`http://127.0.0.1:${port}/converse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: '不要创建，直接执行这个任务' },
        ],
        attachmentIds: ['att-1', 'att-2'],
        context: {
          channel: 'desktop',
          locale: 'zh-CN',
          capabilities: {
            canSendFile: false,
            canSendImage: false,
          },
        },
      }),
    })

    const bodyText = await response.text()
    const events = parseSse(bodyText)
    const actionEvent = events.find((item) => item.event === 'action')
    const upsertRequest = recorded.find((item) => item.url.endsWith('/sessions/external/upsert'))

    assert.ok(actionEvent, 'missing action SSE event')
    assert.deepStrictEqual(actionEvent?.data.attachmentIds, ['att-1', 'att-2'])
    assert.ok(upsertRequest, 'missing external upsert request')
    assert.deepStrictEqual(
      (upsertRequest?.body.sourceMeta as { attachmentIds?: string[] } | undefined)?.attachmentIds,
      ['att-1', 'att-2'],
    )

    console.log(JSON.stringify({
      events,
      upsertSourceMeta: upsertRequest?.body.sourceMeta,
    }, null, 2))
  } finally {
    globalThis.fetch = originalFetch
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

void main()
