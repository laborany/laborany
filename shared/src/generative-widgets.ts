import type { ModelInterfaceType } from './model-interface.js'

export type GenerativeWidgetCapability = 'disabled' | 'final_only' | 'full_stream'

export type GenerativeWidgetRuntime =
  | 'none'
  | 'claude_cli_mcp'

export type GenerativeWidgetProvider =
  | 'anthropic_official'
  | 'anthropic_compatible'
  | 'openai_compatible'

export type GenerativeWidgetDisabledReason =
  | 'not_requested'
  | 'unsupported_model'
  | 'unsupported_surface'

export interface GenerativeWidgetTarget {
  requested?: boolean
  interfaceType?: string | ModelInterfaceType
  model?: string
  baseUrl?: string
}

export interface GenerativeWidgetSupport {
  requested: boolean
  enabled: boolean
  capability: GenerativeWidgetCapability
  runtime: GenerativeWidgetRuntime
  provider: GenerativeWidgetProvider
  reason: GenerativeWidgetDisabledReason | null
  reasonMessage: string | null
}

const OFFICIAL_ANTHROPIC_BASE_URL_RE = /^https?:\/\/(?:[^/]+\.)?anthropic\.com(?:\/|$)/i
const OPENAI_COMPAT_REASONING_MODEL_RE = /(reasoner|reasoning|(?:^|[-_])r1(?:$|[-_])|(?:^|[-_])o1(?:$|[-_])|(?:^|[-_])o3(?:$|[-_])|qwq|thinking)/i

function normalizeGenerativeWidgetInterfaceType(value?: string | ModelInterfaceType): ModelInterfaceType {
  return value === 'openai_compatible' ? 'openai_compatible' : 'anthropic'
}

function isReasoningFocusedOpenAiModel(model?: string): boolean {
  const normalized = (model || '').trim()
  if (!normalized) return false
  return OPENAI_COMPAT_REASONING_MODEL_RE.test(normalized)
}

function isOfficialAnthropicBaseUrl(baseUrl?: string): boolean {
  const normalized = (baseUrl || '').trim()
  if (!normalized) return true
  return OFFICIAL_ANTHROPIC_BASE_URL_RE.test(normalized)
}

function createDisabledSupport(
  input: Pick<GenerativeWidgetSupport, 'requested' | 'provider'> & {
    reason: GenerativeWidgetDisabledReason
    reasonMessage: string
  },
): GenerativeWidgetSupport {
  return {
    requested: input.requested,
    enabled: false,
    capability: 'disabled',
    runtime: 'none',
    provider: input.provider,
    reason: input.reason,
    reasonMessage: input.reasonMessage,
  }
}

export function resolveGenerativeWidgetSupport(input?: GenerativeWidgetTarget | null): GenerativeWidgetSupport {
  const requested = input?.requested !== false
  const interfaceType = normalizeGenerativeWidgetInterfaceType(input?.interfaceType)
  const model = (input?.model || '').trim().toLowerCase()
  const provider: GenerativeWidgetProvider = interfaceType === 'openai_compatible'
    ? 'openai_compatible'
    : (isOfficialAnthropicBaseUrl(input?.baseUrl) ? 'anthropic_official' : 'anthropic_compatible')

  if (!requested) {
    return createDisabledSupport({
      requested,
      provider,
      reason: 'not_requested',
      reasonMessage: 'Generative UI was not requested for this session.',
    })
  }

  if (interfaceType === 'openai_compatible') {
    if (isReasoningFocusedOpenAiModel(model)) {
      return createDisabledSupport({
        requested,
        provider,
        reason: 'unsupported_model',
        reasonMessage: 'Reasoning-focused OpenAI-compatible models are treated as text-first profiles for now. Use a tool-calling chat model for widgets.',
      })
    }

    return {
      requested,
      enabled: true,
      capability: 'final_only',
      runtime: 'claude_cli_mcp',
      provider,
      reason: null,
      reasonMessage: null,
    }
  }

  return {
    requested,
    enabled: true,
    capability: provider === 'anthropic_official' && (!model || model.startsWith('claude'))
      ? 'full_stream'
      : 'final_only',
    runtime: 'claude_cli_mcp',
    provider,
    reason: null,
    reasonMessage: null,
  }
}

export function resolveExecuteGenerativeWidgetSupport(
  input?: GenerativeWidgetTarget | null,
): GenerativeWidgetSupport {
  const support = resolveGenerativeWidgetSupport(input)
  if (!support.enabled) {
    return support
  }

  if (support.runtime !== 'claude_cli_mcp') {
    return {
      ...support,
      enabled: false,
      capability: 'disabled',
      runtime: 'none',
      reason: support.reason || 'unsupported_surface',
      reasonMessage: 'Current execute surface only supports the Claude CLI widget runtime.',
    }
  }

  if (support.capability !== 'full_stream') {
    return {
      ...support,
      enabled: false,
      capability: 'disabled',
      runtime: 'none',
      reason: 'unsupported_surface',
      reasonMessage: '当前模型在 execute 页面会退化为文本解释。如需交互式可视化，请在首页对话中使用。',
    }
  }

  return support
}

export function supportsGenerativeWidgets(input?: GenerativeWidgetTarget | null): boolean {
  return resolveGenerativeWidgetSupport(input).enabled
}

export function supportsExecuteGenerativeWidgets(input?: GenerativeWidgetTarget | null): boolean {
  return resolveExecuteGenerativeWidgetSupport(input).enabled
}
