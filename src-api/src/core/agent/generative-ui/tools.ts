import { writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { readClaudeSettings } from '../mcp/settings-io.js'

const GUIDELINES_CORE = `# Widget Design Guidelines - Core

You are generating HTML widget fragments that render inside a sandboxed iframe.

## Structure Rules

- Output an HTML fragment only. No \`<!DOCTYPE>\`, \`<html>\`, \`<head>\`, or \`<body>\` tags.
- Order: \`<style>\` block first, then HTML content, then \`<script>\` last.
- Keep everything in a single fragment. No external files.

## Styling

- Use CSS variables for colors:
  - \`var(--color-bg)\`
  - \`var(--color-surface)\`
  - \`var(--color-text)\`
  - \`var(--color-text-muted)\`
  - \`var(--color-accent)\`
  - \`var(--color-border)\`
  - \`var(--color-success)\`
  - \`var(--color-warning)\`
  - \`var(--color-danger)\`
- No gradients, shadows, or blur effects.
- Use \`system-ui, -apple-system, sans-serif\`.
- Use \`box-sizing: border-box\` on all elements.

## Layout

- Max width 600px, centered with \`margin: 0 auto\`.
- Keep widgets focused on one clear purpose.

## Scripting

- Use vanilla JS only.
- Use \`window.sendToAgent(data)\` for meaningful user interactions only.
- Do not auto-send on initial render.

## Accessibility

- Use semantic HTML.
- Add labels and keyboard support where needed.`

const GUIDELINES_INTERACTIVE = `# Widget Design Guidelines - Interactive

For calculators, forms, configurators, and interactive tools.

- Use labels for inputs.
- Prefer full-width primary actions.
- Put calculation results in a distinct result area.
- Send data back only on meaningful completion events.`

const GUIDELINES_CHART = `# Widget Design Guidelines - Chart

For charts and visualizations.

- Use inline SVG or Canvas only.
- Label axes and values clearly.
- Prefer accent color plus opacity variants for multiple series.`

const GUIDELINES_DIAGRAM = `# Widget Design Guidelines - Diagram

For flowcharts and process diagrams.

- Use inline SVG only.
- Keep node spacing consistent.
- Use muted strokes and clear labels.`

const GUIDELINES_LAYOUT = `# Widget Design Guidelines - Layout

Common layout patterns for widget composition.

- Use flexbox or grid for structured layouts.
- Prefer responsive wrapping over fixed widths.
- Keep spacing consistent within one widget.`

const GUIDELINES_DATA_TABLE = `# Widget Design Guidelines - Data Table

For sortable or filterable tables.

- Use semantic \`table\` markup.
- Add horizontal scrolling on narrow viewports.
- Support sorting and lightweight text filtering in vanilla JS.`

const GUIDELINES_MAP: Record<string, string> = {
  core: GUIDELINES_CORE,
  interactive: GUIDELINES_INTERACTIVE,
  chart: GUIDELINES_CHART,
  diagram: GUIDELINES_DIAGRAM,
  layout: GUIDELINES_LAYOUT,
  'data-table': GUIDELINES_DATA_TABLE,
}

export const MCP_TOOL_PREFIX = 'mcp__generative-ui__'
export const TOOL_LOAD_GUIDELINES = `${MCP_TOOL_PREFIX}load_guidelines`
export const TOOL_SHOW_WIDGET = `${MCP_TOOL_PREFIX}show_widget`

export function isWidgetTool(toolName: string): boolean {
  return toolName === TOOL_LOAD_GUIDELINES || toolName === TOOL_SHOW_WIDGET
}

function buildMcpServerScript(): string {
  const guidelinesJson = JSON.stringify(GUIDELINES_MAP)
  return `#!/usr/bin/env node
const GUIDELINES_MAP = ${guidelinesJson};

function buildGuidelines(modules) {
  const parts = [GUIDELINES_MAP.core];
  for (const mod of Array.isArray(modules) ? modules : []) {
    if (typeof mod === 'string' && GUIDELINES_MAP[mod]) parts.push(GUIDELINES_MAP[mod]);
  }
  return parts.join('\\n\\n---\\n\\n');
}

function writeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  process.stdout.write('Content-Length: ' + body.length + '\\r\\n\\r\\n');
  process.stdout.write(body);
}

function sendResponse(id, result) {
  writeMessage({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message) {
  writeMessage({ jsonrpc: '2.0', id, error: { code, message } });
}

function getTools() {
  return [
    {
      name: 'load_guidelines',
      description: 'Load design guidelines before rendering your first widget. This is an MCP tool. Call it directly, not through the built-in Skill tool. Call once silently and do not mention it to the user.',
      inputSchema: {
        type: 'object',
        properties: {
          modules: {
            type: 'array',
            items: { type: 'string', enum: ['interactive', 'chart', 'diagram', 'layout', 'data-table'] },
            description: 'Which design modules to load.'
          }
        },
        required: ['modules'],
        additionalProperties: false
      }
    },
    {
      name: 'show_widget',
      description: 'Render an interactive HTML widget or SVG diagram visible to the user. This is an MCP tool. Call it directly, not through the built-in Skill tool. Always call load_guidelines before first use.',
      inputSchema: {
        type: 'object',
        properties: {
          i_have_seen_guidelines: {
            type: 'boolean',
            description: 'Confirm you already called load_guidelines in this conversation.'
          },
          title: {
            type: 'string',
            description: 'Short snake_case identifier for this widget.'
          },
          widget_code: {
            type: 'string',
            description: 'HTML fragment to render. Order: style, HTML, script.'
          }
        },
        required: ['i_have_seen_guidelines', 'title', 'widget_code'],
        additionalProperties: false
      }
    }
  ];
}

function handleMessage(message) {
  const method = message && message.method;
  if (method === 'initialize') {
    sendResponse(message.id, {
      protocolVersion: (message.params && message.params.protocolVersion) || '2024-11-05',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'generative-ui', version: '0.1.0' }
    });
    return;
  }
  if (method === 'notifications/initialized') {
    return;
  }
  if (method === 'ping') {
    sendResponse(message.id, {});
    return;
  }
  if (method === 'tools/list') {
    sendResponse(message.id, { tools: getTools() });
    return;
  }
  if (method === 'tools/call') {
    const params = message.params || {};
    const name = params.name;
    const args = params.arguments || {};
    if (name === 'load_guidelines') {
      const text = buildGuidelines(args.modules);
      sendResponse(message.id, { content: [{ type: 'text', text }] });
      return;
    }
    if (name === 'show_widget') {
      const rawTitle = typeof args.title === 'string' ? args.title : 'widget';
      const widgetCode = typeof args.widget_code === 'string' ? args.widget_code : '';
      const displayTitle = rawTitle.replace(/_/g, ' ');
      sendResponse(message.id, {
        content: [{ type: 'text', text: 'Widget "' + displayTitle + '" rendered successfully (' + widgetCode.length + ' chars).' }]
      });
      return;
    }
    sendError(message.id, -32601, 'Unknown tool: ' + String(name));
    return;
  }
  if (typeof message.id !== 'undefined') {
    sendError(message.id, -32601, 'Unsupported method: ' + String(method));
  }
}

let buffer = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf('\\r\\n\\r\\n');
    if (headerEnd === -1) return;
    const header = buffer.slice(0, headerEnd).toString('utf8');
    const match = /Content-Length:\\s*(\\d+)/i.exec(header);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const bodyLength = Number(match[1]);
    const totalLength = headerEnd + 4 + bodyLength;
    if (buffer.length < totalLength) return;
    const body = buffer.slice(headerEnd + 4, totalLength).toString('utf8');
    buffer = buffer.slice(totalLength);
    try {
      handleMessage(JSON.parse(body));
    } catch (error) {
      process.stderr.write('[generative-ui-mcp] failed to handle message: ' + String(error) + '\\n');
    }
  }
});
`
}

export function writeMcpConfig(taskDir: string, nodeCommand: string): string {
  const configPath = join(taskDir, '.mcp-generative-ui.json')
  const serverPath = join(taskDir, '.mcp-generative-ui-server.mjs')

  writeFileSync(serverPath, buildMcpServerScript(), 'utf-8')

  // 合并用户在 settings 中配置的 MCP 服务器
  const userMcpServers = readClaudeSettings().mcpServers || {}
  const mergedServers: Record<string, unknown> = { ...userMcpServers }
  mergedServers['generative-ui'] = { command: nodeCommand, args: [serverPath] }

  writeFileSync(
    configPath,
    JSON.stringify({ mcpServers: mergedServers }, null, 2),
    'utf-8',
  )

  return configPath
}

/**
 * 写入仅包含用户 MCP 服务器的配置文件（不含 generative-ui）
 * 用于 widget 未启用但用户有 MCP 配置的场景
 */
export function writeUserMcpConfig(_taskDir: string): string | null {
  const userMcpServers = readClaudeSettings().mcpServers || {}
  if (Object.keys(userMcpServers).length === 0) return null

  const configPath = join(homedir(), '.claude', '.mcp-user.json')
  writeFileSync(
    configPath,
    JSON.stringify({ mcpServers: userMcpServers }, null, 2),
    'utf-8',
  )
  return configPath
}
