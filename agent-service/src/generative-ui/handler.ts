/**
 * Generative UI — Widget Event Handler
 *
 * Processes CLI stream events to detect widget tool calls and emit
 * widget-specific SSE events (widget_start, widget_delta, widget_commit, widget_error).
 *
 * Based on spike findings:
 * - CLI may heavily buffer input_json_delta, but partial chunks still need to be handled
 * - Strategy: emit widget_start at tool_start, best-effort widget_delta during input_json_delta,
 *   and widget_commit on the final tool_use block
 * - Tool names have MCP prefix: mcp__generative-ui__show_widget
 */

import { randomUUID } from 'crypto'
import { TOOL_LOAD_GUIDELINES, TOOL_SHOW_WIDGET, isWidgetTool } from './tools.js'

// ── Widget event types (server → frontend SSE) ──

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

// ── Handler state ──

export interface WidgetHandlerState {
  /** Current widget ID being generated (null if none) */
  activeWidgetId: string | null
  /** The active tool use name, used to route partial JSON */
  activeToolName: string | null
  /** The active tool use id, when available */
  activeToolUseId: string | null
  /** Accumulated partial JSON for show_widget */
  partialJsonBuffer: string
  /** Last delta HTML already emitted */
  lastDeltaHtml: string
  /** Whether load_guidelines has been called this session */
  guidelinesLoaded: boolean
  /** The last committed widget (for session restore) */
  lastCommittedWidget: {
    widgetId: string
    title: string
    html: string
  } | null
}

export function createWidgetHandlerState(): WidgetHandlerState {
  return {
    activeWidgetId: null,
    activeToolName: null,
    activeToolUseId: null,
    partialJsonBuffer: '',
    lastDeltaHtml: '',
    guidelinesLoaded: false,
    lastCommittedWidget: null,
  }
}

// ── Stream event processing ──

/**
 * Content block from CLI stream_event.
 */
interface StreamContentBlock {
  type: string
  name?: string
  id?: string
  input?: Record<string, unknown>
  text?: string
}

function extractWidgetCode(partialJson: string): string | null {
  try {
    const data = JSON.parse(partialJson) as { widget_code?: unknown }
    return typeof data.widget_code === 'string' ? data.widget_code : null
  } catch {
    // Continue into partial parsing.
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

/**
 * Process a CLI stream event and optionally emit widget events.
 *
 * Called from the agent-executor's stream parsing loop.
 * Returns a WidgetEvent if this stream event triggers one, null otherwise.
 */
export function processStreamEvent(
  state: WidgetHandlerState,
  eventType: string,
  contentBlock?: StreamContentBlock,
  toolInput?: Record<string, unknown>,
): WidgetEvent | null {

  // ── content_block_start: detect widget tool calls ──
  if (eventType === 'content_block_start' && contentBlock?.type === 'tool_use') {
    const toolName = contentBlock.name || ''
    state.activeToolName = toolName || null
    state.activeToolUseId = contentBlock.id || null

    if (toolName === TOOL_LOAD_GUIDELINES) {
      state.guidelinesLoaded = true
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

  // ── tool_use complete (from assistant message): extract widget HTML ──
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

      if (!html) {
        state.activeWidgetId = null
        state.activeToolName = null
        state.activeToolUseId = null
        return {
          type: 'widget_error',
          widgetId,
          message: 'Widget code is empty',
        }
      }

      state.activeWidgetId = null
      state.activeToolName = null
      state.activeToolUseId = null
      state.partialJsonBuffer = ''
      state.lastDeltaHtml = html
      state.lastCommittedWidget = { widgetId, title, html }

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

/**
 * Build widget metadata for message persistence.
 * Stored in messages.meta for session restore.
 */
export function buildWidgetMeta(state: WidgetHandlerState): Record<string, unknown> | null {
  if (!state.lastCommittedWidget) return null
  return {
    widget: {
      widgetId: state.lastCommittedWidget.widgetId,
      title: state.lastCommittedWidget.title,
      html: state.lastCommittedWidget.html,
      status: 'ready',
    },
  }
}
