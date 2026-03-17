import { randomUUID } from 'crypto'
import { TOOL_LOAD_GUIDELINES, TOOL_SHOW_WIDGET } from './tools.js'

export interface WidgetStartEvent {
  type: 'widget_start'
  widgetId: string
  title: string
}

export interface WidgetCommitEvent {
  type: 'widget_commit'
  widgetId: string
  title: string
  html: string
}

export interface WidgetDeltaEvent {
  type: 'widget_delta'
  widgetId: string
  html: string
}

export interface WidgetErrorEvent {
  type: 'widget_error'
  widgetId: string
  message: string
}

export type WidgetEvent = WidgetStartEvent | WidgetDeltaEvent | WidgetCommitEvent | WidgetErrorEvent

export interface WidgetHandlerState {
  activeWidgetId: string | null
  activeToolName: string | null
  activeToolUseId: string | null
  partialJsonBuffer: string
  lastDeltaHtml: string
}

export function createWidgetHandlerState(): WidgetHandlerState {
  return {
    activeWidgetId: null,
    activeToolName: null,
    activeToolUseId: null,
    partialJsonBuffer: '',
    lastDeltaHtml: '',
  }
}

interface StreamContentBlock {
  type: string
  name?: string
  id?: string
}

function extractWidgetCode(partialJson: string): string | null {
  try {
    const data = JSON.parse(partialJson) as { widget_code?: unknown }
    return typeof data.widget_code === 'string' ? data.widget_code : null
  } catch {
    // Fall through into partial parsing.
  }

  const key = '"widget_code"'
  const keyIndex = partialJson.indexOf(key)
  if (keyIndex === -1) return null

  let cursor = partialJson.slice(keyIndex + key.length)
  const colonIndex = cursor.indexOf(':')
  if (colonIndex === -1) return null
  cursor = cursor.slice(colonIndex + 1).trimStart()
  if (!cursor.startsWith('"')) return null

  const content = cursor.slice(1)
  const out: string[] = []

  for (let index = 0; index < content.length; index++) {
    const char = content[index]
    if (char === '\\' && index + 1 < content.length) {
      const next = content[index + 1]
      const escapes: Record<string, string> = {
        n: '\n',
        r: '\r',
        t: '\t',
        b: '\b',
        f: '\f',
        '"': '"',
        '\\': '\\',
        '/': '/',
      }
      out.push(escapes[next] ?? next)
      index += 1
      continue
    }
    if (char === '"') break
    out.push(char)
  }

  const value = out.join('').trim()
  return value.length > 0 ? value : null
}

export function processStreamEvent(
  state: WidgetHandlerState,
  eventType: string,
  contentBlock?: StreamContentBlock,
  toolInput?: Record<string, unknown>,
): WidgetEvent | null {
  if (eventType === 'content_block_start' && contentBlock?.type === 'tool_use') {
    const toolName = contentBlock.name || ''
    state.activeToolName = toolName || null
    state.activeToolUseId = contentBlock.id || null

    if (toolName === TOOL_LOAD_GUIDELINES) {
      return null
    }

    if (toolName === TOOL_SHOW_WIDGET) {
      const widgetId = `w_${randomUUID().slice(0, 8)}`
      state.activeWidgetId = widgetId
      state.partialJsonBuffer = ''
      state.lastDeltaHtml = ''
      return {
        type: 'widget_start',
        widgetId,
        title: 'Loading...',
      }
    }
  }

  if (eventType === 'input_json_delta' && state.activeToolName === TOOL_SHOW_WIDGET) {
    const partialJson = typeof toolInput?.partial_json === 'string' ? toolInput.partial_json : ''
    if (!partialJson || !state.activeWidgetId) return null

    state.partialJsonBuffer += partialJson
    const html = extractWidgetCode(state.partialJsonBuffer)
    if (!html || html === state.lastDeltaHtml) return null

    state.lastDeltaHtml = html
    return {
      type: 'widget_delta',
      widgetId: state.activeWidgetId,
      html,
    }
  }

  if (eventType === 'tool_use_complete' && toolInput) {
    const toolName = (toolInput._toolName as string) || ''

    if (toolName === TOOL_LOAD_GUIDELINES) {
      state.activeToolName = null
      state.activeToolUseId = null
      return null
    }

    if (toolName === TOOL_SHOW_WIDGET) {
      const widgetId = state.activeWidgetId || `w_${randomUUID().slice(0, 8)}`
      const title = ((toolInput.title as string) || 'widget').replace(/_/g, ' ')
      const html = (toolInput.widget_code as string) || state.lastDeltaHtml || ''

      state.activeWidgetId = null
      state.activeToolName = null
      state.activeToolUseId = null
      state.partialJsonBuffer = ''

      if (!html) {
        state.lastDeltaHtml = ''
        return {
          type: 'widget_error',
          widgetId,
          message: 'Widget code is empty',
        }
      }

      state.lastDeltaHtml = html
      return {
        type: 'widget_commit',
        widgetId,
        title,
        html,
      }
    }
  }

  return null
}
