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
import { memoryFileManager, memoryOrchestrator } from './memory/index.js'
import { buildClaudeEnvConfig, findClaudeCodePath } from './claude-cli.js'
import { DATA_DIR } from './paths.js'

/* ════════════════════════════════════════════════════════════════════════════
 *  默认超时时间：30 分钟
 *  防止 Claude Code CLI 卡住导致任务永远挂起
 * ════════════════════════════════════════════════════════════════════════════ */
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000

const WORKFLOW_CONTEXT_PATTERN = /##\s*工作流执行上下文/

function shouldPersistMemory(skillId: string, userQuery: string): boolean {
  if (WORKFLOW_CONTEXT_PATTERN.test(userQuery)) return false
  return true
}

function stripWorkflowContext(userQuery: string): string {
  if (!WORKFLOW_CONTEXT_PATTERN.test(userQuery)) return userQuery
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
  type: 'init' | 'text' | 'tool_use' | 'tool_result' | 'error' | 'done' | 'stopped'
  content?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolUseId?: string
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

  // 每轮都构建并写入系统提示词（确保记忆实时生效）
  const retrieved = memoryOrchestrator.retrieve({
    sessionId,
    skillId: skill.meta.id,
    query: userQuery,
    tokenBudget: 4000,
  })
  memoryFileManager.ensureSkillMemoryDir(skill.meta.id)

  const systemPrompt = retrieved.context
    ? `${retrieved.context}\n\n---\n\n${skill.systemPrompt}`
    : skill.systemPrompt

  const claudeMdPath = join(taskDir, 'CLAUDE.md')
  writeFileSync(claudeMdPath, systemPrompt, 'utf-8')
  console.log(`[Agent] 已写入系统提示词到 ${claudeMdPath}`)

  // 用户消息只包含查询内容
  const prompt = userQuery

  console.log(`[Agent] Args: ${args.join(' ')}`)

  const proc = spawn(claudeCodePath, args, {
    cwd: taskDir,
    env: buildClaudeEnvConfig(),
    shell: isWindows,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  proc.stdin.write(prompt)
  proc.stdin.end()

  let lineBuffer = ''
  let agentResponse = ''  // 收集 Agent 的文本输出
  let toolSummary = ''    // 收集工具调用摘要

  /* ────────────────────────────────────────────────────────────────────────
   *  包装 onEvent：统一收集文本和工具调用信息
   * ──────────────────────────────────────────────────────────────────────── */
  const wrappedOnEvent = (event: AgentEvent) => {
    onEvent(event)
    if (event.type === 'text' && event.content) {
      agentResponse += event.content
    }
    if (event.type === 'tool_use' && event.toolName) {
      const desc = event.toolInput?.description || event.toolInput?.file_path || event.toolInput?.command || ''
      toolSummary += `[工具: ${event.toolName}] ${String(desc).slice(0, 100)}\n`
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
    console.error('[Agent] stderr:', data.toString('utf-8'))
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
    proc.on('close', async (code) => {
      clearTimeout(timeoutId)
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
      } else if (timedOut) {
        onEvent({ type: 'error', content: `执行超时 (${effectiveTimeout / 1000}s)` })
      } else {
        // 正常完成：记录记忆 + 发送 done
        if (code === 0 && agentResponse.trim()) {
          try {
            if (shouldPersistMemory(skill.meta.id, userQuery)) {
              const result = await memoryOrchestrator.extractAndUpsert({
                sessionId,
                skillId: skill.meta.id,
                userQuery: stripWorkflowContext(userQuery),
                assistantResponse: toolSummary
                  ? `${agentResponse}\n\n## 工具调用记录\n${toolSummary}`
                  : agentResponse,
              })
              console.log(`[Agent] 已记录到三级记忆: method=${result.extractionMethod}, cells=${result.written.cells}`)
            }
          } catch (err) {
            console.error('[Agent] 记录记忆失败:', err)
          }
        }
        if (code !== 0) {
          onEvent({ type: 'error', content: `Claude Code 退出码: ${code}` })
        } else {
          onEvent({ type: 'done' })
        }
      }
      resolve()
    })

    proc.on('error', (err) => {
      clearTimeout(timeoutId)
      signal.removeEventListener('abort', abortHandler)
      onEvent({ type: 'error', content: err.message })
      resolve()
    })
  })
}
