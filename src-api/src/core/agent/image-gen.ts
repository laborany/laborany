import { existsSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

interface ImageGenMcpOptions {
  agentServiceBaseUrl: string
  nodePath: string
  modelProfileId?: string
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function resolveImageGenMcpServerPath(): string {
  const execDir = dirname(process.execPath)
  const candidates = [
    join(MODULE_DIR, '..', '..', '..', '..', 'agent-service', 'src', 'image-gen', 'mcp', 'mcp-server.mjs'),
    join(MODULE_DIR, '..', '..', 'agent-service', 'dist', 'image-gen', 'mcp', 'mcp-server.mjs'),
    join(execDir, '..', 'agent', 'image-gen', 'mcp', 'mcp-server.mjs'),
    join(execDir, '..', '..', 'agent-service', 'dist', 'image-gen', 'mcp', 'mcp-server.mjs'),
    join(process.cwd(), 'agent-service', 'src', 'image-gen', 'mcp', 'mcp-server.mjs'),
    join(process.cwd(), 'agent-service', 'dist', 'image-gen', 'mcp', 'mcp-server.mjs'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  throw new Error(`laborany-image-gen MCP server not found near ${basename(process.execPath)}`)
}

export function buildImageGenPolicySection(): string {
  return `## 图片生成策略

当对话涉及以下场景时，使用 mcp__laborany_image_gen__generate_image 工具生成图片：

- 用户明确要求生成图片、海报、插画、封面、概念图、效果图等视觉产物
- 用户希望把文字描述转化为可视化图像

调用规则：
- 仅在用户明确要求生成图片时调用，不要主动为纯文字描述生成图片
- 调用时传入完整的图片描述 prompt，可选传入文件名、尺寸、风格参数
- 生成完成后，告知用户图片已保存到当前任务目录，可在右侧文件树中查看
- 如用户只是描述一个画面场景但没有要求生成图片，不要调用此工具`
}

export function writeImageGenMcpConfig(taskDir: string, options: ImageGenMcpOptions): string {
  const mcpServerPath = resolveImageGenMcpServerPath()
  const env: Record<string, string> = {
    LABORANY_AGENT_BASE_URL: normalizeBaseUrl(options.agentServiceBaseUrl),
    LABORANY_TASK_DIR: taskDir,
  }

  if (options.modelProfileId?.trim()) {
    env.LABORANY_MODEL_PROFILE_ID = options.modelProfileId.trim()
  }

  const config = {
    mcpServers: {
      laborany_image_gen: {
        command: options.nodePath,
        args: [mcpServerPath],
        env,
      },
    },
  }

  const configPath = join(taskDir, '.laborany-image-gen-mcp.json')
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  return configPath
}
