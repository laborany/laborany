/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Agent 执行器 (Claude Code CLI)                    ║
 * ║                                                                          ║
 * ║  职责：通过 Claude Code CLI 执行 Agent                                     ║
 * ║  设计：每个任务独立工作目录，完整展示中间过程                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { spawn, execSync, spawnSync } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { platform, homedir } from 'os'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'
import type { Skill } from 'laborany-shared'
import {
  wrapCmdForUtf8,
  withUtf8Env,
  sanitizeClaudeEnv,
  encodeOpenAiBridgeApiKey,
  normalizeModelInterfaceType,
  resolveExecuteGenerativeWidgetSupport,
  resolveGenerativeWidgetSupport,
  type GenerativeWidgetSupport,
  type ModelInterfaceType,
  BUILTIN_SKILLS_DIR,
  USER_SKILLS_DIR,
  getUserDir,
  getRuntimeTasksDir,
  getRuntimeUploadsDir,
} from 'laborany-shared'
import { isZhipuApi, buildZhipuMcpServers, injectMcpServers } from './mcp/index.js'
import { getAppHomeDir, isPackagedRuntime } from '../../lib/app-home.js'
import {
  createWidgetHandlerState,
  processStreamEvent,
  type WidgetEvent,
  type WidgetHandlerState,
} from './generative-ui/handler.js'
import {
  isWidgetTool,
  writeMcpConfig,
} from './generative-ui/tools.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface AgentEvent {
  type:
    | 'init'
    | 'text'
    | 'tool_use'
    | 'tool_result'
    | 'warning'
    | 'error'
    | 'done'
    | 'status'
    | 'widget_start'
    | 'widget_delta'
    | 'widget_commit'
    | 'widget_error'
  content?: string
  toolName?: string
  toolUseId?: string
  toolInput?: Record<string, unknown>
  toolResult?: string
  taskDir?: string
  widgetId?: string
  title?: string
  html?: string
  message?: string
}

export interface ModelOverride {
  apiKey: string
  baseUrl?: string
  model?: string
  interfaceType?: ModelInterfaceType
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                    stderr 分类：识别 CLI 重试/错误信息                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const STDERR_FORWARD_PATTERN = /retry|retrying|attempt|reconnect|error|failed|timeout|refused|ECONNREFUSED|ETIMEDOUT|rate.limit|overloaded|529|503/i

const IDLE_WARNING_THRESHOLD_MS = 10 * 60 * 1000
const IDLE_WARNING_CHECK_INTERVAL_MS = 60 * 1000

function isProgressEvent(event: AgentEvent): boolean {
  return event.type === 'text' || event.type === 'tool_use' || event.type === 'tool_result'
}

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

const AGENT_SERVICE_TIMEOUT_MS = 15_000

function getAgentServiceUrl(): string {
  return (process.env.AGENT_SERVICE_URL || 'http://localhost:3002').replace(/\/+$/, '')
}

interface JsonFetchResult<T> {
  ok: boolean
  status: number
  data: T | null
  rawText: string
}

async function fetchJsonWithTimeout<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = AGENT_SERVICE_TIMEOUT_MS,
): Promise<JsonFetchResult<T>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${getAgentServiceUrl()}${path}`, {
      ...init,
      signal: controller.signal,
    })

    const rawText = await response.text()
    let data: T | null = null
    if (rawText) {
      try {
        data = JSON.parse(rawText) as T
      } catch {
        console.warn(`[Agent] JSON parse failed for ${path}: ${rawText.slice(0, 240)}`)
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      rawText,
    }
  } finally {
    clearTimeout(timeout)
  }
}

interface ExecuteOptions {
  skill: Skill
  query: string
  sessionId: string
  signal: AbortSignal
  onEvent: (event: AgentEvent) => void
  workDir?: string  // 可选的工作目录，用于复合技能共享目录
  modelOverride?: ModelOverride
  enableWidgets?: boolean
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       任务目录管理                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getAppDataDir(): string {
  if (isPackagedRuntime()) {
    return getAppHomeDir()
  }
  return join(__dirname, '..', '..', '..', '..')
}

function getTasksBaseDir(): string {
  return getRuntimeTasksDir()
}

function getUploadsBaseDir(): string {
  return getRuntimeUploadsDir()
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
  const appHome = getAppHomeDir()
  const userHome = getUserDir()
  const tasksBase = getTasksBaseDir()
  const uploadsBase = getUploadsBaseDir()
  const envPath = isPackagedRuntime()
    ? join(appHome, '.env')
    : join(getAppDataDir(), '.env')

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
    `- LaborAny app home: ${normalizePathForPrompt(appHome)}`,
    `- Primary env file path: ${normalizePathForPrompt(envPath)}`,
    '',
    'Execution constraints:',
    '- You are running inside LaborAny desktop app.',
    '- Prefer reading/writing files in current task cwd unless user explicitly requests another location.',
    '- When creating or updating skills, write under user skills directory, never builtin skills directory.',
    '- In task replies, use concrete absolute paths when asking users to inspect files.',
  ].join('\n')
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
  const runtimeContext = buildLaborAnyRuntimeContext(targetDir, skillId)

  try {
    // 从 agent-service 获取 Memory 上下文（传入 userQuery 用于智能检索）
    const queryParam = userQuery ? `?query=${encodeURIComponent(userQuery)}` : ''
    const result = await fetchJsonWithTimeout<{ context?: string }>(`/memory-context/${skillId}${queryParam}`)
    if (result.ok) {
      const memoryContext = result.data?.context || ''

      // 组合完整系统提示词：运行上下文 + Memory + Skill Prompt
      const fullPrompt = [runtimeContext, memoryContext, skillSystemPrompt]
        .filter(Boolean)
        .join('\n\n---\n\n')

      writeFileSync(claudeMdPath, fullPrompt, 'utf-8')
      console.log(`[Agent] 已写入 CLAUDE.md（含 Memory 上下文）: ${claudeMdPath}`)
    } else {
      // 如果获取 Memory 失败，仍写入运行上下文 + skill 系统提示词
      writeFileSync(claudeMdPath, `${runtimeContext}\n\n---\n\n${skillSystemPrompt}`, 'utf-8')
      console.warn(
        `[Agent] Memory context request failed: status=${result.status} body=${result.rawText.slice(0, 240)}`,
      )
      console.log(`[Agent] 已写入 CLAUDE.md（无 Memory）: ${claudeMdPath}`)
    }
  } catch (err) {
    // 网络错误时，仍写入运行上下文 + skill 系统提示词
    writeFileSync(claudeMdPath, `${runtimeContext}\n\n---\n\n${skillSystemPrompt}`, 'utf-8')
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
  const arch = process.arch
  const exeDir = dirname(process.execPath)
  const proc = process as NodeJS.Process & { resourcesPath?: string }

  const bundleDirNames = os === 'darwin'
    ? [arch === 'arm64' ? 'cli-bundle-arm64' : 'cli-bundle-x64', 'cli-bundle']
    : ['cli-bundle']

  const baseCandidates = [
    proc.resourcesPath || '',
    join(exeDir, '..'),
    exeDir,
    join(exeDir, '..', 'resources'),
    join(exeDir, 'resources'),
    join(__dirname, '..', '..'),
    join(__dirname, '..', '..', '..'),
    join(__dirname, '..', '..', '..', '..'),
    process.cwd(),
  ]

  const candidates: string[] = []
  const seen = new Set<string>()
  for (const base of baseCandidates) {
    if (!base) continue
    for (const dirName of bundleDirNames) {
      const candidate = join(base, dirName)
      if (seen.has(candidate)) continue
      seen.add(candidate)
      candidates.push(candidate)
    }
  }

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
    const result = execSync(wrapCmdForUtf8(`${whichCmd} claude`), { encoding: 'utf-8' }).trim()
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

interface RuntimeDependencyIssue {
  code: 'DEPENDENCY_MISSING_GIT' | 'DEPENDENCY_MISSING_GIT_BASH'
  message: string
  installHint: string
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

function getBundledSearchBases(): string[] {
  const exeDir = dirname(process.execPath)
  const parentDir = dirname(exeDir)

  const rawBases = [
    exeDir,
    parentDir,
    join(exeDir, 'resources'),
    join(parentDir, 'resources'),
    join(__dirname, '..', '..'),
    join(__dirname, '..', '..', '..'),
    join(__dirname, '..', '..', '..', '..'),
  ]

  return Array.from(new Set(rawBases.map(base => base.replace(/[\\/]+$/, ''))))
}

function getBundledGitBashPath(): string | undefined {
  if (platform() !== 'win32') return undefined

  const executableCandidates = ['bin\\bash.exe', 'usr\\bin\\bash.exe']
  for (const base of getBundledSearchBases()) {
    const gitBashDir = join(base, 'git-bash')
    for (const relativePath of executableCandidates) {
      const fullPath = join(gitBashDir, relativePath)
      if (existsSync(fullPath)) {
        return fullPath
      }
    }
  }

  return undefined
}

function findGitBashFromGitBinary(): string | undefined {
  if (platform() !== 'win32') return undefined

  try {
    const output = execSync(wrapCmdForUtf8('where git'), { encoding: 'utf-8' }).trim()
    if (!output) return undefined

    const candidates = output.split('\n').map(item => item.trim()).filter(Boolean)
    for (const gitPath of candidates) {
      const lower = gitPath.toLowerCase()
      const bashCandidate = lower.endsWith('\\cmd\\git.exe')
        ? join(dirname(dirname(gitPath)), 'bin', 'bash.exe')
        : join(dirname(gitPath), 'bash.exe')

      if (existsSync(bashCandidate)) {
        return bashCandidate
      }
    }
  } catch {
    // ignore detection errors
  }

  return undefined
}

function resolveWindowsGitBashPath(): string | undefined {
  if (platform() !== 'win32') return undefined

  const configured = (process.env.CLAUDE_CODE_GIT_BASH_PATH || '').trim()
  if (configured && existsSync(configured)) {
    return configured
  }

  const bundled = getBundledGitBashPath()
  if (bundled) {
    return bundled
  }

  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const programW6432 = process.env.ProgramW6432 || programFiles

  const systemCandidates = [
    join(programFiles, 'Git', 'bin', 'bash.exe'),
    join(programW6432, 'Git', 'bin', 'bash.exe'),
    join(programFilesX86, 'Git', 'bin', 'bash.exe'),
    'C:\\Git\\bin\\bash.exe',
    'D:\\Git\\bin\\bash.exe',
  ]
  for (const candidate of systemCandidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return findGitBashFromGitBinary()
}

function isGitAvailableOnUnixLike(): boolean {
  if (platform() === 'win32') return true
  try {
    const result = spawnSync('git', ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    })
    return (result.status ?? 1) === 0
  } catch {
    return false
  }
}

function getGitInstallHint(): string {
  const os = platform()
  if (os === 'darwin') {
    return '请先安装 Git：xcode-select --install（或 brew install git）'
  }
  if (os === 'linux') {
    return '请先安装 Git：Debian/Ubuntu 用 sudo apt-get install -y git；Fedora 用 sudo dnf install -y git'
  }
  return '请安装 Git for Windows，或使用包含内置 git-bash 的最新安装包'
}

function checkRuntimeDependencies(): RuntimeDependencyIssue | null {
  if (platform() === 'win32') {
    const gitBashPath = resolveWindowsGitBashPath()
    if (!gitBashPath) {
      return {
        code: 'DEPENDENCY_MISSING_GIT_BASH',
        message: '未检测到可用 Git Bash，Claude Code 无法在 Windows 上运行',
        installHint: getGitInstallHint(),
      }
    }
    return null
  }

  if (!isGitAvailableOnUnixLike()) {
    return {
      code: 'DEPENDENCY_MISSING_GIT',
      message: '未检测到 Git，Claude Code 依赖 Git 才能执行',
      installHint: getGitInstallHint(),
    }
  }

  return null
}

function getLlmBridgeAnthropicBaseUrl(): string {
  const port = (process.env.PORT || '3620').trim() || '3620'
  return `http://127.0.0.1:${port}/api/llm-bridge/anthropic`
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       构建环境配置                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function buildEnvConfig(overrides?: ModelOverride): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = sanitizeClaudeEnv(
    withUtf8Env({ ...process.env }),
  )

  const effectiveApiKey = (overrides?.apiKey || process.env.ANTHROPIC_API_KEY || '').trim()
  const effectiveBaseUrl = overrides
    ? ((overrides.baseUrl || '').trim() || undefined)
    : ((process.env.ANTHROPIC_BASE_URL || '').trim() || undefined)
  const effectiveModel = overrides
    ? ((overrides.model || '').trim() || undefined)
    : ((process.env.ANTHROPIC_MODEL || '').trim() || undefined)
  const interfaceType = normalizeModelInterfaceType(
    overrides?.interfaceType || process.env.LABORANY_MODEL_INTERFACE,
  )

  if (interfaceType === 'openai_compatible') {
    if (effectiveApiKey) {
      env.ANTHROPIC_API_KEY = encodeOpenAiBridgeApiKey({
        apiKey: effectiveApiKey,
        baseUrl: effectiveBaseUrl,
        model: effectiveModel,
      })
    } else {
      delete env.ANTHROPIC_API_KEY
    }
    env.ANTHROPIC_BASE_URL = getLlmBridgeAnthropicBaseUrl()
    if (effectiveModel) {
      env.ANTHROPIC_MODEL = effectiveModel
    } else {
      delete env.ANTHROPIC_MODEL
    }
  } else {
    if (effectiveApiKey) {
      env.ANTHROPIC_API_KEY = effectiveApiKey
    } else {
      delete env.ANTHROPIC_API_KEY
    }
    if (effectiveBaseUrl) {
      env.ANTHROPIC_BASE_URL = effectiveBaseUrl
    } else {
      delete env.ANTHROPIC_BASE_URL
    }
    if (effectiveModel) {
      env.ANTHROPIC_MODEL = effectiveModel
    } else {
      delete env.ANTHROPIC_MODEL
    }
  }

  if (platform() === 'win32') {
    const gitBashPath = resolveWindowsGitBashPath()
    if (gitBashPath) {
      env.CLAUDE_CODE_GIT_BASH_PATH = gitBashPath
    } else {
      delete env.CLAUDE_CODE_GIT_BASH_PATH
    }
  }

  // 跨平台编码修复：确保子进程输出 UTF-8
  env.PYTHONIOENCODING = 'utf-8'
  env.PYTHONUTF8 = '1'
  if (platform() !== 'win32') {
    // Unix-like：设置 locale（不覆盖用户已有设置）
    env.LANG = env.LANG || 'en_US.UTF-8'
    env.LC_ALL = env.LC_ALL || 'en_US.UTF-8'
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

function parseStreamLine(line: string, onEvent: (event: AgentEvent) => void, ctx?: ParseStreamContext): void {
  parseStreamLineWithReturn(line, onEvent, ctx)
}

function parseStreamLineWithReturn(
  line: string,
  onEvent: (event: AgentEvent) => void,
  ctx?: ParseStreamContext,
): AgentEvent | null {
  if (!line.trim()) return null

  try {
    const msg: StreamMessage = JSON.parse(line)
    let lastEvent: AgentEvent | null = null
    const textChunks: string[] = []

    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text) {
          const event: AgentEvent = { type: 'text', content: block.text }
          onEvent(event)
          textChunks.push(block.text)
          lastEvent = event
        } else if (block.type === 'tool_use' && block.name) {
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
          lastEvent = event
        }
      }

      return lastEvent
    } else if (msg.type === 'stream_event' && msg.event && ctx?.widgetState) {
      const evt = msg.event
      if (evt.type === 'content_block_start' && evt.content_block) {
        const widgetEvt = processStreamEvent(
          ctx.widgetState,
          'content_block_start',
          evt.content_block as ContentBlock,
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

function resolveMcpNodeCommand(nodePath?: string): string {
  if (nodePath) return nodePath
  const execName = basename(process.execPath).toLowerCase()
  if (execName === 'node' || execName === 'node.exe') {
    return process.execPath
  }
  return 'node'
}

const WIDGET_EXPLANATION_PATTERN = /可视化|图解|图表|流程图|示意图|示意|画图|渲染|交互式|计算器|仪表盘|widget|diagram|flow.?chart|chart|visuali[sz]e|interactive|calculator|dashboard|svg/i
const EXPLANATION_INTENT_PATTERN = /解释|说明|讲解|展示|演示|理解|compare|comparison|illustrate|walk me through|explain|teach/i
const NO_FILE_PATTERN = /不要写文件|不要创建文件|不要生成文件|不要落地文件|不要改代码|不要实现|直接回答|直接解释|直接用|just explain|do not write files?|don't write files?/i
const EXECUTION_ARTIFACT_PATTERN = /修复|实现|重构|写代码|编程|代码|项目|仓库|repo|repository|脚本|命令|测试|提交|commit|build|fix|implement|refactor|create file|write file|edit file/i
const MODEL_TOOL_LOAD_GUIDELINES = 'load_guidelines'
const MODEL_TOOL_SHOW_WIDGET = 'show_widget'
const MISSING_PRINT_INPUT_RE = /Input must be provided either through stdin or as a prompt argument when using --print/i

function formatClaudeCliExitError(code: number | null, stderrSnippet: string): string {
  const trimmed = stderrSnippet.trim()
  if (MISSING_PRINT_INPUT_RE.test(trimmed)) {
    return '执行内容为空。请先输入任务内容，或上传文件后再试。'
  }
  return trimmed
    ? `Claude Code 退出码: ${code}\n${trimmed}`
    : `Claude Code 退出码: ${code}`
}

function shouldForceDirectWidgetMode(skillId: string, userQuery: string): boolean {
  const text = userQuery.trim()
  if (!text) return false

  const asksForVisual = WIDGET_EXPLANATION_PATTERN.test(text)
  const asksToExplain = EXPLANATION_INTENT_PATTERN.test(text)
  const forbidsArtifacts = NO_FILE_PATTERN.test(text)
  const looksLikeBuildTask = EXECUTION_ARTIFACT_PATTERN.test(text)

  if (skillId === '__generic__' && forbidsArtifacts && (asksForVisual || asksToExplain)) {
    return true
  }

  if (asksForVisual && asksToExplain && !looksLikeBuildTask) {
    return true
  }

  return false
}

function buildDirectWidgetExecutionSkillPrompt(widgetSupport: GenerativeWidgetSupport): string {
  const lines = [
    '# LaborAny Execute Direct Explanation Mode',
    '',
    'You are handling a desktop execute request that should be answered directly, not treated as a repository coding task.',
    '',
    'Mandatory rules:',
    '- Treat visual explanation, diagram, chart, calculator, and interactive demo requests as direct-answer tasks.',
    '- Do not inspect the workspace, repository, or source tree unless the user explicitly asks you to do so.',
    '- Do not write files, run shell commands, or build standalone HTML pages as a substitute for the widget.',
    '- Do not probe tool availability with Bash, fake JSON, or any workaround. Either call the widget MCP tools directly or answer in text.',
    '- Do not use built-in execution/search/media tools such as Bash, Read, Glob, Grep, LS, Skill, AskUserQuestion, analyze_image, browser, or web search for this type of request.',
    '- Do not ask for plan approval and do not use AskUserQuestion unless the user request is genuinely ambiguous.',
    '- Prefer a concise explanation plus one focused widget instead of a long execution workflow.',
  ]

  if (widgetSupport.enabled) {
    const runtimeHint = widgetSupport.capability === 'full_stream'
      ? '- The current widget runtime may stream partial widget updates before the final render.'
      : '- The current widget runtime may only commit the widget after the tool call finishes.'
    lines.push(
      `- The widget tool names exposed to you are ${MODEL_TOOL_LOAD_GUIDELINES} and ${MODEL_TOOL_SHOW_WIDGET}.`,
      `- If widget tools are available, silently call ${MODEL_TOOL_LOAD_GUIDELINES} before your first widget, then call ${MODEL_TOOL_SHOW_WIDGET}.`,
      '- Call those widget tools directly. Do not wrap them inside the built-in Skill tool.',
      runtimeHint,
      '- After rendering the widget, continue with concise natural-language explanation.',
    )
  } else {
    lines.push(
      '- Widget MCP tools are unavailable for the current model/provider.',
      '- Do not attempt to call widget tools or mention internal tool failures to the user.',
      '- Explain the topic directly in text only.',
    )
  }

  return lines.join('\n')
}

function buildDirectWidgetExecutionUserPrompt(
  userQuery: string,
  widgetSupport: GenerativeWidgetSupport,
): string {
  const lines = [
    'Direct explanation request for LaborAny execute:',
    '- Answer the user topic directly.',
    '- Do not use Bash, Read, LS, Glob, Grep, Skill, AskUserQuestion, analyze_image, browser, or web search.',
    '- Do not test tool availability with shell commands or fake tool JSON.',
  ]

  if (widgetSupport.enabled) {
    lines.push(
      `- If a widget helps, call ${MODEL_TOOL_LOAD_GUIDELINES} first and then ${MODEL_TOOL_SHOW_WIDGET}.`,
      '- If widget generation does not succeed, skip it and continue with a concise text explanation.',
    )
  } else {
    lines.push('- Widget tools are unavailable for this run. Answer in text only.')
  }

  lines.push('', userQuery)
  return lines.join('\n')
}

function buildWidgetExecutionPrompt(
  skillPrompt: string,
  forceDirectMode: boolean,
  widgetSupport: GenerativeWidgetSupport,
): string {
  const sections = [
    forceDirectMode ? buildDirectWidgetExecutionSkillPrompt(widgetSupport) : skillPrompt,
  ]

  if (widgetSupport.enabled) {
    sections.push(
      '',
      'Generative UI guidance:',
      '- When a visual explanation, chart, diagram, calculator, or interactive widget would materially help, prefer using the widget tools.',
      `- Before your first widget in this conversation, call ${MODEL_TOOL_LOAD_GUIDELINES} with the relevant modules.`,
      `- Then call ${MODEL_TOOL_SHOW_WIDGET} with a complete HTML fragment in widget_code.`,
      `- Use the widget tool names exactly as written: ${MODEL_TOOL_LOAD_GUIDELINES} and ${MODEL_TOOL_SHOW_WIDGET}.`,
      '- Do not use the built-in Skill tool as a proxy for widget rendering.',
      '- Do not mention guideline loading to the user.',
      '- Do not write standalone HTML files when an inline widget is a better fit.',
    )
  }

  if (forceDirectMode) {
    sections.push(
      '- This request is in direct explanation mode. These rules override any earlier plan-first or approval-first workflow.',
      '- Answer the user topic directly. Do not inspect files, run tools like Read/Glob/Bash, or create project artifacts unless the user explicitly requests that work.',
    )
  }

  return sections.join('\n')
}

function buildEffectiveSkillPrompt(
  skill: Skill,
  userQuery: string,
  requestedWidgets: boolean,
  widgetSupport: GenerativeWidgetSupport,
  forceDirectMode: boolean,
): string {
  if (!requestedWidgets && !forceDirectMode) {
    return skill.systemPrompt
  }

  return buildWidgetExecutionPrompt(skill.systemPrompt, forceDirectMode, widgetSupport)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       执行 Agent 主函数                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export async function executeAgent(options: ExecuteOptions): Promise<void> {
  const { skill, query: userQuery, sessionId, signal, onEvent, workDir, modelOverride, enableWidgets } = options

  let lastProgressAt = Date.now()
  let idleWarningSent = false
  const emitEvent = (event: AgentEvent) => {
    if (isProgressEvent(event)) {
      lastProgressAt = Date.now()
      idleWarningSent = false
    }
    onEvent(event)
  }

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

  const effectiveApiKey = modelOverride?.apiKey?.trim() || process.env.ANTHROPIC_API_KEY || ''
  const effectiveBaseUrl = modelOverride
    ? (modelOverride.baseUrl?.trim() || undefined)
    : process.env.ANTHROPIC_BASE_URL
  const effectiveModel = modelOverride
    ? (modelOverride.model?.trim() || undefined)
    : process.env.ANTHROPIC_MODEL
  const interfaceType = normalizeModelInterfaceType(modelOverride?.interfaceType)
  const widgetSupport = resolveGenerativeWidgetSupport({
    requested: Boolean(enableWidgets),
    interfaceType,
    model: effectiveModel,
    baseUrl: effectiveBaseUrl,
  })
  const executeWidgetSupport = resolveExecuteGenerativeWidgetSupport({
    requested: Boolean(enableWidgets),
    interfaceType,
    model: effectiveModel,
    baseUrl: effectiveBaseUrl,
  })
  const forceDirectMode = shouldForceDirectWidgetMode(skill.meta.id, userQuery)
  const effectiveSkillPrompt = buildEffectiveSkillPrompt(
    skill,
    userQuery,
    Boolean(enableWidgets),
    executeWidgetSupport,
    forceDirectMode,
  )

  // 每轮都重写 CLAUDE.md，确保继续会话时也能切换到当前用户意图对应的 prompt。
  await writeClaudeMdWithMemory(
    taskDir,
    skill.meta.id,
    effectiveSkillPrompt,
    userQuery,
  )
  console.log(`[Agent] Task directory: ${taskDir}`)
  console.log(`[Agent] Is new session: ${isNewSession}`)

  emitEvent({ type: 'init', taskDir, content: `任务目录: ${taskDir}` })

  const timestamp = new Date().toISOString()
  const historyEntry = `\n[${timestamp}] User:\n${userQuery}\n`
  writeFileSync(historyFile, historyEntry, { flag: 'a' })

  // 确保 Claude Code 可用（优先使用内置 Bundle）
  const claudeConfig = ensureClaudeCode()
  if (!claudeConfig) {
    emitEvent({
      type: 'error',
      content: 'Claude Code 未找到且安装失败。请手动运行: npm install -g @anthropic-ai/claude-code',
    })
    emitEvent({ type: 'done' })
    return
  }

  const dependencyIssue = checkRuntimeDependencies()
  if (dependencyIssue) {
    emitEvent({
      type: 'error',
      content: `[${dependencyIssue.code}] ${dependencyIssue.message}\n${dependencyIssue.installHint}`,
    })
    emitEvent({ type: 'done' })
    return
  }

  // 检查 API Key 配置
  if (!effectiveApiKey) {
    emitEvent({
      type: 'error',
      content: 'ANTHROPIC_API_KEY 未配置。请在设置页面配置 API 密钥。',
    })
    emitEvent({ type: 'done' })
    return
  }

  /* ┌────────────────────────────────────────────────────────────────────────┐
   * │  智谱 MCP 自动注入                                                      │
   * │  当使用智谱 API 时，自动将智谱 MCP 服务器配置注入 settings.json          │
   * └────────────────────────────────────────────────────────────────────────┘ */
  if (interfaceType !== 'openai_compatible' && isZhipuApi(effectiveBaseUrl)) {
    const zhipuServers = buildZhipuMcpServers(effectiveApiKey)
    injectMcpServers(zhipuServers)
    console.log('[Agent] 检测到智谱 API，已注入 MCP 服务器配置')
  }

  if (claudeConfig.useBundled) {
    console.log(`[Agent] Node: ${claudeConfig.nodePath}`)
    console.log(`[Agent] CLI: ${claudeConfig.cliPath}`)
  } else {
    console.log(`[Agent] Claude Code: ${claudeConfig.claudePath}`)
  }
  console.log(`[Agent] Model: ${effectiveModel || 'default'}`)
  console.log(`[Agent] API Key configured: ${effectiveApiKey ? 'Yes' : 'No'}`)

  const isWindows = platform() === 'win32'
  const args = [
    '--print',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--dangerously-skip-permissions',
  ]

  if (!isNewSession) {
    args.push('--continue')
  }

  if (effectiveModel) {
    args.push('--model', effectiveModel)
  }

  let widgetState: WidgetHandlerState | undefined
  if (executeWidgetSupport.enabled && executeWidgetSupport.runtime === 'claude_cli_mcp') {
    try {
      const mcpNodeCommand = resolveMcpNodeCommand(claudeConfig.useBundled ? claudeConfig.nodePath : undefined)
      const mcpConfigPath = writeMcpConfig(taskDir, mcpNodeCommand)
      args.push('--mcp-config', mcpConfigPath)
      widgetState = createWidgetHandlerState()
      console.log(`[Agent] Generative UI enabled, MCP config: ${mcpConfigPath}`)
    } catch (error) {
      console.error('[Agent] Failed to initialize Generative UI MCP config:', error)
    }
  } else if (enableWidgets) {
    console.log(`[Agent] Generative UI requested but disabled: ${executeWidgetSupport.reasonMessage || 'unknown reason'}`)
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * 构建 prompt（系统提示词已写入 CLAUDE.md，这里只传用户查询）
   * ═══════════════════════════════════════════════════════════════════════════ */
  const prompt = forceDirectMode
    ? buildDirectWidgetExecutionUserPrompt(userQuery, executeWidgetSupport)
    : userQuery

  if (!prompt.trim()) {
    emitEvent({
      type: 'error',
      content: '执行内容为空。请先输入任务内容，或上传文件后再试。',
    })
    emitEvent({ type: 'done' })
    return
  }

  console.log(`[Agent] Args: ${args.join(' ')}`)

  // 根据配置选择启动方式
  let proc
  if (claudeConfig.useBundled) {
    // 使用内置 Bundle：node cli.js [args]
    const bundledArgs = [claudeConfig.cliPath!, ...args]
    proc = spawn(claudeConfig.nodePath!, bundledArgs, {
      cwd: taskDir,
      env: buildEnvConfig(modelOverride),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } else {
    // 使用系统安装的 claude 命令
    proc = spawn(claudeConfig.claudePath!, args, {
      cwd: taskDir,
      env: buildEnvConfig(modelOverride),
      shell: isWindows,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  }

  proc.stdin.write(prompt)
  proc.stdin.end()

  let lineBuffer = ''
  let agentResponse = ''  // 收集 Agent 的文本输出
  const onWidgetEvent = (event: WidgetEvent) => {
    if (event.type === 'widget_start') {
      onEvent({ type: 'widget_start', widgetId: event.widgetId, title: event.title })
    } else if (event.type === 'widget_delta') {
      onEvent({ type: 'widget_delta', widgetId: event.widgetId, html: event.html })
    } else if (event.type === 'widget_commit') {
      onEvent({ type: 'widget_commit', widgetId: event.widgetId, title: event.title, html: event.html })
    } else if (event.type === 'widget_error') {
      onEvent({ type: 'widget_error', widgetId: event.widgetId, message: event.message })
    }
  }
  const streamCtx: ParseStreamContext | undefined = widgetState
    ? { widgetState, onWidgetEvent }
    : undefined

  proc.stdout.on('data', (data: Buffer) => {
    lineBuffer += data.toString('utf-8')
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() || ''
    for (const line of lines) {
      const event = parseStreamLineWithReturn(line, emitEvent, streamCtx)
      // 收集文本输出用于记忆
      if (event?.type === 'text' && event.content) {
        agentResponse += event.content
      }
    }
  })

  let stderrBuffer = ''

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
        emitEvent({ type: 'status', content: trimmed })
      }
    }
  })

  const abortHandler = () => proc.kill('SIGTERM')
  signal.addEventListener('abort', abortHandler)

  const idleWarningTimer = setInterval(() => {
    if (signal.aborted) return
    if (proc.exitCode !== null || proc.killed) return

    const idleMs = Date.now() - lastProgressAt
    if (idleMs < IDLE_WARNING_THRESHOLD_MS || idleWarningSent) {
      return
    }

    idleWarningSent = true
    emitEvent({
      type: 'warning',
      content: '任务执行时间较长，已超过 10 分钟无新输出。任务仍在继续，请耐心等待。',
    })
  }, IDLE_WARNING_CHECK_INTERVAL_MS)

  return new Promise((resolve) => {
    proc.on('close', async (code) => {
      clearInterval(idleWarningTimer)
      signal.removeEventListener('abort', abortHandler)
      if (lineBuffer.trim()) {
        const event = parseStreamLineWithReturn(lineBuffer, emitEvent, streamCtx)
        if (event?.type === 'text' && event.content) {
          agentResponse += event.content
        }
      }

      if (signal.aborted) {
        emitEvent({ type: 'error', content: '执行被中止' })
      } else if (code !== 0) {
        const stderrSnippet = stderrBuffer.trim().slice(0, 600)
        emitEvent({
          type: 'error',
          content: formatClaudeCliExitError(code, stderrSnippet),
        })
      }

      // 任务完成后记录到三级记忆系统
      if (code === 0 && !signal.aborted) {
        try {
          if (shouldPersistMemory(skill.meta.id, userQuery)) {
            const result = await fetchJsonWithTimeout<{
              success?: boolean
              skipped?: boolean
              reason?: string
              extractionMethod?: string
              written?: { cells?: number }
            }>(
              '/memory/record-task',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  skillId: skill.meta.id,
                  userQuery: stripPipelineContext(userQuery),
                  assistantResponse: agentResponse || '',
                }),
              },
              20_000,
            )

            if (!result.ok) {
              throw new Error(`status=${result.status} body=${result.rawText.slice(0, 240)}`)
            }

            const payload = result.data ?? {}

            if (!payload.success) {
              throw new Error(`invalid response body=${JSON.stringify(payload).slice(0, 240)}`)
            }

            if (payload.skipped) {
              console.log(`[Agent] Memory write skipped: ${payload.reason || 'unknown reason'}`)
            } else {
              console.log(
                `[Agent] Memory write completed: method=${payload.extractionMethod || 'unknown'}, cells=${payload.written?.cells ?? 0}`,
              )
            }
          }
        } catch (err) {
          console.error('[Agent] 记录记忆失败:', err)
          emitEvent({
            type: 'warning',
            content: '记忆写入失败，本次任务结果已保留，但不会更新记忆。',
          })
        }
      }

      emitEvent({ type: 'done' })
      resolve()
    })

    proc.on('error', (err) => {
      clearInterval(idleWarningTimer)
      signal.removeEventListener('abort', abortHandler)
      emitEvent({ type: 'error', content: err.message })
      emitEvent({ type: 'done' })
      resolve()
    })
  })
}
