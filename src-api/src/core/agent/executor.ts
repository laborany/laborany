/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Agent 执行器 (Claude Code CLI)                    ║
 * ║                                                                          ║
 * ║  职责：通过 Claude Code CLI 执行 Agent                                     ║
 * ║  设计：每个任务独立工作目录，完整展示中间过程                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { spawn, execSync } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { platform, homedir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { Skill } from 'laborany-shared'
import { isZhipuApi, buildZhipuMcpServers, injectMcpServers } from './mcp/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface AgentEvent {
  type: 'init' | 'text' | 'tool_use' | 'tool_result' | 'error' | 'done'
  content?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: string
  taskDir?: string
}

interface ExecuteOptions {
  skill: Skill
  query: string
  sessionId: string
  signal: AbortSignal
  onEvent: (event: AgentEvent) => void
  workDir?: string  // 可选的工作目录，用于工作流共享目录
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       任务目录管理                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function isPackaged(): boolean {
  return !process.execPath.includes('node')
}

function getAppDataDir(): string {
  if (isPackaged()) {
    return platform() === 'win32'
      ? join(homedir(), 'AppData', 'Roaming', 'LaborAny')
      : platform() === 'darwin'
        ? join(homedir(), 'Library', 'Application Support', 'LaborAny')
        : join(homedir(), '.config', 'laborany')
  }
  return join(__dirname, '..', '..', '..', '..')
}

function getTasksBaseDir(): string {
  if (isPackaged()) {
    // 打包环境：与 agent-service 保持一致，使用 data/tasks
    return join(getAppDataDir(), 'data', 'tasks')
  }
  return join(getAppDataDir(), 'tasks')
}

export function getTaskDir(sessionId: string): string {
  return join(getTasksBaseDir(), sessionId)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取 Memory 上下文并写入 CLAUDE.md                   │
 * │  从 agent-service 获取完整的 Memory 上下文，写入 CLAUDE.md                 │
 * │  Claude Code 会自动读取 CLAUDE.md 作为系统提示词                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function writeClaudeMdWithMemory(
  targetDir: string,
  skillId: string,
  skillSystemPrompt: string,
  userQuery?: string
): Promise<void> {
  const claudeMdPath = join(targetDir, 'CLAUDE.md')

  try {
    // 从 agent-service 获取 Memory 上下文（传入 userQuery 用于智能检索）
    const queryParam = userQuery ? `?query=${encodeURIComponent(userQuery)}` : ''
    const response = await fetch(`http://localhost:3002/memory-context/${skillId}${queryParam}`)
    if (response.ok) {
      const data = await response.json() as { context?: string }
      const memoryContext = data.context || ''

      // 组合完整的系统提示词
      const fullPrompt = memoryContext
        ? `${memoryContext}\n\n---\n\n${skillSystemPrompt}`
        : skillSystemPrompt

      writeFileSync(claudeMdPath, fullPrompt, 'utf-8')
      console.log(`[Agent] 已写入 CLAUDE.md（含 Memory 上下文）: ${claudeMdPath}`)
    } else {
      // 如果获取失败，只写入 skill 的系统提示词
      writeFileSync(claudeMdPath, skillSystemPrompt, 'utf-8')
      console.log(`[Agent] 已写入 CLAUDE.md（无 Memory）: ${claudeMdPath}`)
    }
  } catch (err) {
    // 网络错误时，只写入 skill 的系统提示词
    writeFileSync(claudeMdPath, skillSystemPrompt, 'utf-8')
    console.warn(`[Agent] 获取 Memory 上下文失败，已写入基础 CLAUDE.md: ${err}`)
  }
}

export function ensureTaskDir(sessionId: string): string {
  const taskDir = getTaskDir(sessionId)
  if (!existsSync(taskDir)) {
    mkdirSync(taskDir, { recursive: true })
  }
  return taskDir
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       Claude Code 路径检测                                │
 * │  优先级：内置 CLI Bundle > 系统安装 > 自动安装                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getBundledClaudePath(): { node: string; cli: string } | null {
  const os = platform()
  const exeDir = dirname(process.execPath)

  // 内置 CLI Bundle 的可能位置
  const candidates = [
    // Electron 打包后：API exe 在 resources/api/，cli-bundle 在 resources/cli-bundle
    join(exeDir, '..', 'cli-bundle'),
    // Windows 备选路径
    join(exeDir, '..', 'resources', 'cli-bundle'),
    join(exeDir, 'resources', 'cli-bundle'),
    // 开发模式
    join(__dirname, '..', '..', '..', '..', 'cli-bundle'),
  ]

  for (const bundleDir of candidates) {
    const nodeBin = os === 'win32'
      ? join(bundleDir, 'node.exe')
      : join(bundleDir, 'node')
    const cliJs = join(bundleDir, 'deps', '@anthropic-ai', 'claude-code', 'cli.js')

    console.log(`[Agent] 检查 CLI Bundle: ${bundleDir}`)
    console.log(`[Agent]   node: ${nodeBin} (exists: ${existsSync(nodeBin)})`)
    console.log(`[Agent]   cli: ${cliJs} (exists: ${existsSync(cliJs)})`)

    if (existsSync(nodeBin) && existsSync(cliJs)) {
      console.log(`[Agent] 找到内置 CLI Bundle: ${bundleDir}`)
      return { node: nodeBin, cli: cliJs }
    }
  }

  return null
}

function findClaudeCodePath(): string | undefined {
  const os = platform()
  const whichCmd = os === 'win32' ? 'where' : 'which'

  try {
    const result = execSync(`${whichCmd} claude`, { encoding: 'utf-8' }).trim()
    if (result) {
      const paths = result.split('\n').map(p => p.trim())
      if (os === 'win32') {
        for (const p of paths) {
          if (p.endsWith('.cmd') && existsSync(p)) return p
        }
      }
      for (const p of paths) {
        if (existsSync(p)) return p
      }
    }
  } catch { /* not found */ }

  const home = homedir()
  const possiblePaths = os === 'win32'
    ? [
        join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
        join(home, 'AppData', 'Local', 'Programs', 'claude', 'claude.exe'),
      ]
    : [
        '/usr/local/bin/claude',
        '/opt/homebrew/bin/claude',
        join(home, '.local', 'bin', 'claude'),
        join(home, '.npm-global', 'bin', 'claude'),
      ]

  for (const p of possiblePaths) {
    if (existsSync(p)) return p
  }

  if (process.env.CLAUDE_CODE_PATH && existsSync(process.env.CLAUDE_CODE_PATH)) {
    return process.env.CLAUDE_CODE_PATH
  }

  return undefined
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       确保 Claude Code 可用                               │
 * │  优先级：内置 CLI Bundle > 系统安装 > 自动安装                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface ClaudeCodeConfig {
  useBundled: boolean
  nodePath?: string
  cliPath?: string
  claudePath?: string
}

function ensureClaudeCode(): ClaudeCodeConfig | undefined {
  // 1. 优先检查内置 CLI Bundle
  const bundled = getBundledClaudePath()
  if (bundled) {
    console.log('[Agent] 使用内置 CLI Bundle')
    return {
      useBundled: true,
      nodePath: bundled.node,
      cliPath: bundled.cli,
    }
  }

  // 2. 检查系统安装的 Claude Code
  let systemPath = findClaudeCodePath()
  if (systemPath) {
    console.log('[Agent] 使用系统安装的 Claude Code')
    return {
      useBundled: false,
      claudePath: systemPath,
    }
  }

  // 3. 尝试自动安装
  console.log('[Agent] Claude Code 未找到，尝试自动安装...')
  try {
    execSync('npm install -g @anthropic-ai/claude-code', {
      encoding: 'utf-8',
      stdio: 'inherit',
    })
    console.log('[Agent] Claude Code 安装成功')
    systemPath = findClaudeCodePath()
    if (systemPath) {
      return {
        useBundled: false,
        claudePath: systemPath,
      }
    }
  } catch (error) {
    console.error('[Agent] Claude Code 安装失败:', error)
  }

  return undefined
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       构建环境配置                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function buildEnvConfig(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env }

  if (process.env.ANTHROPIC_API_KEY) {
    env.ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_API_KEY
  }
  if (process.env.ANTHROPIC_BASE_URL) {
    env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL
  }
  if (process.env.ANTHROPIC_MODEL) {
    env.ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL
  }

  return env
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       解析 stream-json 输出                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface ContentBlock {
  type: string
  text?: string
  name?: string
  id?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string | ContentBlock[]
  is_error?: boolean
}

interface StreamMessage {
  type: string
  subtype?: string
  message?: { content?: ContentBlock[] }
  result?: string
  tool_name?: string
  tool_input?: Record<string, unknown>
}

function parseStreamLine(line: string, onEvent: (event: AgentEvent) => void): void {
  parseStreamLineWithReturn(line, onEvent)
}

function parseStreamLineWithReturn(line: string, onEvent: (event: AgentEvent) => void): AgentEvent | null {
  if (!line.trim()) return null

  try {
    const msg: StreamMessage = JSON.parse(line)

    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text) {
          const event: AgentEvent = { type: 'text', content: block.text }
          onEvent(event)
          return event
        } else if (block.type === 'tool_use' && block.name) {
          const event: AgentEvent = {
            type: 'tool_use',
            toolName: block.name,
            toolInput: block.input,
            content: `调用工具: ${block.name}`,
          }
          onEvent(event)
          return event
        }
      }
    } else if (msg.type === 'user' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'tool_result') {
          const resultText = typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content)
          const event: AgentEvent = {
            type: 'tool_result',
            toolResult: resultText,
            content: block.is_error ? `工具执行失败` : `工具执行完成`,
          }
          onEvent(event)
          return event
        }
      }
    }
  } catch {
    // 非 JSON 行，忽略
  }
  return null
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       执行 Agent 主函数                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export async function executeAgent(options: ExecuteOptions): Promise<void> {
  const { skill, query: userQuery, sessionId, signal, onEvent, workDir } = options

  if (signal.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  // 使用指定的工作目录或根据 sessionId 生成
  const taskDir = workDir || ensureTaskDir(sessionId)
  if (workDir && !existsSync(workDir)) {
    mkdirSync(workDir, { recursive: true })
  }

  // 使用 sessionId 区分不同步骤的历史记录
  const historyFile = join(taskDir, `history-${sessionId}.txt`)
  const isNewSession = !existsSync(historyFile)

  // 新会话时写入 CLAUDE.md（含 Memory 上下文，传入 userQuery 用于智能检索）
  if (isNewSession) {
    await writeClaudeMdWithMemory(taskDir, skill.meta.id, skill.systemPrompt, userQuery)
  }
  console.log(`[Agent] Task directory: ${taskDir}`)
  console.log(`[Agent] Is new session: ${isNewSession}`)

  onEvent({ type: 'init', taskDir, content: `任务目录: ${taskDir}` })

  const timestamp = new Date().toISOString()
  const historyEntry = `\n[${timestamp}] User:\n${userQuery}\n`
  writeFileSync(historyFile, historyEntry, { flag: 'a' })

  // 确保 Claude Code 可用（优先使用内置 Bundle）
  const claudeConfig = ensureClaudeCode()
  if (!claudeConfig) {
    onEvent({
      type: 'error',
      content: 'Claude Code 未找到且安装失败。请手动运行: npm install -g @anthropic-ai/claude-code',
    })
    onEvent({ type: 'done' })
    return
  }

  // 检查 API Key 配置
  if (!process.env.ANTHROPIC_API_KEY) {
    onEvent({
      type: 'error',
      content: 'ANTHROPIC_API_KEY 未配置。请在设置页面配置 API 密钥。',
    })
    onEvent({ type: 'done' })
    return
  }

  /* ┌────────────────────────────────────────────────────────────────────────┐
   * │  智谱 MCP 自动注入                                                      │
   * │  当使用智谱 API 时，自动将智谱 MCP 服务器配置注入 settings.json          │
   * └────────────────────────────────────────────────────────────────────────┘ */
  if (isZhipuApi(process.env.ANTHROPIC_BASE_URL)) {
    const zhipuServers = buildZhipuMcpServers(process.env.ANTHROPIC_API_KEY)
    injectMcpServers(zhipuServers)
    console.log('[Agent] 检测到智谱 API，已注入 MCP 服务器配置')
  }

  if (claudeConfig.useBundled) {
    console.log(`[Agent] Node: ${claudeConfig.nodePath}`)
    console.log(`[Agent] CLI: ${claudeConfig.cliPath}`)
  } else {
    console.log(`[Agent] Claude Code: ${claudeConfig.claudePath}`)
  }
  console.log(`[Agent] Model: ${process.env.ANTHROPIC_MODEL || 'default'}`)
  console.log(`[Agent] API Key configured: ${process.env.ANTHROPIC_API_KEY ? 'Yes' : 'No'}`)

  const isWindows = platform() === 'win32'
  const args = [
    '--print',
    '--output-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions',
  ]

  if (!isNewSession) {
    args.push('--continue')
  }

  if (process.env.ANTHROPIC_MODEL) {
    args.push('--model', process.env.ANTHROPIC_MODEL)
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * 构建 prompt（系统提示词已写入 CLAUDE.md，这里只传用户查询）
   * ═══════════════════════════════════════════════════════════════════════════ */
  const prompt = userQuery

  console.log(`[Agent] Args: ${args.join(' ')}`)

  // 根据配置选择启动方式
  let proc
  if (claudeConfig.useBundled) {
    // 使用内置 Bundle：node cli.js [args]
    const bundledArgs = [claudeConfig.cliPath!, ...args]
    proc = spawn(claudeConfig.nodePath!, bundledArgs, {
      cwd: taskDir,
      env: buildEnvConfig(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } else {
    // 使用系统安装的 claude 命令
    proc = spawn(claudeConfig.claudePath!, args, {
      cwd: taskDir,
      env: buildEnvConfig(),
      shell: isWindows,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  }

  proc.stdin.write(prompt)
  proc.stdin.end()

  let lineBuffer = ''
  let agentResponse = ''  // 收集 Agent 的文本输出

  proc.stdout.on('data', (data: Buffer) => {
    lineBuffer += data.toString()
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() || ''
    for (const line of lines) {
      const event = parseStreamLineWithReturn(line, onEvent)
      // 收集文本输出用于记忆
      if (event?.type === 'text' && event.content) {
        agentResponse += event.content
      }
    }
  })

  proc.stderr.on('data', (data: Buffer) => {
    console.error('[Agent] stderr:', data.toString())
  })

  const abortHandler = () => proc.kill('SIGTERM')
  signal.addEventListener('abort', abortHandler)

  return new Promise((resolve) => {
    proc.on('close', async (code) => {
      signal.removeEventListener('abort', abortHandler)
      if (lineBuffer.trim()) {
        const event = parseStreamLineWithReturn(lineBuffer, onEvent)
        if (event?.type === 'text' && event.content) {
          agentResponse += event.content
        }
      }

      if (signal.aborted) {
        onEvent({ type: 'error', content: '执行被中止' })
      } else if (code !== 0) {
        onEvent({ type: 'error', content: `Claude Code 退出码: ${code}` })
      }

      // 任务完成后记录到三级记忆系统
      if (code === 0 && !signal.aborted && agentResponse.trim()) {
        try {
          await fetch('http://localhost:3002/memory/record-task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              skillId: skill.meta.id,
              userQuery,
              assistantResponse: agentResponse,
            }),
          })
          console.log('[Agent] 已记录任务到三级记忆系统')
        } catch (err) {
          console.error('[Agent] 记录记忆失败:', err)
        }
      }

      onEvent({ type: 'done' })
      resolve()
    })

    proc.on('error', (err) => {
      signal.removeEventListener('abort', abortHandler)
      onEvent({ type: 'error', content: err.message })
      onEvent({ type: 'done' })
      resolve()
    })
  })
}
