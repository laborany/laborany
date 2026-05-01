import { existsSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

interface VisionMcpOptions {
  agentServiceBaseUrl: string
  nodePath: string
  modelProfileId?: string
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function resolveVisionMcpServerPath(): string {
  const execDir = dirname(process.execPath)
  const candidates = [
    join(MODULE_DIR, '..', '..', '..', '..', 'agent-service', 'src', 'vision', 'mcp', 'mcp-server.mjs'),
    join(MODULE_DIR, '..', '..', 'agent-service', 'dist', 'vision', 'mcp', 'mcp-server.mjs'),
    join(execDir, '..', 'agent', 'vision', 'mcp', 'mcp-server.mjs'),
    join(execDir, '..', '..', 'agent-service', 'dist', 'vision', 'mcp', 'mcp-server.mjs'),
    join(process.cwd(), 'agent-service', 'src', 'vision', 'mcp', 'mcp-server.mjs'),
    join(process.cwd(), 'agent-service', 'dist', 'vision', 'mcp', 'mcp-server.mjs'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  throw new Error(`laborany-vision MCP server not found near ${basename(process.execPath)}`)
}

export function buildVisionPolicySection(): string {
  return `## 视觉理解策略

当对话涉及以下场景时，使用 mcp__laborany_vision__analyze_image 工具分析图片：

- 用户上传图片并询问图片内容、OCR、图表数据、界面截图问题
- 任务目录中存在图片文件且用户问题依赖图片内容

调用规则：
- 仅在必要时调用，不主动每轮调用
- 用户只是上传图片但没有基于图片提问时，不必须调用
- 分析结果仅用于当前轮回复，不写入长期记忆，除非用户明确要求记录
- 调用时传入图片路径（相对于当前任务目录或绝对路径），可选传入具体问题`
}

export function writeVisionMcpConfig(taskDir: string, options: VisionMcpOptions): string {
  const mcpServerPath = resolveVisionMcpServerPath()
  const env: Record<string, string> = {
    LABORANY_AGENT_BASE_URL: normalizeBaseUrl(options.agentServiceBaseUrl),
    LABORANY_TASK_DIR: taskDir,
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
