/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Agent 执行器 (Claude Code CLI)                    ║
 * ║                                                                          ║
 * ║  职责：通过 Claude Code CLI 执行 Agent                                     ║
 * ║  设计：每个任务独立工作目录，完整展示中间过程                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { spawn, execSync } from 'child_process'
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'fs'
import { platform, homedir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { Skill } from './skill-loader.js'

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
function getAppDataDir(): string {
  const isProduction = process.env.NODE_ENV === 'production'
  if (isProduction) {
    return platform() === 'win32'
      ? join(homedir(), 'AppData', 'Roaming', 'LaborAny')
      : platform() === 'darwin'
        ? join(homedir(), 'Library', 'Application Support', 'LaborAny')
        : join(homedir(), '.config', 'laborany')
  }
  return join(__dirname, '..', '..', '..', '..')
}

function getTasksBaseDir(): string {
  return join(getAppDataDir(), 'tasks')
}

function findClaudeMd(): string | null {
  /* ┌────────────────────────────────────────────────────────────────────────┐
   * │  在多个可能的位置查找 CLAUDE.md                                         │
   * │  优先级：pkg 打包路径 > Electron resources > 开发模式路径               │
   * └────────────────────────────────────────────────────────────────────────┘ */
  const candidates: string[] = []

  // 1. pkg 打包模式：exe 在 resources/api/，CLAUDE.md 在 resources/
  const exeDir = dirname(process.execPath)
  candidates.push(join(exeDir, '..', 'CLAUDE.md'))
  candidates.push(join(exeDir, 'CLAUDE.md'))

  // 2. Electron resources 路径（如果 resourcesPath 存在）
  if ((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath) {
    const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath!
    candidates.push(join(resourcesPath, 'CLAUDE.md'))
  }

  // 3. 开发模式：从项目根目录读取
  candidates.push(join(__dirname, '..', '..', '..', '..', 'CLAUDE.md'))

  // 4. 相对于当前工作目录
  candidates.push(join(process.cwd(), 'CLAUDE.md'))

  // 查找第一个存在的文件
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      console.log(`[Agent] Found CLAUDE.md at: ${candidate}`)
      return candidate
    }
  }

  console.warn(`[Agent] CLAUDE.md not found in any of: ${candidates.join(', ')}`)
  return null
}

function getClaudeMdPath(): string | null {
  return findClaudeMd()
}

function getTaskDir(sessionId: string): string {
  return join(getTasksBaseDir(), sessionId)
}

function copyClaudeMdToDir(targetDir: string): void {
  /* ┌────────────────────────────────────────────────────────────────────────┐
   * │  复制 CLAUDE.md 到目标目录                                              │
   * └────────────────────────────────────────────────────────────────────────┘ */
  const claudeMdSrc = getClaudeMdPath()
  const claudeMdDest = join(targetDir, 'CLAUDE.md')

  if (!claudeMdSrc) {
    console.warn(`[Agent] CLAUDE.md source not found, skipping copy`)
    return
  }

  if (existsSync(claudeMdDest)) {
    console.log(`[Agent] CLAUDE.md already exists at: ${claudeMdDest}`)
    return
  }

  try {
    copyFileSync(claudeMdSrc, claudeMdDest)
    console.log(`[Agent] Copied CLAUDE.md: ${claudeMdSrc} -> ${claudeMdDest}`)
  } catch (err) {
    console.warn(`[Agent] Failed to copy CLAUDE.md: ${err}`)
  }
}

function ensureTaskDir(sessionId: string): string {
  const taskDir = getTaskDir(sessionId)
  if (!existsSync(taskDir)) {
    mkdirSync(taskDir, { recursive: true })
  }
  copyClaudeMdToDir(taskDir)
  return taskDir
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       Claude Code 路径检测                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */
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
  if (!line.trim()) return

  try {
    const msg: StreamMessage = JSON.parse(line)

    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text) {
          onEvent({ type: 'text', content: block.text })
        } else if (block.type === 'tool_use' && block.name) {
          onEvent({
            type: 'tool_use',
            toolName: block.name,
            toolInput: block.input,
            content: `调用工具: ${block.name}`,
          })
        }
      }
    } else if (msg.type === 'user' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'tool_result') {
          const resultText = typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content)
          onEvent({
            type: 'tool_result',
            toolResult: resultText,
            content: block.is_error ? `工具执行失败` : `工具执行完成`,
          })
        }
      }
    }
  } catch {
    // 非 JSON 行，忽略
  }
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
  // 确保 CLAUDE.md 存在于工作目录
  if (workDir) {
    copyClaudeMdToDir(workDir)
  }

  // 使用 sessionId 区分不同步骤的历史记录
  const historyFile = join(taskDir, `history-${sessionId}.txt`)
  const isNewSession = !existsSync(historyFile)
  console.log(`[Agent] Task directory: ${taskDir}`)
  console.log(`[Agent] Is new session: ${isNewSession}`)

  onEvent({ type: 'init', taskDir, content: `任务目录: ${taskDir}` })

  const timestamp = new Date().toISOString()
  const historyEntry = `\n[${timestamp}] User:\n${userQuery}\n`
  writeFileSync(historyFile, historyEntry, { flag: 'a' })

  const claudeCodePath = findClaudeCodePath()
  if (!claudeCodePath) {
    onEvent({
      type: 'error',
      content: 'Claude Code 未安装。请运行: npm install -g @anthropic-ai/claude-code',
    })
    onEvent({ type: 'done' })
    return
  }

  console.log(`[Agent] Claude Code: ${claudeCodePath}`)
  console.log(`[Agent] Model: ${process.env.ANTHROPIC_MODEL || 'default'}`)

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

  const prompt = isNewSession
    ? `${skill.systemPrompt}\n\n---\n\n用户问题：${userQuery}`
    : userQuery

  console.log(`[Agent] Args: ${args.join(' ')}`)

  const proc = spawn(claudeCodePath, args, {
    cwd: taskDir,
    env: buildEnvConfig(),
    shell: isWindows,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  proc.stdin.write(prompt)
  proc.stdin.end()

  let lineBuffer = ''

  proc.stdout.on('data', (data: Buffer) => {
    lineBuffer += data.toString()
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() || ''
    for (const line of lines) {
      parseStreamLine(line, onEvent)
    }
  })

  proc.stderr.on('data', (data: Buffer) => {
    console.error('[Agent] stderr:', data.toString())
  })

  const abortHandler = () => proc.kill('SIGTERM')
  signal.addEventListener('abort', abortHandler)

  return new Promise((resolve) => {
    proc.on('close', (code) => {
      signal.removeEventListener('abort', abortHandler)
      if (lineBuffer.trim()) parseStreamLine(lineBuffer, onEvent)

      if (signal.aborted) {
        onEvent({ type: 'error', content: '执行被中止' })
      } else if (code !== 0) {
        onEvent({ type: 'error', content: `Claude Code 退出码: ${code}` })
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
