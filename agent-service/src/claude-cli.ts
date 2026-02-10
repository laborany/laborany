import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { homedir, platform } from 'os'
import { join } from 'path'
import { wrapCmdForUtf8, withUtf8Env } from 'laborany-shared'

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
    // 命令路径检测失败则继续尝试默认路径
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

export function buildClaudeEnvConfig(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = withUtf8Env({ ...process.env })

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
