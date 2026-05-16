#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { generateVideoWithProfile } from '../runtime.js'

const referenceSchema = z.object({
  url: z.string().optional().describe('Public URL, data URL, or provider asset:// id for the reference media'),
  path: z.string().optional().describe('Local file path relative to the current task directory. Seedance local images/audio are converted to data URLs automatically; local videos are uploaded to configured TOS before use.'),
  role: z.string().optional().describe('Seedance media role, e.g. first_frame, last_frame, reference_image, reference_video, reference_audio'),
  type: z.enum(['image', 'video', 'audio']).optional().describe('Reference media type'),
})

const server = new McpServer({
  name: 'laborany_video_gen',
  version: '0.1.0',
})

server.tool(
  'generate_video',
  'Generate a video from a text prompt and optional reference media. Saves the finished mp4 to the current task directory.',
  {
    prompt: z.string().describe('Text prompt describing the desired video'),
    file_name: z.string().optional().describe('Optional filename for the saved video, e.g. generated.mp4'),
    ratio: z.string().optional().describe('Output aspect ratio, e.g. 16:9, 9:16, 1:1, 4:3, 3:4, 21:9'),
    duration: z.number().optional().describe('Output duration in seconds'),
    resolution: z.string().optional().describe('Output resolution, e.g. 480p, 720p, 1080p'),
    generate_audio: z.boolean().optional().describe('Whether to generate synchronized audio when supported'),
    watermark: z.boolean().optional().describe('Whether to show provider watermark when supported'),
    return_last_frame: z.boolean().optional().describe('Whether to return the last frame URL when supported'),
    references: z.array(referenceSchema).optional().describe('Optional reference image/video/audio. Local images/audio can be passed via path and will be embedded as data URLs for Seedance. Local videos can be passed via path when TOS is configured, otherwise use a public URL or asset:// id.'),
    timeout_ms: z.number().optional().describe('Optional total polling timeout in milliseconds'),
  },
  async ({ prompt, file_name, ratio, duration, resolution, generate_audio, watermark, return_last_frame, references, timeout_ms }) => {
    const result = await generateVideoWithProfile({
      prompt,
      fileName: file_name,
      ratio,
      duration,
      resolution,
      generateAudio: generate_audio,
      watermark,
      returnLastFrame: return_last_frame,
      references,
      timeoutMs: timeout_ms,
    })
    return {
      content: [{ type: 'text', text: result.summary }],
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
