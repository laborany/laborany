/**
 * Generative UI — Module Entry
 */

export {
  getGuidelines,
  writeMcpConfig,
  writeUserMcpConfig,
  isWidgetTool,
  TOOL_LOAD_GUIDELINES,
  TOOL_SHOW_WIDGET,
  MCP_TOOL_PREFIX,
  AVAILABLE_MODULES,
} from './tools.js'

export {
  processStreamEvent,
  buildWidgetMeta,
  createWidgetHandlerState,
  type WidgetEvent,
  type WidgetStartEvent,
  type WidgetDeltaEvent,
  type WidgetCommitEvent,
  type WidgetErrorEvent,
  type WidgetHandlerState,
} from './handler.js'
