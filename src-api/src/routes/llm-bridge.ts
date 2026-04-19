import { createHash, randomUUID } from 'crypto'
import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { decodeOpenAiBridgeApiKey } from 'laborany-shared'

interface AnthropicRequestBody {
  model?: string
  messages?: unknown[]
  system?: unknown
  thinking?: unknown
  reasoning_effort?: unknown
  tools?: unknown[]
  tool_choice?: unknown
  max_tokens?: number
  temperature?: number
  top_p?: number
  stream?: boolean
}

interface AnthropicResponseBody {
  id: string
  type: 'message'
  role: 'assistant'
  model: string
  content: Array<Record<string, unknown>>
  stop_reason: 'end_turn' | 'max_tokens' | 'tool_use'
  stop_sequence: null
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

const router = new Hono()

const RESPONSE_CACHE_TTL_MS = 15_000
const responseCache = new Map<string, { expiresAt: number; payload: AnthropicResponseBody }>()

function removeExpiredCacheEntries(): void {
  const now = Date.now()
  for (const [key, value] of responseCache.entries()) {
    if (value.expiresAt <= now) {
      responseCache.delete(key)
    }
  }
}

function toSha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function normalizeOpenAiBaseUrl(baseUrl?: string): string {
  return (baseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '')
}

type OpenAiProviderKind = 'generic' | 'deepseek' | 'zhipu_glm' | 'anthropic'

interface OpenAiProviderCapabilities {
  kind: OpenAiProviderKind
  includeReasoningContent: boolean
  requireReasoningContentForToolCalls: boolean
  supportsThinkingConfig: boolean
  isNativeAnthropic: boolean
}

const OPENAI_BRIDGE_DEFAULT_TIMEOUT_MS = 120_000
const OPENAI_BRIDGE_SLOW_REASONING_TIMEOUT_MS = 240_000

function detectOpenAiProviderCapabilities(baseUrl?: string, model?: string): OpenAiProviderCapabilities {
  const normalizedBaseUrl = normalizeOpenAiBaseUrl(baseUrl).toLowerCase()
  const normalizedModel = (model || '').trim().toLowerCase()

  const isAnthropic = normalizedBaseUrl.includes('anthropic.com')
    || normalizedBaseUrl.includes('api.anthropic')
    || normalizedModel.startsWith('claude-')
  if (isAnthropic) {
    return {
      kind: 'anthropic',
      includeReasoningContent: false,
      requireReasoningContentForToolCalls: false,
      supportsThinkingConfig: false,
      isNativeAnthropic: true,
    }
  }

  const isDeepSeek = normalizedBaseUrl.includes('deepseek') || normalizedModel.includes('deepseek')
  if (isDeepSeek) {
    return {
      kind: 'deepseek',
      includeReasoningContent: true,
      requireReasoningContentForToolCalls: true,
      supportsThinkingConfig: false,
      isNativeAnthropic: false,
    }
  }

  const isZhipuGlm = normalizedBaseUrl.includes('z.ai')
    || normalizedBaseUrl.includes('bigmodel.cn')
    || normalizedModel.startsWith('glm-')
  if (isZhipuGlm) {
    return {
      kind: 'zhipu_glm',
      includeReasoningContent: true,
      requireReasoningContentForToolCalls: false,
      supportsThinkingConfig: true,
      isNativeAnthropic: false,
    }
  }

  return {
    kind: 'generic',
    includeReasoningContent: false,
    requireReasoningContentForToolCalls: false,
    supportsThinkingConfig: false,
    isNativeAnthropic: false,
  }
}

function getOpenAiUpstreamTimeoutMs(
  provider: OpenAiProviderCapabilities,
  model?: string,
): number {
  const normalizedModel = (model || '').trim().toLowerCase()

  if (provider.kind === 'deepseek' && normalizedModel.includes('reasoner')) {
    return OPENAI_BRIDGE_SLOW_REASONING_TIMEOUT_MS
  }

  return OPENAI_BRIDGE_DEFAULT_TIMEOUT_MS
}

function getAnthropicThinkingMode(thinking: unknown): 'enabled' | 'disabled' | 'unset' {
  if (!thinking || typeof thinking !== 'object') return 'unset'
  const value = thinking as Record<string, unknown>
  const type = typeof value.type === 'string' ? value.type.trim().toLowerCase() : ''
  if (type === 'enabled') return 'enabled'
  if (type === 'disabled') return 'disabled'
  return 'unset'
}

function shouldEnablePreservedThinking(
  provider: OpenAiProviderCapabilities,
  anthropicThinkingMode: 'enabled' | 'disabled' | 'unset',
): boolean {
  if (provider.kind !== 'zhipu_glm') return false
  return anthropicThinkingMode !== 'disabled'
}

function buildOpenAiChatCompletionsUrl(baseUrl?: string): string {
  const normalized = normalizeOpenAiBaseUrl(baseUrl)
  if (/\/chat\/completions$/i.test(normalized)) {
    return normalized
  }
  if (/\/v1$/i.test(normalized)) {
    return `${normalized}/chat/completions`
  }
  return `${normalized}/v1/chat/completions`
}

function normalizeAnthropicTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  const chunks: string[] = []
  for (const item of content) {
    if (typeof item === 'string') {
      chunks.push(item)
      continue
    }
    if (!item || typeof item !== 'object') continue
    const block = item as Record<string, unknown>
    if (block.type === 'text' && typeof block.text === 'string') {
      chunks.push(block.text)
    }
  }
  return chunks.join('\n').trim()
}

function normalizeToolResultContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const chunks: string[] = []
    for (const block of content) {
      if (!block || typeof block !== 'object') continue
      const item = block as Record<string, unknown>
      if (item.type === 'text' && typeof item.text === 'string') {
        chunks.push(item.text)
      }
    }
    if (chunks.length > 0) return chunks.join('\n')
  }
  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

function normalizeSystemPrompt(system: unknown): string | undefined {
  if (typeof system === 'string') return system.trim() || undefined
  const text = normalizeAnthropicTextContent(system)
  return text || undefined
}

interface OpenAiMessageMappingOptions {
  includeReasoningContent?: boolean
  requireReasoningContentForToolCalls?: boolean
}

function normalizeAnthropicThinkingContent(block: Record<string, unknown>): string | undefined {
  if (typeof block.thinking === 'string') return block.thinking
  if (typeof block.text === 'string') return block.text
  return undefined
}

function mapAnthropicMessagesToOpenAi(messages: unknown[], options?: OpenAiMessageMappingOptions): unknown[] {
  const includeReasoningContent = Boolean(options?.includeReasoningContent)
  const requireReasoningContentForToolCalls = Boolean(options?.requireReasoningContentForToolCalls)
  const result: unknown[] = []

  for (const rawMessage of messages) {
    if (!rawMessage || typeof rawMessage !== 'object') continue
    const message = rawMessage as Record<string, unknown>
    const role = typeof message.role === 'string' ? message.role : ''
    const content = Array.isArray(message.content) ? message.content : []

    if (role === 'assistant') {
      const textParts: string[] = []
      const thinkingParts: string[] = []
      const toolCalls: unknown[] = []
      const topLevelReasoning = typeof message.reasoning_content === 'string'
        ? message.reasoning_content
        : undefined

      for (const rawBlock of content) {
        if (!rawBlock || typeof rawBlock !== 'object') continue
        const block = rawBlock as Record<string, unknown>
        if (block.type === 'text' && typeof block.text === 'string') {
          textParts.push(block.text)
          continue
        }
        if (block.type === 'thinking') {
          const thinkingText = normalizeAnthropicThinkingContent(block)
          if (thinkingText !== undefined) thinkingParts.push(thinkingText)
          continue
        }
        if (block.type !== 'tool_use') continue

        const name = typeof block.name === 'string' ? block.name.trim() : ''
        if (!name) continue
        const id = typeof block.id === 'string' && block.id.trim() ? block.id : `call_${randomUUID()}`
        const input = block.input && typeof block.input === 'object'
          ? block.input
          : {}

        toolCalls.push({
          id,
          type: 'function',
          function: {
            name,
            arguments: JSON.stringify(input),
          },
        })
      }

      const joinedText = textParts.join('\n')
      const blockReasoning = thinkingParts.length > 0 ? thinkingParts.join('') : undefined
      const reasoningContent = topLevelReasoning ?? blockReasoning
      const hasReasoningContent = reasoningContent !== undefined
      const shouldAttachReasoning = includeReasoningContent
        && (hasReasoningContent || (requireReasoningContentForToolCalls && toolCalls.length > 0))
      const hasAssistantPayload = Boolean(joinedText)
        || toolCalls.length > 0
        || shouldAttachReasoning

      if (hasAssistantPayload) {
        result.push({
          role: 'assistant',
          content: joinedText || (shouldAttachReasoning ? '' : null),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
          ...(shouldAttachReasoning
            ? { reasoning_content: reasoningContent ?? joinedText ?? '' }
            : {}),
        })
      }

      continue
    }

    if (role !== 'user') continue

    let textParts: string[] = []
    const flushUserText = () => {
      if (textParts.length === 0) return
      result.push({ role: 'user', content: textParts.join('\n') })
      textParts = []
    }

    for (const rawBlock of content) {
      if (!rawBlock || typeof rawBlock !== 'object') continue
      const block = rawBlock as Record<string, unknown>

      if (block.type === 'text' && typeof block.text === 'string') {
        textParts.push(block.text)
        continue
      }

      if (block.type !== 'tool_result') continue
      flushUserText()

      const toolCallId = typeof block.tool_use_id === 'string' ? block.tool_use_id.trim() : ''
      if (!toolCallId) continue

      result.push({
        role: 'tool',
        tool_call_id: toolCallId,
        content: normalizeToolResultContent(block.content),
      })
    }

    flushUserText()
  }

  return result
}

function mapAnthropicToolsToOpenAi(tools: unknown[]): unknown[] | undefined {
  const mapped = tools
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null
      const item = raw as Record<string, unknown>
      const name = typeof item.name === 'string' ? item.name.trim() : ''
      if (!name) return null

      const description = typeof item.description === 'string' ? item.description : undefined
      const inputSchema = item.input_schema && typeof item.input_schema === 'object'
        ? item.input_schema
        : { type: 'object', properties: {} }

      return {
        type: 'function',
        function: {
          name,
          ...(description ? { description } : {}),
          parameters: inputSchema,
        },
      }
    })
    .filter(Boolean)

  return mapped.length > 0 ? mapped : undefined
}

function mapAnthropicToolChoiceToOpenAi(toolChoice: unknown): unknown {
  if (!toolChoice) return undefined

  if (typeof toolChoice === 'string') {
    if (toolChoice === 'auto' || toolChoice === 'none') return toolChoice
    if (toolChoice === 'any') return 'required'
    return undefined
  }

  if (!toolChoice || typeof toolChoice !== 'object') return undefined
  const choice = toolChoice as Record<string, unknown>
  const type = typeof choice.type === 'string' ? choice.type : ''

  if (type === 'auto' || type === 'none') return type
  if (type === 'any') return 'required'
  if (type !== 'tool') return undefined

  const name = typeof choice.name === 'string' ? choice.name.trim() : ''
  if (!name) return undefined

  return {
    type: 'function',
    function: { name },
  }
}

function parseOpenAiToolArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }

  if (typeof raw !== 'string') return {}
  const text = raw.trim()
  if (!text) return {}

  try {
    const parsed = JSON.parse(text) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // ignore JSON parse error
  }

  return { raw_arguments: text }
}

function normalizeOpenAiContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  const chunks: string[] = []
  for (const item of content) {
    if (typeof item === 'string') {
      chunks.push(item)
      continue
    }
    if (!item || typeof item !== 'object') continue
    const block = item as Record<string, unknown>
    if (block.type === 'text' && typeof block.text === 'string') {
      chunks.push(block.text)
    }
  }
  return chunks.join('\n').trim()
}

function normalizeOpenAiReasoningContent(message: Record<string, unknown>): string | undefined {
  if (typeof message.reasoning_content === 'string') {
    return message.reasoning_content
  }

  const reasoning = message.reasoning
  if (typeof reasoning === 'string') {
    return reasoning
  }

  if (Array.isArray(reasoning)) {
    const parts: string[] = []
    for (const item of reasoning) {
      if (typeof item === 'string') {
        parts.push(item)
        continue
      }
      if (!item || typeof item !== 'object') continue
      const block = item as Record<string, unknown>
      if (typeof block.content === 'string') {
        parts.push(block.content)
      } else if (typeof block.text === 'string') {
        parts.push(block.text)
      }
    }
    if (parts.length > 0) return parts.join('')
  }

  return undefined
}

function mapOpenAiResponseToAnthropic(payload: Record<string, unknown>, fallbackModel: string): AnthropicResponseBody {
  const choices = Array.isArray(payload.choices) ? payload.choices : []
  const firstChoice = (choices[0] && typeof choices[0] === 'object')
    ? choices[0] as Record<string, unknown>
    : {}

  const message = (firstChoice.message && typeof firstChoice.message === 'object')
    ? firstChoice.message as Record<string, unknown>
    : {}
  const usage = (payload.usage && typeof payload.usage === 'object')
    ? payload.usage as Record<string, unknown>
    : {}

  const content: Array<Record<string, unknown>> = []
  const reasoning = normalizeOpenAiReasoningContent(message)
  if (reasoning !== undefined) {
    content.push({
      type: 'thinking',
      thinking: reasoning,
    })
  }
  const text = normalizeOpenAiContent(message.content)
  if (text) {
    content.push({ type: 'text', text })
  }

  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : []
  for (const rawToolCall of toolCalls) {
    if (!rawToolCall || typeof rawToolCall !== 'object') continue
    const toolCall = rawToolCall as Record<string, unknown>
    const fn = (toolCall.function && typeof toolCall.function === 'object')
      ? toolCall.function as Record<string, unknown>
      : {}
    const name = typeof fn.name === 'string' ? fn.name.trim() : ''
    if (!name) continue

    const id = typeof toolCall.id === 'string' && toolCall.id.trim()
      ? toolCall.id
      : `toolu_${randomUUID()}`
    const input = parseOpenAiToolArguments(fn.arguments)
    content.push({
      type: 'tool_use',
      id,
      name,
      input,
    })
  }

  if (content.length === 0) {
    content.push({ type: 'text', text: '' })
  }

  const finishReason = typeof firstChoice.finish_reason === 'string' ? firstChoice.finish_reason : ''
  const stopReason: AnthropicResponseBody['stop_reason'] = (
    toolCalls.length > 0 || finishReason === 'tool_calls'
  )
    ? 'tool_use'
    : (finishReason === 'length' ? 'max_tokens' : 'end_turn')

  const inputTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0
  const outputTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0

  return {
    id: typeof payload.id === 'string' ? payload.id : `msg_${randomUUID()}`,
    type: 'message',
    role: 'assistant',
    model: typeof payload.model === 'string' ? payload.model : fallbackModel,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  }
}

function parseErrorMessage(rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>
    const topMessage = typeof parsed.message === 'string' ? parsed.message : ''
    if (topMessage) return topMessage
    const error = parsed.error
    if (error && typeof error === 'object') {
      const message = (error as Record<string, unknown>).message
      if (typeof message === 'string' && message.trim()) return message
    }
  } catch {
    // ignore parse failure
  }
  return rawBody || 'upstream request failed'
}

function buildAnthropicError(status: number, message: string): Record<string, unknown> {
  const type = (
    status === 401 || status === 403 ? 'authentication_error'
      : status === 429 ? 'rate_limit_error'
        : status === 400 || status === 404 || status === 422 ? 'invalid_request_error'
          : 'api_error'
  )

  return {
    type: 'error',
    error: {
      type,
      message,
    },
  }
}

router.post('/anthropic/v1/messages', async (c) => {
  let body: AnthropicRequestBody
  try {
    body = await c.req.json<AnthropicRequestBody>()
  } catch {
    return c.json(buildAnthropicError(400, 'invalid JSON body'), 400)
  }

  const incomingKey = (c.req.header('x-api-key') || '').trim()
  if (!incomingKey) {
    return c.json(buildAnthropicError(401, 'x-api-key is required'), 401)
  }

  const bridgePayload = decodeOpenAiBridgeApiKey(incomingKey)
  const upstreamApiKey = bridgePayload?.apiKey || incomingKey
  const upstreamBaseUrl = normalizeOpenAiBaseUrl(bridgePayload?.baseUrl)
  const model = (body.model || bridgePayload?.model || '').trim()
  const reasoningEffort = (
    typeof body.reasoning_effort === 'string'
      ? body.reasoning_effort
      : bridgePayload?.reasoningEffort
  )?.trim()
  const provider = detectOpenAiProviderCapabilities(upstreamBaseUrl, model)
  const anthropicThinkingMode = getAnthropicThinkingMode(body.thinking)
  const preservedThinkingEnabled = shouldEnablePreservedThinking(provider, anthropicThinkingMode)

  if (!model) {
    return c.json(buildAnthropicError(400, 'model is required'), 400)
  }

  const messages = Array.isArray(body.messages) ? body.messages : []
  if (messages.length === 0) {
    return c.json(buildAnthropicError(400, 'messages is required'), 400)
  }

  const normalizedRequestForKey: Record<string, unknown> = {
    model,
    system: body.system,
    thinking: body.thinking,
    messages,
    tools: Array.isArray(body.tools) ? body.tools : undefined,
    tool_choice: body.tool_choice,
    temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
    top_p: typeof body.top_p === 'number' ? body.top_p : undefined,
    reasoning_effort: reasoningEffort,
  }

  removeExpiredCacheEntries()
  const cacheKey = toSha256(JSON.stringify({
    upstreamBaseUrl,
    upstreamApiKeyHash: toSha256(upstreamApiKey),
    request: normalizedRequestForKey,
  }))
  const cached = responseCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return c.json(cached.payload)
  }

  if (provider.isNativeAnthropic) {
    const upstreamUrl = `${upstreamBaseUrl}/v1/messages`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': upstreamApiKey,
      'anthropic-version': '2023-06-01',
    }

    const anthropicBeta = c.req.header('anthropic-beta')
    if (anthropicBeta) {
      headers['anthropic-beta'] = anthropicBeta
    } else {
      headers['anthropic-beta'] = 'prompt-caching-2024-07-31'
    }

    let upstreamResponse: Response
    try {
      upstreamResponse = await fetch(upstreamUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(OPENAI_BRIDGE_DEFAULT_TIMEOUT_MS),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'upstream request failed'
      return c.json(buildAnthropicError(502, message), 502)
    }

    const rawBody = await upstreamResponse.text()
    if (!upstreamResponse.ok) {
      const status = upstreamResponse.status as ContentfulStatusCode
      return c.json(
        buildAnthropicError(status, parseErrorMessage(rawBody)),
        status,
      )
    }

    let anthropicResponse: AnthropicResponseBody
    try {
      anthropicResponse = rawBody ? JSON.parse(rawBody) as AnthropicResponseBody : {} as AnthropicResponseBody
    } catch {
      return c.json(buildAnthropicError(502, 'upstream returned invalid JSON'), 502)
    }

    responseCache.set(cacheKey, {
      expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS,
      payload: anthropicResponse,
    })

    return c.json(anthropicResponse)
  }

  const openAiMessages = mapAnthropicMessagesToOpenAi(messages, {
    includeReasoningContent: provider.includeReasoningContent && (provider.kind !== 'zhipu_glm' || preservedThinkingEnabled),
    requireReasoningContentForToolCalls: provider.requireReasoningContentForToolCalls,
  })
  const systemPrompt = normalizeSystemPrompt(body.system)
  if (systemPrompt) {
    openAiMessages.unshift({
      role: 'system',
      content: systemPrompt,
    })
  }

  const openAiRequest: Record<string, unknown> = {
    model,
    messages: openAiMessages,
    stream: false,
  }

  if (provider.supportsThinkingConfig && preservedThinkingEnabled) {
    openAiRequest.thinking = {
      type: 'enabled',
      clear_thinking: false,
    }
  }

  if (typeof body.max_tokens === 'number' && Number.isFinite(body.max_tokens)) {
    openAiRequest.max_tokens = body.max_tokens
  }
  if (typeof body.temperature === 'number' && Number.isFinite(body.temperature)) {
    openAiRequest.temperature = body.temperature
  }
  if (typeof body.top_p === 'number' && Number.isFinite(body.top_p)) {
    openAiRequest.top_p = body.top_p
  }
  if (reasoningEffort === 'low' || reasoningEffort === 'medium' || reasoningEffort === 'high') {
    openAiRequest.reasoning_effort = reasoningEffort
  }

  const tools = mapAnthropicToolsToOpenAi(Array.isArray(body.tools) ? body.tools : [])
  if (tools) openAiRequest.tools = tools

  const toolChoice = mapAnthropicToolChoiceToOpenAi(body.tool_choice)
  if (toolChoice !== undefined) {
    openAiRequest.tool_choice = toolChoice
  }

  const upstreamUrl = buildOpenAiChatCompletionsUrl(upstreamBaseUrl)
  const upstreamTimeoutMs = getOpenAiUpstreamTimeoutMs(provider, model)

  let upstreamResponse: Response
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${upstreamApiKey}`,
      },
      body: JSON.stringify(openAiRequest),
      signal: AbortSignal.timeout(upstreamTimeoutMs),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'upstream request failed'
    return c.json(buildAnthropicError(502, message), 502)
  }

  const rawBody = await upstreamResponse.text()
  if (!upstreamResponse.ok) {
    const status = upstreamResponse.status as ContentfulStatusCode
    return c.json(
      buildAnthropicError(status, parseErrorMessage(rawBody)),
      status,
    )
  }

  let parsed: Record<string, unknown>
  try {
    parsed = rawBody ? JSON.parse(rawBody) as Record<string, unknown> : {}
  } catch {
    return c.json(buildAnthropicError(502, 'upstream returned invalid JSON'), 502)
  }

  const anthropicResponse = mapOpenAiResponseToAnthropic(parsed, model)
  responseCache.set(cacheKey, {
    expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS,
    payload: anthropicResponse,
  })

  return c.json(anthropicResponse)
})

export default router
