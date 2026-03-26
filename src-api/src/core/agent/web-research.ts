import { existsSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

interface WebResearchMcpOptions {
  agentServiceBaseUrl: string
  nodePath: string
  modelProfileId?: string
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function resolveWebResearchMcpServerPath(): string {
  const execDir = dirname(process.execPath)
  const candidates = [
    join(MODULE_DIR, '..', '..', '..', '..', 'agent-service', 'src', 'web-research', 'mcp', 'mcp-server.mjs'),
    join(MODULE_DIR, '..', '..', 'agent-service', 'dist', 'web-research', 'mcp', 'mcp-server.mjs'),
    join(execDir, '..', 'agent', 'web-research', 'mcp', 'mcp-server.mjs'),
    join(execDir, '..', '..', 'agent-service', 'dist', 'web-research', 'mcp', 'mcp-server.mjs'),
    join(process.cwd(), 'agent-service', 'src', 'web-research', 'mcp', 'mcp-server.mjs'),
    join(process.cwd(), 'agent-service', 'dist', 'web-research', 'mcp', 'mcp-server.mjs'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  throw new Error(`laborany-web MCP server not found near ${basename(process.execPath)}`)
}

export function writeWebResearchMcpConfig(
  taskDir: string,
  options: WebResearchMcpOptions,
): string {
  const mcpServerPath = resolveWebResearchMcpServerPath()
  const env: Record<string, string> = {
    LABORANY_AGENT_BASE_URL: normalizeBaseUrl(options.agentServiceBaseUrl),
    LABORANY_TASK_DIR: taskDir,
  }

  if (options.modelProfileId?.trim()) {
    env.LABORANY_MODEL_PROFILE_ID = options.modelProfileId.trim()
  }

  const config = {
    mcpServers: {
      laborany_web: {
        command: options.nodePath,
        args: [mcpServerPath],
        env,
      },
    },
  }

  const configPath = join(taskDir, '.laborany-web-mcp.json')
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  return configPath
}

export function buildResearchPolicySection(): string {
  return `## 联网调研策略

当对话涉及以下场景时，必须先使用联网工具调研，再回答：

### 必须调研
- 时效性信息（最新、最近、2025、2026、当前价格、现在）
- 事实核查（具体数据、统计、政策、法规、人事变动）
- 官方信息（官网内容、产品价格、功能列表、文档）
- 对比推荐（哪个更好、推荐、选择）

### 调研原则
- 搜索做发现，不做证明。搜索结果是线索入口，不是最终答案。
- 一手来源优于二手转述。找到官网、官方文档、原始出处再给结论。
- 对产品、API、公司功能、价格、政策这类“官方信息”问题，优先用 site / sites 限定到明显的官方域名后再搜。
- 找不到一手源时，明确告知用户来源局限性。
- 使用 mcp__laborany_web__search 搜索，mcp__laborany_web__read_page 深度阅读。
- mcp__laborany_web__search 默认优先走 Google，必要时回退到 Bing；若明确需要指定搜索引擎，可传 engine: "google" 或 engine: "bing"。
- 当用户要求“给来源”“附链接”“官方文档”“官网”时，至少必须先对你将引用的其中一个 URL 调用一次 mcp__laborany_web__read_page，再回答。
- 不要只凭 search 结果摘要就给出事实结论、官网链接或“官方说法”。
- 如果第一次 search 结果主要是新闻转载、博客或聚合页，而没有一手源，不要直接回答；应继续用 site / sites 缩小到官方域名重搜，或明确说明暂未找到一手来源。
- 若要限定在特定站点检索，优先给 mcp__laborany_web__search 传 site / sites 参数，而不是手写 site:。
- 不要凭记忆输出“官网链接”“官方文档链接”“价格页链接”“政策原文链接”。这类链接必须先核实再给。
- 当用户明确要求“给来源”“附链接”“官方出处”时，若未实际调研到来源，就必须明确说明未核实，不得伪造引用。`
}
