#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs'
import { resolve, isAbsolute } from 'path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { analyzeImageWithProfile, analyzeVideoWithProfile } from '../runtime.js'

const taskDir = (process.env.LABORANY_TASK_DIR || '').trim()

function resolveImagePath(inputPath) {
  const raw = (inputPath || '').trim()
  if (!raw) throw new Error('缺少 image_path')
  const fullPath = isAbsolute(raw) ? raw : resolve(taskDir || process.cwd(), raw)
  if (!existsSync(fullPath)) throw new Error(`图片不存在: ${raw}`)
  return fullPath
}

function resolveVideoPath(inputPath) {
  const raw = (inputPath || '').trim()
  if (!raw) throw new Error('缺少 video_path')
  const fullPath = isAbsolute(raw) ? raw : resolve(taskDir || process.cwd(), raw)
  if (!existsSync(fullPath)) throw new Error(`视频不存在: ${raw}`)
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

server.tool(
  'analyze_video',
  'Analyze a local video in current task directory by sampling frames and returning a text description for the current turn.',
  {
    video_path: z.string().describe('Video path relative to current task directory or absolute path'),
    query: z.string().optional().describe('Optional question about the video'),
    frame_count: z.number().optional().describe('Number of frames to sample, default 4, max 8'),
    mode: z.enum(['frames', 'native', 'auto']).optional().describe('Video understanding mode. frames = local frame sampling, native = send the whole video to a supported provider, auto = native when supported else frames. Defaults to frames.'),
    fps: z.number().optional().describe('Native video mode FPS sampling hint for supported providers such as Gemini'),
    start_offset: z.string().optional().describe('Native video mode clip start offset, e.g. 40s'),
    end_offset: z.string().optional().describe('Native video mode clip end offset, e.g. 80s'),
    media_resolution: z.enum(['low', 'medium', 'high']).optional().describe('Native video mode media resolution hint for supported providers'),
  },
  async ({ video_path, query, frame_count, mode, fps, start_offset, end_offset, media_resolution }) => {
    const fullPath = resolveVideoPath(video_path)
    const analysis = await analyzeVideoWithProfile({
      videoPath: fullPath,
      query,
      frameCount: frame_count,
      mode,
      fps,
      startOffset: start_offset,
      endOffset: end_offset,
      mediaResolution: media_resolution,
    })
    return {
      content: [{ type: 'text', text: analysis }],
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
