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
import { memoryInjector, memoryFileManager } from './memory/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/* ════════════════════════════════════════════════════════════════════════════
 *  默认超时时间：30 分钟
 *  防止 Claude Code CLI 卡住导致任务永远挂起
 * ════════════════════════════════════════════════════════════════════════════ */
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000

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
  isError?: boolean  // 结构化错误标记，用于判断执行是否失败
}

interface ExecuteOptions {
  skill: Skill
  query: string
  sessionId: string
  signal: AbortSignal
  onEvent: (event: AgentEvent) => void
  timeoutMs?: number  // 执行超时时间（毫秒），默认 30 分钟
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       任务目录管理                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getTaskDir(sessionId: string): string {
  // agent-service/src/agent-executor.ts -> laborany/tasks/
  const laboranyRoot = join(__dirname, '..', '..')
  return join(laboranyRoot, 'tasks', sessionId)
}

function ensureTaskDir(sessionId: string): string {
  const taskDir = getTaskDir(sessionId)
  if (!existsSync(taskDir)) {
    mkdirSync(taskDir, { recursive: true })
  }
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

    // 处理 assistant 消息（文本和工具调用）
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
    }
    // 处理 user 消息（工具结果）
    else if (msg.type === 'user' && msg.message?.content) {
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
  const { skill, query: userQuery, sessionId, signal, onEvent, timeoutMs } = options
  const effectiveTimeout = timeoutMs ?? DEFAULT_TIMEOUT_MS

  if (signal.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  // 创建任务目录
  const taskDir = ensureTaskDir(sessionId)
  const historyFile = join(taskDir, 'history.txt')
  const isNewSession = !existsSync(historyFile)
  console.log(`[Agent] Task directory: ${taskDir}`)
  console.log(`[Agent] Is new session: ${isNewSession}`)

  // 发送初始化事件
  onEvent({ type: 'init', taskDir, content: `任务目录: ${taskDir}` })

  // 追加用户查询到历史记录
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

  // 会话管理：继续会话用 --continue，新会话不需要特殊参数
  if (!isNewSession) {
    args.push('--continue')
  }

  if (process.env.ANTHROPIC_MODEL) {
    args.push('--model', process.env.ANTHROPIC_MODEL)
  }

  // 构建 prompt（集成 Memory 系统）
  let prompt: string
  if (isNewSession) {
    // 新会话：注入 Memory 上下文
    const memoryContext = memoryInjector.buildContext({
      skillId: skill.meta.id,
      userQuery,
    })
    // 确保 Skill 记忆目录存在
    memoryFileManager.ensureSkillMemoryDir(skill.meta.id)

    prompt = memoryContext
      ? `${memoryContext}\n\n---\n\n${skill.systemPrompt}\n\n---\n\n用户问题：${userQuery}`
      : `${skill.systemPrompt}\n\n---\n\n用户问题：${userQuery}`
  } else {
    // 继续会话：只发送用户问题
    prompt = userQuery
  }

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

  /* ────────────────────────────────────────────────────────────────────────
   *  超时保护：防止任务无限挂起
   * ──────────────────────────────────────────────────────────────────────── */
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    console.warn(`[Agent] 任务超时 (${effectiveTimeout / 1000}s)，强制终止`)
    proc.kill('SIGTERM')
  }, effectiveTimeout)

  return new Promise((resolve) => {
    proc.on('close', (code) => {
      clearTimeout(timeoutId)
      signal.removeEventListener('abort', abortHandler)
      if (lineBuffer.trim()) parseStreamLine(lineBuffer, onEvent)

      if (timedOut) {
        onEvent({ type: 'error', content: `执行超时 (${effectiveTimeout / 1000}s)` })
      } else if (signal.aborted) {
        onEvent({ type: 'error', content: '执行被中止' })
      } else if (code !== 0) {
        onEvent({ type: 'error', content: `Claude Code 退出码: ${code}` })
      }

      onEvent({ type: 'done' })
      resolve()
    })

    proc.on('error', (err) => {
      clearTimeout(timeoutId)
      signal.removeEventListener('abort', abortHandler)
      onEvent({ type: 'error', content: err.message })
      onEvent({ type: 'done' })
      resolve()
    })
  })
}
