import { dirname, join } from 'path'
import { existsSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

interface VisionMcpOptions {
  agentServicePort: string
  nodePath: string
  modelProfileId?: string
}

function resolveVisionMcpServerPath(): string {
  const preferred = join(MODULE_DIR, 'mcp-server.mjs')
  if (existsSync(preferred)) return preferred

  const bundled = join(MODULE_DIR, '..', 'vision', 'mcp', 'mcp-server.mjs')
  if (existsSync(bundled)) return bundled

  const sidecar = join(dirname(process.execPath), 'vision', 'mcp', 'mcp-server.mjs')
  if (existsSync(sidecar)) return sidecar

  throw new Error(`laborany-vision MCP server not found under ${MODULE_DIR}`)
}

export function buildVisionPolicySection(): string {
  return `## 视觉理解策略

当对话涉及以下场景时，使用视觉 MCP 工具分析图片或视频：

- 用户上传图片并询问图片内容、OCR、图表数据、界面截图问题
- 用户上传视频并询问视频画面内容、场景变化、分镜、动作或可见元素
- 任务目录中存在图片文件且用户问题依赖图片内容

调用规则：
- 仅在必要时调用，不主动每轮调用
- 图片使用 mcp__laborany_vision__analyze_image；视频使用 mcp__laborany_vision__analyze_video
- analyze_video 默认 mode=frames，成本低且兼容所有视觉模型；当用户明确要求“整段视频/包含音频/按时间轴理解/不要只看抽帧”时，传 mode=native
- mode=native 当前需要绑定支持原生视频输入的模型配置（例如 Gemini）；不支持时应说明限制，或改用 mode=frames
- mode=auto 可在支持原生视频的配置上自动使用整视频，否则回退抽帧
- 用户只是上传图片/视频但没有基于媒体提问时，不必须调用
- 分析结果仅用于当前轮回复，不写入长期记忆，除非用户明确要求记录
- 调用时传入媒体路径（相对于当前任务目录或绝对路径），可选传入具体问题
- 抽帧模式不等同于完整音频/逐帧视频理解；若用户需要精确时间轴或音频台词，请使用原生整视频模式或说明限制`
}

export function writeVisionMcpConfig(taskDir: string, options: VisionMcpOptions): string {
  const mcpServerPath = resolveVisionMcpServerPath()
  const env: Record<string, string> = {
    LABORANY_AGENT_PORT: options.agentServicePort,
    LABORANY_TASK_DIR: taskDir,
  }

  if (process.env.LABORANY_FFMPEG) {
    env.LABORANY_FFMPEG = process.env.LABORANY_FFMPEG
  }

  if (options.modelProfileId?.trim()) {
    env.LABORANY_MODEL_PROFILE_ID = options.modelProfileId.trim()
  }

  const config = {
    mcpServers: {
      laborany_vision: {
        command: options.nodePath,
        args: [mcpServerPath],
        env,
      },
    },
  }

  const configPath = join(taskDir, '.laborany-vision-mcp.json')
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  return configPath
}
