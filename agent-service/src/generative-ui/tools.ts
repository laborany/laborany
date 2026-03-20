/**
 * Generative UI — Tool Definitions & MCP Config
 *
 * Guidelines are also exported here for tests and local parsing.
 * Runtime MCP injection uses the SDK-backed server implementation.
 */

import { writeFileSync, existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

// ── Inlined guidelines ──

const GUIDELINES_CORE = `# Widget Design Guidelines — Core

You are generating HTML widget fragments that render inside a sandboxed iframe.

## Structure Rules

- Output an HTML fragment only. No \`<!DOCTYPE>\`, \`<html>\`, \`<head>\`, or \`<body>\` tags.
- Order: \`<style>\` block first, then HTML content, then \`<script>\` last.
- Keep everything in a single fragment — no external file references.

## Styling

- Use CSS variables for all colors. The host provides these tokens:
  - \`var(--color-bg)\` — page background
  - \`var(--color-surface)\` — card/panel background
  - \`var(--color-text)\` — primary text
  - \`var(--color-text-muted)\` — secondary text
  - \`var(--color-accent)\` — primary accent (buttons, links, highlights)
  - \`var(--color-border)\` — borders and dividers
  - \`var(--color-success)\` — success states
  - \`var(--color-warning)\` — warning states
  - \`var(--color-danger)\` — error/danger states
- Provide sensible fallback values: \`var(--color-accent, #7c3aed)\`.
- No gradients, shadows, or blur effects.
- Use \`system-ui, -apple-system, sans-serif\` for fonts.
- Use \`box-sizing: border-box\` on all elements.
- Use \`border-radius: 8px\` for cards and inputs.

## Layout

- Max width 600px, centered with \`margin: 0 auto\`.
- Padding: 20-24px for containers.
- Gap: 12-16px between sections.
- Keep widgets focused — one clear purpose per widget.

## Typography

- Headings: 18-20px, font-weight 600.
- Body: 14-15px, line-height 1.5.
- Labels: 12-13px, use \`var(--color-text-muted)\`.

## Scripting

- Use vanilla JS only. No external libraries or CDN scripts.
- Use \`addEventListener\` for event binding.
- Use \`window.sendToAgent(data)\` to send interaction data back to the conversation.
- Do not read or write \`localStorage\`, \`sessionStorage\`, cookies, or IndexedDB. This widget runs in a sandboxed iframe without same-origin storage access; keep state in memory instead.
- Keep scripts minimal and focused.

## Accessibility

- Use semantic HTML elements.
- Add \`aria-label\` to interactive elements where needed.
- Ensure sufficient color contrast with fallback values.
- Support keyboard navigation for interactive elements.`

const GUIDELINES_INTERACTIVE = `# Widget Design Guidelines — Interactive

For calculators, forms, configurators, and interactive tools.

## Input Fields

- Use \`<label>\` with \`for\` attribute for every input.
- Use appropriate \`type\`: \`number\`, \`text\`, \`range\`.
- Add \`placeholder\` with example values.
- Style inputs: full width, 10-12px padding, border with \`var(--color-border)\`, focus state with \`var(--color-accent)\`.

## Buttons

- Primary: \`background: var(--color-accent)\`, white text, full width for main actions.
- Hover: \`opacity: 0.85\`.
- Disabled: \`opacity: 0.4; cursor: not-allowed\`.

## Result Display

- Use a distinct result area with \`var(--color-surface)\` background.
- Large number display: 24-28px, font-weight 600, \`var(--color-accent)\`.
- Hide result area initially with \`display: none\`, show on calculation.

## Sending Data Back

When the user completes an interaction (submits a form, makes a selection):
\`window.sendToAgent({ type: 'result', ... })\`
Only send meaningful interaction data, not every keystroke.`

const GUIDELINES_CHART = `# Widget Design Guidelines — Chart

For bar charts, line charts, pie charts, and data visualizations.

## Approach

Use inline SVG or Canvas API. No external charting libraries.

## SVG Charts

Preferred for simple bar/pie/line charts.

## Canvas Charts

Use for complex or animated charts. Set canvas size for retina displays.

## Data Labels

- Always label axes.
- Show values on hover or directly on bars/points.
- Use \`var(--color-text-muted)\` for axis labels.
- Use \`var(--color-text)\` for data values.

## Colors for Multiple Series

Use opacity variants of accent:
- Series 1: \`var(--color-accent)\`
- Series 2: \`var(--color-accent)\` with \`opacity: 0.6\`
- Series 3: \`var(--color-accent)\` with \`opacity: 0.3\`

Or use semantic colors: \`var(--color-success)\`, \`var(--color-warning)\`, \`var(--color-danger)\`.`

const GUIDELINES_DIAGRAM = `# Widget Design Guidelines — Diagram

For flowcharts, state diagrams, tree structures, and process visualizations.

## Approach

Use inline SVG for all diagrams. No external libraries.

## Node Styles

- Rectangle nodes: \`rx="8"\`, fill \`var(--color-surface)\`, stroke \`var(--color-border)\`.
- Decision diamonds: use \`<polygon>\` or rotated \`<rect>\`.
- Start/End nodes: use \`rx="22"\` for pill shape.
- Highlighted nodes: fill \`var(--color-accent)\` with white text.

## Arrows

- Use \`<line>\` or \`<path>\` with \`marker-end\`.
- Stroke: \`var(--color-text-muted)\`, width 1.5px.
- For curved arrows, use \`<path>\` with cubic bezier.

## Labels

- Node text: 13px, centered with \`text-anchor="middle"\`.
- Arrow labels: 11px, \`var(--color-text-muted)\`, positioned at midpoint.

## Layout Tips

- Vertical flow (top to bottom) is default.
- Space nodes 60-80px apart vertically.
- Center the diagram in the viewBox.
- Keep viewBox proportional to content.`

const GUIDELINES_LAYOUT = `# Widget Design Guidelines — Layout

Common layout patterns for widget composition.

## Flexbox Layouts

- Use \`display: flex\` with \`gap: 12px\` for horizontal arrangements.
- Use \`flex-direction: column\` for vertical stacking.
- Use \`flex-wrap: wrap\` for responsive grids that reflow.
- Center content: \`justify-content: center; align-items: center\`.

## Grid Layouts

- Use CSS Grid for two-dimensional layouts: \`display: grid\`.
- Common pattern: \`grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))\`.
- Gap: \`gap: 16px\` between grid items.
- For dashboard-style layouts, use named grid areas.

## Card Layouts

- Card container: \`background: var(--color-surface)\`, \`border: 1px solid var(--color-border)\`, \`border-radius: 8px\`, \`padding: 16px\`.
- Card header: 14-16px font, \`font-weight: 600\`, \`margin-bottom: 12px\`.
- Card body: 14px font, \`line-height: 1.5\`.
- Card footer: \`border-top: 1px solid var(--color-border)\`, \`padding-top: 12px\`, \`margin-top: 12px\`.

## Responsive Patterns

- Max width 600px, centered with \`margin: 0 auto\`.
- Use percentage widths or \`minmax()\` for flexible sizing.
- Stack columns vertically on narrow viewports using \`flex-wrap\` or grid \`auto-fit\`.
- Avoid fixed pixel widths for content areas.

## Spacing System

- Tight: 4-8px (between related elements like label and input).
- Normal: 12-16px (between sections or cards).
- Loose: 20-24px (container padding, major section gaps).
- Use consistent spacing throughout a single widget.

## Scroll Containers

- Use \`overflow-y: auto\` for content that may exceed viewport.
- Set \`max-height\` on scrollable areas to prevent unbounded growth.
- Add subtle \`border-top\` / \`border-bottom\` on scroll containers for visual cue.`

const GUIDELINES_DATA_TABLE = `# Widget Design Guidelines — Data Table

For tabular data display with sorting and filtering.

## Table Structure

- Use semantic \`<table>\`, \`<thead>\`, \`<tbody>\`, \`<tr>\`, \`<th>\`, \`<td>\` elements.
- Set \`width: 100%\` and \`border-collapse: collapse\` on the table.
- Wrap in a \`div\` with \`overflow-x: auto\` for horizontal scroll on narrow viewports.

## Header Styling

- \`<th>\`: \`text-align: left\`, \`padding: 10px 12px\`, \`font-size: 12px\`, \`font-weight: 600\`.
- Color: \`var(--color-text-muted)\`, \`text-transform: uppercase\`, \`letter-spacing: 0.05em\`.
- Bottom border: \`2px solid var(--color-border)\`.

## Row Styling

- \`<td>\`: \`padding: 10px 12px\`, \`font-size: 14px\`, \`border-bottom: 1px solid var(--color-border)\`.
- Alternate row background: \`nth-child(even)\` with \`var(--color-surface)\`.
- Hover: \`background: var(--color-surface)\` (or slightly darker).

## Sorting

- Add clickable \`<th>\` headers with \`cursor: pointer\`.
- Show sort direction with arrow indicators: \`▲\` / \`▼\` appended to header text.
- Use \`aria-sort="ascending"\` or \`aria-sort="descending"\` on sorted column.
- Sort in JavaScript using \`Array.prototype.sort()\` and re-render the \`<tbody>\`.

## Filtering

- Place a text input above the table: \`<input type="text" placeholder="Search...">\`.
- Style: full width, \`padding: 8px 12px\`, \`border: 1px solid var(--color-border)\`, \`border-radius: 8px\`.
- Filter rows by checking if any cell content includes the search term (case-insensitive).
- Show a "No results" row when filter matches nothing.

## Numeric Columns

- Right-align numeric data: \`text-align: right\` on both \`<th>\` and \`<td>\`.
- Use \`tabular-nums\` font feature for aligned digits.
- Format large numbers with locale-appropriate separators.

## Empty State

- When the table has no data, show a centered message inside \`<tbody>\`.
- Use \`colspan\` spanning all columns, \`text-align: center\`, \`padding: 24px\`.
- Color: \`var(--color-text-muted)\`.`

const GUIDELINES_MAP: Record<string, string> = {
  core: GUIDELINES_CORE,
  interactive: GUIDELINES_INTERACTIVE,
  chart: GUIDELINES_CHART,
  diagram: GUIDELINES_DIAGRAM,
  layout: GUIDELINES_LAYOUT,
  'data-table': GUIDELINES_DATA_TABLE,
}

// ── Available guideline modules ──

export const AVAILABLE_MODULES = ['interactive', 'chart', 'diagram', 'layout', 'data-table'] as const
export type GuidelineModule = typeof AVAILABLE_MODULES[number]

// ── Guidelines loader (used by tests and the MCP server) ──

export function getGuidelines(modules: string[]): string {
  const parts: string[] = [GUIDELINES_CORE]
  for (const mod of modules) {
    if (GUIDELINES_MAP[mod]) parts.push(GUIDELINES_MAP[mod])
  }
  return parts.join('\n\n---\n\n')
}

function resolveMcpServerPath(): string {
  // Dev mode: MODULE_DIR is src/generative-ui/
  const preferred = join(MODULE_DIR, 'mcp-server.mjs')
  if (existsSync(preferred)) return preferred

  // Bundled mode: MODULE_DIR is dist/, server is at dist/generative-ui/
  const bundled = join(MODULE_DIR, 'generative-ui', 'mcp-server.mjs')
  if (existsSync(bundled)) return bundled

  // Packaged binary mode: sidecar next to the executable
  const sidecar = join(dirname(process.execPath), 'generative-ui', 'mcp-server.mjs')
  if (existsSync(sidecar)) return sidecar

  // Dev mode fallback: spike directory
  const spikeFallback = join(MODULE_DIR, 'spike', 'mcp-server.mjs')
  if (existsSync(spikeFallback)) return spikeFallback

  throw new Error(`Generative UI MCP server not found under ${MODULE_DIR}`)
}

// ── MCP Config generation ──

/**
 * Write the MCP config for the generative-ui server into taskDir.
 * User MCP servers are loaded separately from laborany-mcp.json.
 */
export function writeMcpConfig(taskDir: string, nodePath?: string): string {
  const configPath = join(taskDir, '.mcp-generative-ui.json')
  const node = nodePath || process.execPath
  const serverPath = resolveMcpServerPath()

  const config = {
    mcpServers: {
      'generative-ui': {
        command: node,
        args: [serverPath],
      },
    },
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  return configPath
}

/**
 * 返回 laborany MCP 配置文件路径
 * 配置由 MCP 管理界面直接写入，运行时只需返回路径
 */
export function writeUserMcpConfig(_taskDir: string): string | null {
  const configPath = join(homedir(), '.claude', 'laborany-mcp.json')
  // 检查文件是否存在且非空
  try {
    const content = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(content)
    if (parsed.mcpServers && Object.keys(parsed.mcpServers).length > 0) {
      return configPath
    }
  } catch {
    // 文件不存在或解析失败
  }
  return null
}

// ── Tool name constants ──

/** Tool names as they appear in CLI stream events (with MCP prefix) */
export const MCP_TOOL_PREFIX = 'mcp__generative-ui__'
export const TOOL_LOAD_GUIDELINES = `${MCP_TOOL_PREFIX}load_guidelines`
export const TOOL_SHOW_WIDGET = `${MCP_TOOL_PREFIX}show_widget`

/** Check if a tool name is a generative-ui tool */
export function isWidgetTool(toolName: string): boolean {
  return toolName === TOOL_LOAD_GUIDELINES || toolName === TOOL_SHOW_WIDGET
}
