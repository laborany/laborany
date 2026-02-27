import { execSync, spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { homedir, platform } from 'os'
import { dirname, join } from 'path'
import { wrapCmdForUtf8, withUtf8Env } from 'laborany-shared'
import { RESOURCES_DIR } from './paths.js'
import { refreshRuntimeConfig } from './runtime-config.js'

export interface ClaudeCliLaunchConfig {
  command: string
  argsPrefix: string[]
  shell: boolean
  source: 'bundled' | 'system' | 'env'
}

export interface DependencyIssue {
  code: 'DEPENDENCY_MISSING_GIT' | 'DEPENDENCY_MISSING_GIT_BASH'
  message: string
  installHint: string
}

function getBundledDirNames(): string[] {
  const os = platform()
  const arch = process.arch

  if (os === 'darwin') {
    const archSpecific = arch === 'arm64' ? 'cli-bundle-arm64' : 'cli-bundle-x64'
    return [archSpecific, 'cli-bundle']
  }

  return ['cli-bundle']
}

function getBundledSearchBases(): string[] {
  const exeDir = dirname(process.execPath)
  const parentDir = dirname(exeDir)

  const rawBases = [
    RESOURCES_DIR,
    exeDir,
    parentDir,
    join(exeDir, 'resources'),
    join(parentDir, 'resources'),
    process.cwd(),
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

export function resolveWindowsGitBashPath(): string | undefined {
  if (platform() !== 'win32') return undefined

  const configured = (process.env.CLAUDE_CODE_GIT_BASH_PATH || '').trim()
  if (configured && existsSync(configured)) {
    return configured
  }
  if (configured && !existsSync(configured)) {
    console.warn(`[ClaudeCLI] CLAUDE_CODE_GIT_BASH_PATH invalid: ${configured}`)
  }

  const bundled = getBundledGitBashPath()
  if (bundled) {
    console.log(`[ClaudeCLI] Using bundled Git Bash: ${bundled}`)
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

export function getGitInstallHint(): string {
  const os = platform()
  if (os === 'darwin') {
    return '请先安装 Git：xcode-select --install（或 brew install git）'
  }
  if (os === 'linux') {
    return '请先安装 Git：Debian/Ubuntu 用 sudo apt-get install -y git；Fedora 用 sudo dnf install -y git'
  }
  return '请安装 Git for Windows，或使用内置 git-bash 资源'
}

export function checkRuntimeDependencies(): DependencyIssue | null {
  if (platform() === 'win32') {
    const gitBashPath = resolveWindowsGitBashPath()
    if (!gitBashPath) {
      return {
        code: 'DEPENDENCY_MISSING_GIT_BASH',
        message: '未检测到可用 Git Bash，Claude Code 无法在 Windows 上运行',
        installHint: '请安装 Git for Windows，或使用包含内置 git-bash 的最新安装包',
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

function findBundledClaudeLaunch(): ClaudeCliLaunchConfig | undefined {
  const os = platform()
  const nodeBinName = os === 'win32' ? 'node.exe' : 'node'

  for (const base of getBundledSearchBases()) {
    for (const dirName of getBundledDirNames()) {
      const bundleDir = join(base, dirName)
      const nodeBin = join(bundleDir, nodeBinName)
      const cliJs = join(bundleDir, 'deps', '@anthropic-ai', 'claude-code', 'cli.js')

      if (existsSync(nodeBin) && existsSync(cliJs)) {
        console.log(`[ClaudeCLI] Using bundled CLI: ${bundleDir}`)
        return {
          command: nodeBin,
          argsPrefix: [cliJs],
          shell: false,
          source: 'bundled',
        }
      }
    }
  }

  return undefined
}

export function findClaudeCodePath(): string | undefined {
  const os = platform()
  const whichCmd = os === 'win32' ? 'where' : 'which'

  try {
    const result = execSync(wrapCmdForUtf8(`${whichCmd} claude`), { encoding: 'utf-8' }).trim()
    if (result) {
      const paths = result.split('\n').map(item => item.trim())
      if (os === 'win32') {
        for (const item of paths) {
          if (item.endsWith('.cmd') && existsSync(item)) return item
        }
      }
      for (const item of paths) {
        if (existsSync(item)) return item
      }
    }
  } catch {
    // 鍛戒护璺緞妫€娴嬪け璐ュ垯缁х画灏濊瘯榛樿璺緞
  }

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

  for (const item of possiblePaths) {
    if (existsSync(item)) return item
  }

  if (process.env.CLAUDE_CODE_PATH && existsSync(process.env.CLAUDE_CODE_PATH)) {
    return process.env.CLAUDE_CODE_PATH
  }

  return undefined
}

export function resolveClaudeCliLaunch(): ClaudeCliLaunchConfig | undefined {
  refreshRuntimeConfig()

  const bundled = findBundledClaudeLaunch()
  if (bundled) return bundled

  const claudePath = findClaudeCodePath()
  if (!claudePath) return undefined

  const isEnvPath = Boolean(process.env.CLAUDE_CODE_PATH && process.env.CLAUDE_CODE_PATH === claudePath)
  const isCmdShim = platform() === 'win32' && claudePath.toLowerCase().endsWith('.cmd')

  return {
    command: claudePath,
    argsPrefix: [],
    shell: isCmdShim,
    source: isEnvPath ? 'env' : 'system',
  }
}

export interface ModelOverride {
  apiKey: string
  baseUrl?: string
  model?: string
}

export function buildClaudeEnvConfig(overrides?: ModelOverride): Record<string, string | undefined> {
  refreshRuntimeConfig()

  const env: Record<string, string | undefined> = withUtf8Env({ ...process.env })
  delete env.ANTHROPIC_AUTH_TOKEN

  // overrides > process.env, never mutate process.env itself
  if (overrides?.apiKey) {
    env.ANTHROPIC_API_KEY = overrides.apiKey
  } else if (process.env.ANTHROPIC_API_KEY) {
    env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  }

  if (overrides?.baseUrl) {
    env.ANTHROPIC_BASE_URL = overrides.baseUrl
  } else if (overrides && 'baseUrl' in overrides && !overrides.baseUrl) {
    // explicit undefined means clear it
    delete env.ANTHROPIC_BASE_URL
  } else if (process.env.ANTHROPIC_BASE_URL) {
    env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL
  }

  if (overrides?.model) {
    env.ANTHROPIC_MODEL = overrides.model
  } else if (overrides && 'model' in overrides && !overrides.model) {
    delete env.ANTHROPIC_MODEL
  } else if (process.env.ANTHROPIC_MODEL) {
    env.ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL
  }

  if (platform() === 'win32') {
    const gitBashPath = resolveWindowsGitBashPath()
    if (gitBashPath) {
      env.CLAUDE_CODE_GIT_BASH_PATH = gitBashPath
    } else {
      delete env.CLAUDE_CODE_GIT_BASH_PATH
      console.warn('[ClaudeCLI] Git Bash not found. Claude Code may fail on Windows.')
    }
  }

  return env
}
