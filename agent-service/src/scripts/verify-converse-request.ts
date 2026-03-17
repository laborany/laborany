import { extractLatestUserMessageContent } from '../lib/converse-request.js'

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

function run(): void {
  const explicitUserTail = extractLatestUserMessageContent([
    { role: 'assistant', content: '上一轮回复' },
    { role: 'user', content: '你当前可用的tools和mcp有哪些' },
  ])
  assert(
    explicitUserTail === '你当前可用的tools和mcp有哪些',
    'should return the last non-empty user message',
  )

  const ignoreTrailingAssistant = extractLatestUserMessageContent([
    { role: 'user', content: '请解释复利' },
    { role: 'assistant', content: '尾部助手消息' },
  ])
  assert(
    ignoreTrailingAssistant === '请解释复利',
    'should ignore trailing assistant content when resolving latest user query',
  )

  const fallbackAnyContent = extractLatestUserMessageContent([
    { role: 'assistant', content: '只剩一条助手消息' },
  ])
  assert(
    fallbackAnyContent === '只剩一条助手消息',
    'should fall back to the latest non-empty content when no user message exists',
  )

  const emptyResult = extractLatestUserMessageContent([
    { role: 'assistant', content: '   ' },
    { role: 'user', content: '' },
    null,
  ])
  assert(emptyResult === '', 'should return empty string when no usable content exists')

  console.log('[verify-converse-request] passed')
}

run()
