/**
 * laborany-web — MCP Config Generator
 *
 * Generates the --mcp-config JSON file that Claude Code CLI uses to
 * discover and launch the laborany-web MCP server as a stdio subprocess.
 *
 * Mirrors the pattern in generative-ui/tools.ts → writeMcpConfig().
 */

import { writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

interface WebResearchMcpOptions {
  agentServicePort: string
  nodePath: string
  agentServiceBaseUrl?: string
  modelProfileId?: string
  enableBrowserAutomation?: boolean  // P7: 是否暴露 browser_* 自动化工具给模型
}

/**
 * Resolve the path to mcp-server.mjs across dev / bundled / packaged modes.
 */
function resolveMcpServerPath(): string {
  // Dev mode: MODULE_DIR is src/web-research/mcp/
  const preferred = join(MODULE_DIR, 'mcp-server.mjs')
  if (existsSync(preferred)) return preferred

  // Bundled mode: MODULE_DIR is dist/, server is at dist/web-research/mcp/
  const bundled = join(MODULE_DIR, 'web-research', 'mcp', 'mcp-server.mjs')
  if (existsSync(bundled)) return bundled

  // Packaged binary mode: sidecar next to the executable
  const sidecar = join(dirname(process.execPath), 'web-research', 'mcp', 'mcp-server.mjs')
  if (existsSync(sidecar)) return sidecar

  throw new Error(`laborany-web MCP server not found under ${MODULE_DIR}`)
}

/**
 * Write the MCP config for the laborany-web server into taskDir.
 *
 * @param taskDir   - The task working directory (config file is written here)
 * @param options   - agentServicePort and nodePath
 * @returns The absolute path to the written config file
 */
export function writeWebResearchMcpConfig(
  taskDir: string,
  options: WebResearchMcpOptions,
): string {
  const mcpServerPath = resolveMcpServerPath()

  const env: Record<string, string> = {
    LABORANY_AGENT_PORT: options.agentServicePort,
    LABORANY_AGENT_BASE_URL: (options.agentServiceBaseUrl || `http://127.0.0.1:${options.agentServicePort}`).replace(/\/+$/, ''),
    LABORANY_TASK_DIR: taskDir,
  }

  if (options.modelProfileId?.trim()) {
    env.LABORANY_MODEL_PROFILE_ID = options.modelProfileId.trim()
  }

  // P7: 当 enableBrowserAutomation 为 true 时，通知 MCP server 注册 browser_* 工具
  if (options.enableBrowserAutomation) {
    env.LABORANY_BROWSER_AUTOMATION = 'true'
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
