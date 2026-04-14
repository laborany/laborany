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
import {
  BUILTIN_SKILLS_DIR,
  USER_SKILLS_DIR,
  getUserDir,
  normalizeReasoningEffort,
  resolveGenerativeWidgetSupport,
} from 'laborany-shared'
import { memoryFileManager, memoryOrchestrator, memoryAsyncQueue } from './memory/index.js'
import { communicationPreferenceManager } from './memory/communication-preferences.js'
import {
  buildClaudeCliPromptDelivery,
  buildClaudeEnvConfig,
  checkRuntimeDependencies,
  resolveClaudeCliLaunch,
  type ModelOverride,
} from './claude-cli.js'
import { APP_HOME_DIR, TASKS_DIR, UPLOADS_DIR } from './paths.js'
import { refreshRuntimeConfig } from './runtime-config.js'
import {
  writeMcpConfig,
  writeUserMcpConfig,
  isWidgetTool,
  createWidgetHandlerState,
  processStreamEvent,
  type WidgetHandlerState,
  type WidgetEvent,
} from './generative-ui/index.js'
import { writeWebResearchMcpConfig } from './web-research/index.js'
import { buildResearchPolicySection } from './web-research/policy/research-policy.js'

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
    | 'widget_start' | 'widget_delta' | 'widget_commit' | 'widget_error' | 'mcp_status'
  content?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolUseId?: string
  toolResult?: string
  taskDir?: string
  isError?: boolean  // 结构化错误标记，用于判断执行是否失败
  // Widget event fields
  widgetId?: string
  widgetTitle?: string
  widgetHtml?: string
  mcpServers?: McpServerStatus[]
}

export interface McpServerStatus {
  name: string
  status: 'connected' | 'failed' | 'disabled' | 'connecting'
  reason?: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                    stderr 分类：识别 CLI 重试/错误信息                     │
 * │                                                                          │
 * │  Claude Code CLI 在 stderr 输出重试进度和网络错误，                        │
 * │  匹配到的行透传到前端，其余仅打印到控制台                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const STDERR_FORWARD_PATTERN = /retry|retrying|attempt|reconnect|error|failed|timeout|refused|ECONNREFUSED|ETIMEDOUT|rate.limit|overloaded|529|503/i
const MISSING_PRINT_INPUT_RE = /Input must be provided either through stdin or as a prompt argument when using --print/i

const IDLE_WARNING_THRESHOLD_MS = 10 * 60 * 1000
const IDLE_WARNING_CHECK_INTERVAL_MS = 60 * 1000

function formatClaudeCliExitError(code: number | null, stderrSnippet: string): string {
  const trimmed = stderrSnippet.trim()
  if (MISSING_PRINT_INPUT_RE.test(trimmed)) {
    return '执行内容为空。请先输入任务内容，或上传文件后再试。'
  }
  return trimmed
    ? `Claude Code 退出码: ${code}\n${trimmed}`
    : `Claude Code 退出码: ${code}`
}

interface ExecuteOptions {
  skill: Skill
  query: string
  sessionId: string
  signal: AbortSignal
  onEvent: (event: AgentEvent) => void
  modelOverride?: ModelOverride
  modelProfileId?: string
  enableWidgets?: boolean
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       任务目录管理                                        │
 * │                                                                          │
 * │  使用用户数据目录存储任务，避免 pkg 打包后的 snapshot 只读问题             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getTaskDir(sessionId: string): string {
  return join(TASKS_DIR, sessionId)
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

function resolveMcpNodeCommand(nodePath?: string): string {
  if (nodePath) return nodePath
  const execPath = process.execPath.toLowerCase()
  if (execPath.endsWith('/node') || execPath.endsWith('/node.exe') || execPath.endsWith('\\node') || execPath.endsWith('\\node.exe')) {
    return process.execPath
  }
  return 'node'
}

function getRuntimePlatformLabel(): string {
  if (platform() === 'win32') return 'Windows'
  if (platform() === 'darwin') return 'macOS'
  return 'Linux'
}

function buildLaborAnyRuntimeContext(taskDir: string, skillId: string, sessionId: string): string {
  const tasksBase = TASKS_DIR
  const uploadsBase = UPLOADS_DIR
  const envPath = join(APP_HOME_DIR, '.env')
  const userHome = getUserDir()

  return [
    '# LaborAny Runtime Context (Desktop App)',
    '',
    `- Platform: ${getRuntimePlatformLabel()} (${process.platform})`,
    `- Current skill ID: ${skillId}`,
    `- Current session ID: ${sessionId}`,
    `- Current task working directory (cwd): ${normalizePathForPrompt(taskDir)}`,
    `- Task root directory: ${normalizePathForPrompt(tasksBase)}`,
    `- Uploaded files cache: ${normalizePathForPrompt(uploadsBase)}`,
    `- User skills directory (read/write): ${normalizePathForPrompt(USER_SKILLS_DIR)}`,
    `- Builtin skills directory (read-only): ${normalizePathForPrompt(BUILTIN_SKILLS_DIR)}`,
    `- LaborAny user home: ${normalizePathForPrompt(userHome)}`,
    `- LaborAny app home: ${normalizePathForPrompt(APP_HOME_DIR)}`,
    `- Primary env file path: ${normalizePathForPrompt(envPath)}`,
    `- API base URL: http://localhost:${process.env.AGENT_PORT || 3002}`,
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
  mcp_servers?: Array<{ name?: string; status?: string }>
  // stream_event fields
  event?: {
    type?: string
    content_block?: ContentBlock
    delta?: { type?: string; text?: string; partial_json?: string }
    index?: number
  }
}

interface ParseStreamContext {
  widgetState?: WidgetHandlerState
  onWidgetEvent?: (event: WidgetEvent) => void
}

function parseStreamLine(
  line: string,
  onEvent: (event: AgentEvent) => void,
  ctx?: ParseStreamContext,
): AgentEvent | null {
  if (!line.trim()) return null

  try {
    const msg: StreamMessage = JSON.parse(line)
    let lastEvent: AgentEvent | null = null
    const textChunks: string[] = []

    if (msg.type === 'system' && msg.subtype === 'init' && Array.isArray(msg.mcp_servers)) {
      const mcpServers = msg.mcp_servers
        .map((server) => {
          const name = typeof server.name === 'string' ? server.name.trim() : ''
          const status = typeof server.status === 'string' ? server.status.trim() : ''
          if (!name) return null
          if (status === 'connected' || status === 'failed' || status === 'disabled') {
            return { name, status } satisfies McpServerStatus
          }
          return { name, status: 'connecting' as const }
        })
        .filter(Boolean) as McpServerStatus[]

      if (mcpServers.length > 0) {
        const event: AgentEvent = { type: 'mcp_status', mcpServers }
        onEvent(event)
        return event
      }
    }

    // 处理 assistant 消息（文本和工具调用）
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text) {
          const event: AgentEvent = { type: 'text', content: block.text }
          onEvent(event)
          textChunks.push(block.text)
          lastEvent = event
        } else if (block.type === 'tool_use' && block.name) {
          // Check if this is a widget tool — emit widget_commit
          if (ctx?.widgetState && isWidgetTool(block.name)) {
            const widgetEvt = processStreamEvent(
              ctx.widgetState,
              'tool_use_complete',
              undefined,
              { ...block.input, _toolName: block.name },
            )
            if (widgetEvt) ctx.onWidgetEvent?.(widgetEvt)
          }
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
    // 处理 stream_event（widget tool 检测）
    else if (msg.type === 'stream_event' && msg.event && ctx?.widgetState) {
      const evt = msg.event
      if (evt.type === 'content_block_start' && evt.content_block) {
        const widgetEvt = processStreamEvent(
          ctx.widgetState,
          'content_block_start',
          evt.content_block as any,
        )
        if (widgetEvt) ctx.onWidgetEvent?.(widgetEvt)
      } else if (evt.type === 'content_block_delta' && evt.delta?.type === 'input_json_delta') {
        const widgetEvt = processStreamEvent(
          ctx.widgetState,
          'input_json_delta',
          undefined,
          { partial_json: evt.delta.partial_json || '' },
        )
        if (widgetEvt) ctx.onWidgetEvent?.(widgetEvt)
      }
    }
  } catch {
    // 非 JSON 行，忽略
  }
  return null
}

function normalizeMcpReason(reason: string): string {
  const text = reason.trim()
  if (!text) return ''
  return text
    .replace(/^Connection failed:\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .replace(/^HTTP Connection failed after \d+ms:\s*/i, '')
    .replace(/^Connection failed after \d+ms:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function updateMcpServerStatuses(
  current: Map<string, McpServerStatus>,
  incoming: McpServerStatus[],
): McpServerStatus[] | null {
  let changed = false

  for (const server of incoming) {
    const prev = current.get(server.name)
    if (!prev || prev.status !== server.status || prev.reason !== server.reason) {
      current.set(server.name, server)
      changed = true
    }
  }

  if (!changed) return null
  return Array.from(current.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function parseMcpStatusLine(line: string): McpServerStatus | null {
  const connectedMatch = line.match(/MCP server "([^"]+)": Successfully connected/i)
  if (connectedMatch) {
    return { name: connectedMatch[1], status: 'connected' }
  }

  const failedMatch = line.match(/MCP server "([^"]+)": (?:HTTP )?Connection failed(?: after \d+ms)?: (.+)$/i)
  if (failedMatch) {
    return {
      name: failedMatch[1],
      status: 'failed',
      reason: normalizeMcpReason(failedMatch[2]),
    }
  }

  const errorMatch = line.match(/MCP server "([^"]+)" Connection failed: (.+)$/i)
  if (errorMatch) {
    return {
      name: errorMatch[1],
      status: 'failed',
      reason: normalizeMcpReason(errorMatch[2]),
    }
  }

  return null
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       执行 Agent 主函数                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export async function executeAgent(options: ExecuteOptions): Promise<void> {
  const { skill, query: userQuery, sessionId, signal, onEvent, modelOverride, modelProfileId, enableWidgets } = options

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
  const effectiveBaseUrl = modelOverride?.baseUrl || process.env.ANTHROPIC_BASE_URL
  const effectiveReasoningEffort = normalizeReasoningEffort(
    modelOverride?.reasoningEffort || process.env.LABORANY_REASONING_EFFORT || process.env.CLAUDE_CODE_EFFORT_LEVEL,
  )
  const widgetSupport = resolveGenerativeWidgetSupport({
    requested: Boolean(enableWidgets),
    interfaceType: modelOverride?.interfaceType || process.env.LABORANY_MODEL_INTERFACE,
    model: effectiveModel,
    baseUrl: effectiveBaseUrl,
  })
  const cliWidgetRuntimeEnabled = widgetSupport.enabled && widgetSupport.runtime === 'claude_cli_mcp'
  console.log(`[Agent] Model: ${effectiveModel || 'default'}`)

  const args = [
    '--print',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--dangerously-skip-permissions',
  ]

  // 会话管理：继续会话用 --continue，新会话不需要特殊参数
  if (!isNewSession) {
    args.push('--continue')
  }

  if (effectiveModel) {
    args.push('--model', effectiveModel)
  }
  if (effectiveReasoningEffort) {
    args.push('--effort', effectiveReasoningEffort)
  }

  // ── Generative UI: MCP config + widget state ──
  let widgetState: WidgetHandlerState | undefined
  if (cliWidgetRuntimeEnabled) {
    try {
      const mcpNodeCommand = resolveMcpNodeCommand(cliLaunch.source === 'bundled' ? cliLaunch.command : undefined)
      const widgetMcpPath = writeMcpConfig(taskDir, mcpNodeCommand)
      const userMcpPath = writeUserMcpConfig(taskDir)

      // 传递 widget MCP 和用户 MCP（如果存在）
      args.push('--mcp-config', widgetMcpPath)
      if (userMcpPath) {
        args.push('--mcp-config', userMcpPath)
      }

      widgetState = createWidgetHandlerState()
      // Keep execute on plain MCP wiring: `--print` + `--debug mcp` makes
      // Claude CLI drop stdin prompts and fail the whole skill run.
      console.log(`[Agent] Generative UI enabled, MCP configs: ${widgetMcpPath}${userMcpPath ? `, ${userMcpPath}` : ''}`)
    } catch (err) {
      console.error('[Agent] Failed to write MCP config for generative UI:', err)
      onEvent({
        type: 'warning',
        content: `可视化组件初始化失败: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  } else {
    // Widget 未启用时，只传递用户配置的 MCP 服务器
    try {
      const userMcpPath = writeUserMcpConfig(taskDir)
      if (userMcpPath) {
        args.push('--mcp-config', userMcpPath)
        console.log(`[Agent] User MCP config injected: ${userMcpPath}`)
      }
    } catch (err) {
      console.error('[Agent] Failed to write user MCP config:', err)
    }
    if (enableWidgets) {
      const disableReason = widgetSupport.reasonMessage
        || (widgetSupport.enabled ? 'Current execute surface only supports the Claude CLI widget runtime.' : 'unknown reason')
      console.log(`[Agent] Generative UI requested but disabled: ${disableReason}`)
    }
  }

  // ── Web Research MCP: 对所有用户统一注入 ──
  try {
    const webMcpPath = writeWebResearchMcpConfig(taskDir, {
      agentServicePort: process.env.AGENT_PORT || '3002',
      nodePath: resolveMcpNodeCommand(cliLaunch.source === 'bundled' ? cliLaunch.command : undefined),
      modelProfileId,
    })
    args.push('--mcp-config', webMcpPath)
    console.log(`[Agent] Web Research MCP injected: ${webMcpPath}`)
  } catch (err) {
    console.error('[Agent] Failed to inject web research MCP:', err)
  }

  communicationPreferenceManager.applyFromUserText(userQuery, userQuery)

  // 每轮都构建并写入系统提示词（确保记忆实时生效）
  const retrieved = memoryOrchestrator.retrieve({
    sessionId,
    skillId: skill.meta.id,
    query: userQuery,
    tokenBudget: 4000,
  })
  memoryFileManager.ensureSkillMemoryDir(skill.meta.id)
  const runtimeContext = buildLaborAnyRuntimeContext(taskDir, skill.meta.id, sessionId)
  const sections = [runtimeContext]
  if (!skill.systemPrompt.includes('## 联网调研策略')) {
    sections.push(buildResearchPolicySection())
  }
  if (retrieved.context) {
    sections.push(retrieved.context)
  }
  sections.push(skill.systemPrompt)
  const systemPrompt = sections.join('\n\n---\n\n')

  const claudeMdPath = join(taskDir, 'CLAUDE.md')
  writeFileSync(claudeMdPath, systemPrompt, 'utf-8')
  console.log(`[Agent] 已写入系统提示词到 ${claudeMdPath}`)

  // 用户消息只包含查询内容
  const prompt = userQuery

  if (!prompt.trim()) {
    onEvent({
      type: 'error',
      content: '执行内容为空。请先输入任务内容，或上传文件后再试。',
    })
    onEvent({ type: 'done' })
    return
  }

  console.log(`[Agent] Args: ${args.join(' ')}`)

  const promptDelivery = buildClaudeCliPromptDelivery(cliLaunch, args, prompt)
  const spawnArgs = [...cliLaunch.argsPrefix, ...promptDelivery.args]

  const proc = spawn(cliLaunch.command, spawnArgs, {
    cwd: taskDir,
    env: buildClaudeEnvConfig(modelOverride),
    shell: cliLaunch.shell,
    stdio: [promptDelivery.useStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
  })

  if (promptDelivery.useStdin) {
    if (!proc.stdin) {
      throw new Error('Claude CLI stdin is unavailable')
    }
    proc.stdin.write(prompt, 'utf-8')
    proc.stdin.end()
  }

  let lineBuffer = ''
  let agentResponse = ''  // 收集 Agent 的文本输出
  let toolSummary = ''    // 收集工具调用摘要
  let stderrBuffer = ''
  const mcpServerStatuses = new Map<string, McpServerStatus>()

  /* ────────────────────────────────────────────────────────────────────────
   *  包装 onEvent：统一收集文本和工具调用信息
   * ──────────────────────────────────────────────────────────────────────── */
  const onWidgetEvent = (evt: WidgetEvent) => {
    if (evt.type === 'widget_start') {
      onEvent({ type: 'widget_start', widgetId: evt.widgetId, widgetTitle: evt.title })
    } else if (evt.type === 'widget_delta') {
      onEvent({ type: 'widget_delta', widgetId: evt.widgetId, widgetHtml: evt.html })
    } else if (evt.type === 'widget_commit') {
      onEvent({ type: 'widget_commit', widgetId: evt.widgetId, widgetTitle: evt.title, widgetHtml: evt.html })
    } else if (evt.type === 'widget_error') {
      onEvent({ type: 'widget_error', widgetId: evt.widgetId, content: evt.message })
    }
  }

  const streamCtx: ParseStreamContext | undefined = widgetState
    ? { widgetState, onWidgetEvent }
    : undefined

  const wrappedOnEvent = (event: AgentEvent) => {
    if (event.type === 'mcp_status' && Array.isArray(event.mcpServers)) {
      const merged = updateMcpServerStatuses(mcpServerStatuses, event.mcpServers)
      if (merged) {
        onEvent({ type: 'mcp_status', mcpServers: merged })
      }
      return
    }

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

  if (!proc.stdout || !proc.stderr) {
    throw new Error('Claude CLI stdio is unavailable')
  }

  proc.stdout.on('data', (data: Buffer) => {
    lineBuffer += data.toString('utf-8')
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() || ''
    for (const line of lines) {
      parseStreamLine(line, wrappedOnEvent, streamCtx)
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
      const mcpUpdate = parseMcpStatusLine(trimmed)
      if (mcpUpdate) {
        const merged = updateMcpServerStatuses(mcpServerStatuses, [mcpUpdate])
        if (merged) {
          onEvent({ type: 'mcp_status', mcpServers: merged })
        }
      }
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
        parseStreamLine(lineBuffer, wrappedOnEvent, streamCtx)
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
          // Append assistant response to history.txt for complete conversation export
          if (agentResponse.trim()) {
            const assistantEntry = `\n[${new Date().toISOString()}] Assistant:\n${agentResponse}\n`
            writeFileSync(historyFile, assistantEntry, { flag: 'a' })
          }

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
            content: formatClaudeCliExitError(code, stderrSnippet),
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
