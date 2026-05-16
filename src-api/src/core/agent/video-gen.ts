import { existsSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

interface VideoGenMcpOptions {
  agentServiceBaseUrl: string
  nodePath: string
  modelProfileId?: string
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function resolveVideoGenMcpServerPath(): string {
  const execDir = dirname(process.execPath)
  const candidates = [
    join(MODULE_DIR, '..', '..', '..', '..', 'agent-service', 'src', 'video-gen', 'mcp', 'mcp-server.mjs'),
    join(MODULE_DIR, '..', '..', 'agent-service', 'dist', 'video-gen', 'mcp', 'mcp-server.mjs'),
    join(execDir, '..', 'agent', 'video-gen', 'mcp', 'mcp-server.mjs'),
    join(execDir, '..', '..', 'agent-service', 'dist', 'video-gen', 'mcp', 'mcp-server.mjs'),
    join(process.cwd(), 'agent-service', 'src', 'video-gen', 'mcp', 'mcp-server.mjs'),
    join(process.cwd(), 'agent-service', 'dist', 'video-gen', 'mcp', 'mcp-server.mjs'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  throw new Error(`laborany-video-gen MCP server not found near ${basename(process.execPath)}`)
}

export function buildVideoGenPolicySection(): string {
  return `## 视频生成策略

当对话涉及以下场景时，使用 mcp__laborany_video_gen__generate_video 工具生成视频：

- 用户明确要求生成视频、短片、动态广告、运镜片段、图生视频或文生视频
- 用户希望把文字描述或公开可访问的参考图片/视频/音频转化为视频产物

调用规则：
- 仅在用户明确要求生成视频时调用，不要主动为纯文字描述生成视频
- 调用时传入完整的视频描述 prompt，可选传入文件名、比例、时长、分辨率、是否生成音频等参数
- 参考图片/音频可以用 references.path 传入当前任务目录里的本地文件，工具会自动转成 Seedance 支持的 base64 data URL
- 若已在设置中配置 TOS，参考视频可以用 references.path 传入当前任务目录里的本地文件，工具会自动上传到 TOS 并传给 Seedance
- 未配置 TOS 时，参考视频必须使用公网 URL 或 provider 支持的 asset:// ID
- 生成完成后，告知用户视频已保存到当前任务目录，可在右侧文件树中查看`
}

function copyTosEnv(env: Record<string, string>): void {
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('LABORANY_TOS_')) continue
    if (typeof value === 'string' && value.trim()) env[key] = value
  }
}

export function writeVideoGenMcpConfig(taskDir: string, options: VideoGenMcpOptions): string {
  const mcpServerPath = resolveVideoGenMcpServerPath()
  const env: Record<string, string> = {
    LABORANY_AGENT_BASE_URL: normalizeBaseUrl(options.agentServiceBaseUrl),
    LABORANY_TASK_DIR: taskDir,
  }
  copyTosEnv(env)

  if (options.modelProfileId?.trim()) {
    env.LABORANY_MODEL_PROFILE_ID = options.modelProfileId.trim()
  }

  const config = {
    mcpServers: {
      laborany_video_gen: {
        command: options.nodePath,
        args: [mcpServerPath],
        env,
      },
    },
  }

  const configPath = join(taskDir, '.laborany-video-gen-mcp.json')
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  return configPath
}
