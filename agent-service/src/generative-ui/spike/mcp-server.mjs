#!/usr/bin/env node
/**
 * Generative UI Spike — MCP Server (official SDK)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({
  name: 'generative-ui-spike',
  version: '0.1.0',
})

server.tool(
  'load_guidelines',
  'Load design guidelines before rendering your first widget. Call once silently — do NOT mention this step to the user.',
  {
    modules: z.array(z.enum(['interactive', 'chart', 'diagram'])).describe('Which design modules to load.'),
  },
  async ({ modules }) => {
    const text = [
      '# Widget Design Guidelines',
      '',
      '## Core Rules',
      '- Use CSS variables: var(--color-accent), var(--color-bg), etc.',
      '- No DOCTYPE, <html>, <head>, or <body> tags.',
      '- Order: <style> first, then HTML content, then <script> last.',
      '- Keep widgets focused and appropriately sized.',
      '',
      `Loaded modules: ${modules.join(', ')}`,
      '',
      '## Interactive Module',
      '- Use event listeners for user interaction.',
      '- Call window.sendToAgent(data) to send data back.',
      '',
      '## Chart Module',
      '- Use Canvas API or inline SVG for charts.',
      '- Label axes clearly.',
      '',
      '## Diagram Module',
      '- Use SVG for flowcharts and diagrams.',
      '- Use clear arrows and labels.',
    ].join('\n')

    return { content: [{ type: 'text', text }] }
  }
)

server.tool(
  'show_widget',
  'Render an interactive HTML widget or SVG diagram. Use for charts, dashboards, calculators, forms, diagrams, games, visualizations. IMPORTANT: Always call load_guidelines before your first show_widget.',
  {
    i_have_seen_guidelines: z.boolean().describe('Confirm you have already called load_guidelines.'),
    title: z.string().describe('Short snake_case identifier for this widget.'),
    widget_code: z.string().describe('HTML fragment to render. No DOCTYPE/html/head/body. Order: <style> first, then HTML, then <script> last.'),
  },
  async ({ title, widget_code }) => {
    const displayTitle = title.replace(/_/g, ' ')
    process.stderr.write(`[MCP] show_widget called: title="${displayTitle}" code_length=${widget_code.length}\n`)

    return {
      content: [{ type: 'text', text: `Widget "${displayTitle}" rendered successfully (${widget_code.length} chars).` }],
    }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
process.stderr.write('[MCP] Generative UI spike server started (SDK)\n')
