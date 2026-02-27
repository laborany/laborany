/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Agent 执行器 (Claude Code CLI)                    ║
 * ║                                                                          ║
 * ║  职责：通过 Claude Code CLI 执行 Agent                                     ║
 * ║  设计：每个任务独立工作目录，完整展示中间过程                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { spawn, execSync } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { platform } from 'os'
import { join } from 'path'
import type { Skill } from 'laborany-shared'
import { BUILTIN_SKILLS_DIR, USER_SKILLS_DIR, getUserDir } from 'laborany-shared'
import { memoryFileManager, memoryOrchestrator, memoryAsyncQueue } from './memory/index.js'
import { buildClaudeEnvConfig, checkRuntimeDependencies, resolveClaudeCliLaunch, type ModelOverride } from './claude-cli.js'
import { APP_HOME_DIR, DATA_DIR } from './paths.js'
import { refreshRuntimeConfig } from './runtime-config.js'

/* ════════════════════════════════════════════════════════════════════════════
 *  默认超时时间：30 分钟
 *  防止 Claude Code CLI 卡住导致任务永远挂起
 * ════════════════════════════════════════════════════════════════════════════ */

const PIPELINE_CONTEXT_PATTERN = /##\s*.*执行上下文/

function shouldPersistMemory(skillId: string, userQuery: string): boolean {
  if (PIPELINE_CONTEXT_PATTERN.test(userQuery)) return false
  return true
}

function stripPipelineContext(userQuery: string): string {
  if (!PIPELINE_CONTEXT_PATTERN.test(userQuery)) return userQuery
  const parts = userQuery
    .split(/\n-{3,}\n/)
    .map(item => item.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : userQuery
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface AgentEvent {
  type: 'init' | 'text' | 'tool_use' | 'tool_result' | 'warning' | 'error' | 'done' | 'stopped' | 'status'
  content?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolUseId?: string
  toolResult?: string
  taskDir?: string
  isError?: boolean  // 结构化错误标记，用于判断执行是否失败
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                    stderr 分类：识别 CLI 重试/错误信息                     │
 * │                                                                          │
 * │  Claude Code CLI 在 stderr 输出重试进度和网络错误，                        │
 * │  匹配到的行透传到前端，其余仅打印到控制台                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const STDERR_FORWARD_PATTERN = /retry|retrying|attempt|reconnect|error|failed|timeout|refused|ECONNREFUSED|ETIMEDOUT|rate.limit|overloaded|529|503/i

const IDLE_WARNING_THRESHOLD_MS = 10 * 60 * 1000
const IDLE_WARNING_CHECK_INTERVAL_MS = 60 * 1000

interface ExecuteOptions {
  skill: Skill
  query: string
  sessionId: string
  signal: AbortSignal
  onEvent: (event: AgentEvent) => void
  modelOverride?: ModelOverride
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       任务目录管理                                        │
 * │                                                                          │
 * │  使用用户数据目录存储任务，避免 pkg 打包后的 snapshot 只读问题             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getTaskDir(sessionId: string): string {
  return join(DATA_DIR, 'tasks', sessionId)
}

function ensureTaskDir(sessionId: string): string {
  const taskDir = getTaskDir(sessionId)
  if (!existsSync(taskDir)) {
    mkdirSync(taskDir, { recursive: true })
  }
  return taskDir
}

function normalizePathForPrompt(path: string): string {
  return path.replace(/\\/g, '/')
}

function getRuntimePlatformLabel(): string {
  if (platform() === 'win32') return 'Windows'
  if (platform() === 'darwin') return 'macOS'
  return 'Linux'
}

function buildLaborAnyRuntimeContext(taskDir: string, skillId: string): string {
  const tasksBase = join(DATA_DIR, 'tasks')
  const uploadsBase = join(APP_HOME_DIR, 'uploads')
  const envPath = join(APP_HOME_DIR, '.env')
  const userHome = getUserDir()

  return [
    '# LaborAny Runtime Context (Desktop App)',
    '',
    `- Platform: ${getRuntimePlatformLabel()} (${process.platform})`,
    `- Current skill ID: ${skillId}`,
    `- Current task working directory (cwd): ${normalizePathForPrompt(taskDir)}`,
    `- Task root directory: ${normalizePathForPrompt(tasksBase)}`,
    `- Uploaded files cache: ${normalizePathForPrompt(uploadsBase)}`,
    `- User skills directory (read/write): ${normalizePathForPrompt(USER_SKILLS_DIR)}`,
    `- Builtin skills directory (read-only): ${normalizePathForPrompt(BUILTIN_SKILLS_DIR)}`,
    `- LaborAny user home: ${normalizePathForPrompt(userHome)}`,
    `- LaborAny app home: ${normalizePathForPrompt(APP_HOME_DIR)}`,
    `- Primary env file path: ${normalizePathForPrompt(envPath)}`,
    '',
    'Execution constraints:',
    '- You are running inside LaborAny desktop app.',
    '- Prefer reading/writing files in current task cwd unless user explicitly requests another location.',
    '- When creating or updating skills, write under user skills directory, never builtin skills directory.',
    '- In task replies, use concrete absolute paths when asking users to inspect files.',
  ].join('\n')
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

function parseStreamLine(line: string, onEvent: (event: AgentEvent) => void): AgentEvent | null {
  if (!line.trim()) return null

  try {
    const msg: StreamMessage = JSON.parse(line)
    let lastEvent: AgentEvent | null = null
    const textChunks: string[] = []

    // 处理 assistant 消息（文本和工具调用）
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text) {
          const event: AgentEvent = { type: 'text', content: block.text }
          onEvent(event)
          textChunks.push(block.text)
          lastEvent = event
        } else if (block.type === 'tool_use' && block.name) {
          const event: AgentEvent = {
            type: 'tool_use',
            toolName: block.name,
            toolInput: block.input,
            toolUseId: block.id,
            content: `调用工具: ${block.name}`,
          }
          onEvent(event)
          lastEvent = event
        }
      }

      if (textChunks.length > 0) {
        return {
          type: 'text',
          content: textChunks.join(''),
        }
      }

      return lastEvent
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
          lastEvent = {
            type: 'tool_result',
            toolResult: resultText,
            content: block.is_error ? `工具执行失败` : `工具执行完成`,
          }
        }
      }

      return lastEvent
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
  const { skill, query: userQuery, sessionId, signal, onEvent, modelOverride } = options

  refreshRuntimeConfig()

  let lastProgressAt = Date.now()
  let idleWarningSent = false

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

  const cliLaunch = resolveClaudeCliLaunch()
  if (!cliLaunch) {
    onEvent({
      type: 'error',
      content: 'Claude Code 未安装。请运行: npm install -g @anthropic-ai/claude-code',
    })
    onEvent({ type: 'done' })
    return
  }

  const dependencyIssue = checkRuntimeDependencies()
  if (dependencyIssue) {
    onEvent({
      type: 'error',
      content: `[${dependencyIssue.code}] ${dependencyIssue.message}\n${dependencyIssue.installHint}`,
    })
    onEvent({ type: 'done' })
    return
  }

  console.log(`[Agent] Claude CLI source: ${cliLaunch.source}`)
  console.log(`[Agent] Claude CLI command: ${cliLaunch.command}`)
  const effectiveModel = modelOverride?.model || process.env.ANTHROPIC_MODEL
  console.log(`[Agent] Model: ${effectiveModel || 'default'}`)

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

  if (effectiveModel) {
    args.push('--model', effectiveModel)
  }

  // 每轮都构建并写入系统提示词（确保记忆实时生效）
  const retrieved = memoryOrchestrator.retrieve({
    sessionId,
    skillId: skill.meta.id,
    query: userQuery,
    tokenBudget: 4000,
  })
  memoryFileManager.ensureSkillMemoryDir(skill.meta.id)
  const runtimeContext = buildLaborAnyRuntimeContext(taskDir, skill.meta.id)

  const systemPrompt = retrieved.context
    ? `${runtimeContext}\n\n---\n\n${retrieved.context}\n\n---\n\n${skill.systemPrompt}`
    : `${runtimeContext}\n\n---\n\n${skill.systemPrompt}`

  const claudeMdPath = join(taskDir, 'CLAUDE.md')
  writeFileSync(claudeMdPath, systemPrompt, 'utf-8')
  console.log(`[Agent] 已写入系统提示词到 ${claudeMdPath}`)

  // 用户消息只包含查询内容
  const prompt = userQuery

  console.log(`[Agent] Args: ${args.join(' ')}`)

  const spawnArgs = [...cliLaunch.argsPrefix, ...args]

  const proc = spawn(cliLaunch.command, spawnArgs, {
    cwd: taskDir,
    env: buildClaudeEnvConfig(modelOverride),
    shell: cliLaunch.shell,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  proc.stdin.write(prompt)
  proc.stdin.end()

  let lineBuffer = ''
  let agentResponse = ''  // 收集 Agent 的文本输出
  let toolSummary = ''    // 收集工具调用摘要
  let stderrBuffer = ''

  /* ────────────────────────────────────────────────────────────────────────
   *  包装 onEvent：统一收集文本和工具调用信息
   * ──────────────────────────────────────────────────────────────────────── */
  const wrappedOnEvent = (event: AgentEvent) => {
    onEvent(event)
    if (event.type === 'text' && event.content) {
      lastProgressAt = Date.now()
      idleWarningSent = false
      agentResponse += event.content
    }
    if (event.type === 'tool_use' && event.toolName) {
      lastProgressAt = Date.now()
      idleWarningSent = false
      const desc = event.toolInput?.description || event.toolInput?.file_path || event.toolInput?.command || ''
      toolSummary += `[工具: ${event.toolName}] ${String(desc).slice(0, 100)}\n`
    }
    if (event.type === 'tool_result') {
      lastProgressAt = Date.now()
      idleWarningSent = false
    }
  }

  proc.stdout.on('data', (data: Buffer) => {
    lineBuffer += data.toString('utf-8')
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() || ''
    for (const line of lines) {
      parseStreamLine(line, wrappedOnEvent)
    }
  })

  proc.stderr.on('data', (data: Buffer) => {
    const chunk = data.toString('utf-8')
    stderrBuffer += chunk
    if (stderrBuffer.length > 4000) {
      stderrBuffer = stderrBuffer.slice(-4000)
    }
    console.error('[Agent] stderr:', chunk)

    /* 逐行检查，匹配到重试/错误模式的行透传到前端 */
    for (const line of chunk.split('\n')) {
      const trimmed = line.trim()
      if (trimmed && STDERR_FORWARD_PATTERN.test(trimmed)) {
        onEvent({ type: 'status', content: trimmed })
      }
    }
  })

  const abortHandler = () => {
    if (platform() === 'win32') {
      try {
        execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' })
      } catch {
        proc.kill('SIGTERM')
      }
    } else {
      proc.kill('SIGTERM')
    }
  }
  signal.addEventListener('abort', abortHandler)

  const idleWarningTimer = setInterval(() => {
    if (signal.aborted) return
    if (proc.exitCode !== null || proc.killed) return

    const idleMs = Date.now() - lastProgressAt
    if (idleMs < IDLE_WARNING_THRESHOLD_MS || idleWarningSent) {
      return
    }

    idleWarningSent = true
    onEvent({
      type: 'warning',
      content: '任务执行时间较长，已超过 10 分钟无新输出。任务仍在继续，请耐心等待。',
    })
  }, IDLE_WARNING_CHECK_INTERVAL_MS)

  /* ────────────────────────────────────────────────────────────────────────
   *  超时保护：防止任务无限挂起
   * ──────────────────────────────────────────────────────────────────────── */
  return new Promise((resolve) => {
    proc.on('close', async (code) => {
      clearInterval(idleWarningTimer)
      signal.removeEventListener('abort', abortHandler)
      if (lineBuffer.trim()) {
        parseStreamLine(lineBuffer, wrappedOnEvent)
      }

      /* ──────────────────────────────────────────────────────────────────────
       *  终止事件：stopped / error / done 互斥，只发一个
       *  避免后续 done 覆盖 stopped/error 的状态
       * ────────────────────────────────────────────────────────────────────── */
      if (signal.aborted) {
        onEvent({ type: 'stopped', content: '任务已停止' })
      } else {
        // 正常完成：记录记忆 + 发送 done
        if (code === 0) {
          try {
            if (shouldPersistMemory(skill.meta.id, userQuery)) {
              const memoryParams = {
                sessionId,
                skillId: skill.meta.id,
                userQuery: stripPipelineContext(userQuery),
                assistantResponse: toolSummary
                  ? `${agentResponse}\n\n## 工具调用记录\n${toolSummary}`
                  : agentResponse,
              }
              if (memoryAsyncQueue.isEnabled()) {
                const queued = memoryAsyncQueue.enqueue(memoryParams)
                console.log(`[Agent] Memory task queued: jobId=${queued.jobId}`)
              } else {
                const result = await memoryAsyncQueue.runSync(memoryParams)
                console.log(`[Agent] Memory write completed: method=${result.extractionMethod}, cells=${result.written.cells}`)
              }
            }
          } catch (err) {
            console.error('[Agent] 记录记忆失败:', err)
          }
        }
        if (code !== 0) {
          const stderrSnippet = stderrBuffer.trim().slice(0, 600)
          onEvent({
            type: 'error',
            content: stderrSnippet
              ? `Claude Code 退出码: ${code}\n${stderrSnippet}`
              : `Claude Code 退出码: ${code}`,
          })
        } else {
          onEvent({ type: 'done' })
        }
      }
      resolve()
    })

    proc.on('error', (err) => {
      clearInterval(idleWarningTimer)
      signal.removeEventListener('abort', abortHandler)
      onEvent({ type: 'error', content: err.message })
      resolve()
    })
  })
}
