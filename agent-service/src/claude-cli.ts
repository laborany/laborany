import { execSync } from 'child_process'
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

export function buildClaudeEnvConfig(): Record<string, string | undefined> {
  refreshRuntimeConfig()

  const env: Record<string, string | undefined> = withUtf8Env({ ...process.env })
  delete env.ANTHROPIC_AUTH_TOKEN

  if (process.env.ANTHROPIC_API_KEY) {
    env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  }
  if (process.env.ANTHROPIC_BASE_URL) {
    env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL
  }
  if (process.env.ANTHROPIC_MODEL) {
    env.ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL
  }

  return env
}
