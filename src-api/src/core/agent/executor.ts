/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Agent 执行器 (Claude Code CLI)                    ║
 * ║                                                                          ║
 * ║  职责：通过 Claude Code CLI 执行 Agent                                     ║
 * ║  设计：每个任务独立工作目录，完整展示中间过程                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { spawn, execSync, spawnSync } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { platform, homedir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { Skill } from 'laborany-shared'
import {
  wrapCmdForUtf8,
  withUtf8Env,
  BUILTIN_SKILLS_DIR,
  USER_SKILLS_DIR,
  getUserDir,
} from 'laborany-shared'
import { isZhipuApi, buildZhipuMcpServers, injectMcpServers } from './mcp/index.js'
import { getAppHomeDir, isPackagedRuntime } from '../../lib/app-home.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface AgentEvent {
  type: 'init' | 'text' | 'tool_use' | 'tool_result' | 'warning' | 'error' | 'done' | 'status'
  content?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: string
  taskDir?: string
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

const AGENT_SERVICE_URL = (process.env.AGENT_SERVICE_URL || 'http://localhost:3002').replace(/\/+$/, '')
const AGENT_SERVICE_TIMEOUT_MS = 15_000

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
    const response = await fetch(`${AGENT_SERVICE_URL}${path}`, {
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
  if (isPackagedRuntime()) {
    // 打包环境：与 agent-service 保持一致，使用 data/tasks
    return join(getAppDataDir(), 'data', 'tasks')
  }
  return join(getAppDataDir(), 'tasks')
}

function getUploadsBaseDir(): string {
  if (isPackagedRuntime()) {
    return join(getAppHomeDir(), 'uploads')
  }
  return join(__dirname, '..', '..', '..', 'uploads')
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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       构建环境配置                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function buildEnvConfig(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = withUtf8Env({ ...process.env })

  /* ── 只传 ANTHROPIC_API_KEY，不要额外设置 ANTHROPIC_AUTH_TOKEN ──
   * CLI SDK 对两者的处理不同：
   *   ANTHROPIC_API_KEY   → X-Api-Key header
   *   ANTHROPIC_AUTH_TOKEN → Authorization: Bearer header
   * 第三方代理（如 xchai.xyz）可能只认 X-Api-Key，
   * 同时发送两个 header 会导致 401 "Invalid API key format"。
   * process.env 已经包含 ANTHROPIC_API_KEY，无需重复赋值。       */
  if (process.env.ANTHROPIC_BASE_URL) {
    env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL
  }
  if (process.env.ANTHROPIC_MODEL) {
    env.ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL
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
}

function parseStreamLine(line: string, onEvent: (event: AgentEvent) => void): void {
  parseStreamLineWithReturn(line, onEvent)
}

function parseStreamLineWithReturn(line: string, onEvent: (event: AgentEvent) => void): AgentEvent | null {
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
          const event: AgentEvent = {
            type: 'tool_use',
            toolName: block.name,
            toolInput: block.input,
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

  // 新会话时写入 CLAUDE.md（含 Memory 上下文，传入 userQuery 用于智能检索）
  if (isNewSession) {
    await writeClaudeMdWithMemory(taskDir, skill.meta.id, skill.systemPrompt, userQuery)
  }
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
  if (!process.env.ANTHROPIC_API_KEY) {
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
    lineBuffer += data.toString('utf-8')
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() || ''
    for (const line of lines) {
      const event = parseStreamLineWithReturn(line, emitEvent)
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
        const event = parseStreamLineWithReturn(lineBuffer, emitEvent)
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
          content: stderrSnippet
            ? `Claude Code 退出码: ${code}\n${stderrSnippet}`
            : `Claude Code 退出码: ${code}`,
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
