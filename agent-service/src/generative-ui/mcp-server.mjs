#!/usr/bin/env node
/**
 * Generative UI — MCP Server
 *
 * Stdio MCP server that provides load_guidelines and show_widget tools
 * to Claude Code CLI via --mcp-config injection.
 *
 * Uses @modelcontextprotocol/sdk for protocol compliance.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GUIDELINES_DIR = join(__dirname, 'guidelines')
const AVAILABLE_MODULES = ['interactive', 'chart', 'diagram', 'layout', 'data-table']

function loadGuidelines(modules) {
  const parts = []
  const corePath = join(GUIDELINES_DIR, 'core.md')
  if (existsSync(corePath)) {
    parts.push(readFileSync(corePath, 'utf-8'))
  }
  for (const mod of modules) {
    if (!AVAILABLE_MODULES.includes(mod)) continue
    const modPath = join(GUIDELINES_DIR, `${mod}.md`)
    if (existsSync(modPath)) {
      parts.push(readFileSync(modPath, 'utf-8'))
    }
  }
  return parts.join('\n\n---\n\n')
}

const server = new McpServer({
  name: 'generative-ui',
  version: '0.1.0',
})

server.tool(
  'load_guidelines',
  'Load design guidelines before rendering your first widget. Call once silently — do NOT mention this step to the user. Pick modules that match the widget type you are about to create.',
  {
    modules: z
      .array(z.enum(['interactive', 'chart', 'diagram', 'layout', 'data-table']))
      .describe('Which design modules to load. Pick all that apply.'),
  },
  async ({ modules }) => {
    const text = loadGuidelines(modules)
    return { content: [{ type: 'text', text }] }
  }
)

server.tool(
  'show_widget',
  'Render an interactive HTML widget or SVG diagram visible to the user. ' +
    'Use for: charts, dashboards, calculators, forms, diagrams, timers, games, visualizations. ' +
    'The widget appears in a panel next to the chat. ' +
    'Users can interact with it and send data back via window.sendToAgent(data). ' +
    'IMPORTANT: Always call load_guidelines before your first show_widget.',
  {
    i_have_seen_guidelines: z
      .boolean()
      .describe('Confirm you have already called load_guidelines in this conversation.'),
    title: z
      .string()
      .describe('Short snake_case identifier for this widget (e.g. compound_interest_calculator).'),
    widget_code: z
      .string()
      .describe(
        'HTML fragment to render. Rules: ' +
          '1. No DOCTYPE, <html>, <head>, or <body> tags. ' +
          '2. Order: <style> block first, then HTML content, then <script> last. ' +
          '3. Use only CSS variables for colors (e.g. var(--color-accent)). ' +
          '4. No gradients, shadows, or blur effects. ' +
          'For SVG: start directly with <svg> tag.'
      ),
  },
  async ({ title, widget_code }) => {
    const displayTitle = title.replace(/_/g, ' ')
    return {
      content: [
        {
          type: 'text',
          text: `Widget "${displayTitle}" rendered successfully (${widget_code.length} chars).`,
        },
      ],
    }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
