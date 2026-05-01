#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs'
import { resolve, isAbsolute } from 'path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { analyzeImageWithProfile } from '../runtime.js'

const taskDir = (process.env.LABORANY_TASK_DIR || '').trim()

function resolveImagePath(inputPath) {
  const raw = (inputPath || '').trim()
  if (!raw) throw new Error('缺少 image_path')
  const fullPath = isAbsolute(raw) ? raw : resolve(taskDir || process.cwd(), raw)
  if (!existsSync(fullPath)) throw new Error(`图片不存在: ${raw}`)
  return fullPath
}

function validateImageFile(fullPath) {
  const stat = readFileSync(fullPath)
  if (!stat || stat.length === 0) throw new Error('图片文件为空')
}

const server = new McpServer({
  name: 'laborany_vision',
  version: '0.1.0',
})

server.tool(
  'analyze_image',
  'Analyze an uploaded image in current task directory and return a text description for the current turn.',
  {
    image_path: z.string().describe('Image path relative to current task directory or absolute path'),
    query: z.string().optional().describe('Optional question about the image'),
  },
  async ({ image_path, query }) => {
    const fullPath = resolveImagePath(image_path)
    validateImageFile(fullPath)
    const analysis = await analyzeImageWithProfile({ imagePath: fullPath, query })
    return {
      content: [{ type: 'text', text: analysis }],
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
