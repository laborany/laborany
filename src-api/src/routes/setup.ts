/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         初始化设置 API 路由                               ║
 * ║                                                                          ║
 * ║  端点：检查 Claude Code 状态、安装 Claude Code                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { execSync, spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir, platform } from 'os'

const setup = new Hono()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       查找 Claude Code 路径                               │
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
 * │                       检查 Node.js/npm 是否可用                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function checkNpmAvailable(): { available: boolean; version?: string; error?: string } {
  try {
    const version = execSync('npm --version', { encoding: 'utf-8' }).trim()
    return { available: true, version }
  } catch (error) {
    return {
      available: false,
      error: 'npm 未找到。请先安装 Node.js: https://nodejs.org/'
    }
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       检查设置状态                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
setup.get('/status', (c) => {
  const claudeCodePath = findClaudeCodePath()
  const npmStatus = checkNpmAvailable()

  return c.json({
    claudeCode: {
      installed: !!claudeCodePath,
      path: claudeCodePath || null,
    },
    npm: npmStatus,
    ready: !!claudeCodePath && npmStatus.available,
  })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       安装 Claude Code (SSE 流式输出)                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
setup.post('/install', async (c) => {
  // 先检查是否已安装
  const existingPath = findClaudeCodePath()
  if (existingPath) {
    return c.json({
      success: true,
      message: 'Claude Code 已安装',
      path: existingPath
    })
  }

  // 检查 npm 是否可用
  const npmStatus = checkNpmAvailable()
  if (!npmStatus.available) {
    return c.json({
      success: false,
      error: npmStatus.error
    }, 400)
  }

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      data: JSON.stringify({
        type: 'log',
        message: '🚀 开始安装 Claude Code CLI...'
      })
    })

    await stream.writeSSE({
      data: JSON.stringify({
        type: 'log',
        message: '📦 运行: npm install -g @anthropic-ai/claude-code'
      })
    })

    const isWindows = platform() === 'win32'
    const npmCmd = isWindows ? 'npm.cmd' : 'npm'

    const proc = spawn(npmCmd, ['install', '-g', '@anthropic-ai/claude-code'], {
      shell: isWindows,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    proc.stdout.on('data', async (data: Buffer) => {
      const lines = data.toString().split('\n').filter(l => l.trim())
      for (const line of lines) {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'log', message: line })
        })
      }
    })

    proc.stderr.on('data', async (data: Buffer) => {
      const lines = data.toString().split('\n').filter(l => l.trim())
      for (const line of lines) {
        // npm 的进度信息通常在 stderr
        await stream.writeSSE({
          data: JSON.stringify({ type: 'log', message: line })
        })
      }
    })

    await new Promise<void>((resolve) => {
      proc.on('close', async (code) => {
        if (code === 0) {
          // 验证安装
          const installedPath = findClaudeCodePath()
          if (installedPath) {
            await stream.writeSSE({
              data: JSON.stringify({
                type: 'log',
                message: '✅ Claude Code 安装成功!'
              })
            })
            await stream.writeSSE({
              data: JSON.stringify({
                type: 'log',
                message: `📍 安装路径: ${installedPath}`
              })
            })
            await stream.writeSSE({
              data: JSON.stringify({
                type: 'done',
                success: true,
                path: installedPath
              })
            })
          } else {
            await stream.writeSSE({
              data: JSON.stringify({
                type: 'done',
                success: false,
                error: '安装完成但无法找到 Claude Code'
              })
            })
          }
        } else {
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'done',
              success: false,
              error: `安装失败，退出码: ${code}`
            })
          })
        }
        resolve()
      })

      proc.on('error', async (err) => {
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'done',
            success: false,
            error: err.message
          })
        })
        resolve()
      })
    })
  })
})

export default setup
