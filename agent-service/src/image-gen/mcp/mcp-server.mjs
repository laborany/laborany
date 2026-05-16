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
    aspect_ratio: z.string().optional().describe('Optional image aspect ratio for supported models, e.g. 9:16, 16:9, 1:1, 4:3, 3:4'),
    image_size: z.string().optional().describe('Optional image size tier for supported models, e.g. 1K, 2K, 4K'),
    style: z.string().optional().describe('Image style: natural or vivid'),
    quality: z.string().optional().describe('Optional image quality, e.g. low, medium, high, auto'),
    background: z.string().optional().describe('Optional background mode for supported models, e.g. transparent, opaque, auto'),
    output_format: z.string().optional().describe('Optional output format for supported models, e.g. png, jpeg, webp'),
  },
  async ({ prompt, file_name, size, aspect_ratio, image_size, style, quality, background, output_format }) => {
    const result = await generateImageWithProfile({
      prompt,
      fileName: file_name,
      size,
      aspectRatio: aspect_ratio,
      imageSize: image_size,
      style,
      quality,
      background,
      outputFormat: output_format,
    })
    return {
      content: [{ type: 'text', text: result.summary }],
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
