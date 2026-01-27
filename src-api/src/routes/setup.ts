/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         初始化设置 API 路由                               ║
 * ║                                                                          ║
 * ║  端点：检查 Claude Code 状态                                              ║
 * ║  支持：内置 CLI Bundle > 系统安装                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Hono } from 'hono'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { homedir, platform } from 'os'
import { execSync } from 'child_process'

const setup = new Hono()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       检查内置 CLI Bundle                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getBundledClaudePath(): { node: string; cli: string } | null {
  const os = platform()
  const exeDir = dirname(process.execPath)

  const candidates = [
    join(exeDir, '..', 'resources', 'cli-bundle'),
    join(exeDir, 'resources', 'cli-bundle'),
    join(exeDir, '..', 'cli-bundle'),
  ]

  for (const bundleDir of candidates) {
    const nodeBin = os === 'win32'
      ? join(bundleDir, 'node.exe')
      : join(bundleDir, 'node')
    const cliJs = join(bundleDir, 'deps', '@anthropic-ai', 'claude-code', 'cli.js')

    if (existsSync(nodeBin) && existsSync(cliJs)) {
      console.log(`[Setup] 找到内置 CLI Bundle: ${bundleDir}`)
      return { node: nodeBin, cli: cliJs }
    }
  }

  return null
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       查找系统安装的 Claude Code                          │
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
 * │                       检查设置状态                                        │
 * │  优先级：内置 CLI Bundle > 系统安装                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
setup.get('/status', (c) => {
  // 1. 优先检查内置 CLI Bundle
  const bundled = getBundledClaudePath()
  if (bundled) {
    return c.json({
      claudeCode: { installed: true, path: bundled.cli, bundled: true },
      ready: true,
    })
  }

  // 2. 检查系统安装的 Claude Code
  const claudeCodePath = findClaudeCodePath()
  if (claudeCodePath) {
    return c.json({
      claudeCode: { installed: true, path: claudeCodePath, bundled: false },
      ready: true,
    })
  }

  // 3. 未找到 Claude Code - 需要用户手动安装
  return c.json({
    claudeCode: { installed: false, path: null },
    ready: false,
    message: '请安装 Claude Code CLI: npm install -g @anthropic-ai/claude-code',
  })
})

export default setup
