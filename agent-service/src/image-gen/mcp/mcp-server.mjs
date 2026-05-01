#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { generateImageWithProfile } from '../runtime.js'

const taskDir = (process.env.LABORANY_TASK_DIR || '').trim()

const server = new McpServer({
  name: 'laborany_image_gen',
  version: '0.1.0',
})

server.tool(
  'generate_image',
  'Generate an image from a text prompt and save it to the current task directory. Returns the saved file path and a summary.',
  {
    prompt: z.string().describe('Text prompt describing the desired image'),
    file_name: z.string().optional().describe('Optional filename for the saved image (defaults to generated_<timestamp>.png)'),
    size: z.string().optional().describe('Image size, e.g. 1024x1024, 1024x1792, 1792x1024'),
    style: z.string().optional().describe('Image style: natural or vivid'),
  },
  async ({ prompt, file_name, size, style }) => {
    const result = await generateImageWithProfile({
      prompt,
      fileName: file_name,
      size,
      style,
    })
    return {
      content: [{ type: 'text', text: result.summary }],
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
