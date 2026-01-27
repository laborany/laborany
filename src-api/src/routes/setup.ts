/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         初始化设置 API 路由                               ║
 * ║                                                                          ║
 * ║  端点：检查 Claude Code 状态、安装 Claude Code                            ║
 * ║  支持：使用打包的便携版 Node.js 或系统 Node.js                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { execSync, spawn } from 'child_process'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { homedir, platform } from 'os'

const setup = new Hono()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取打包的 Node.js 路径                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getBundledNodePath(): { node: string; npm: string } | null {
  const os = platform()
  const exeDir = dirname(process.execPath)

  // 打包后的路径结构：resources/node/node.exe 和 resources/node/npm.cmd
  const candidates = [
    // pkg 打包模式
    join(exeDir, '..', 'node'),
    join(exeDir, 'node'),
    // Electron resources 路径
    join(exeDir, '..', 'resources', 'node'),
  ]

  for (const nodeDir of candidates) {
    const nodeBin = os === 'win32' ? join(nodeDir, 'node.exe') : join(nodeDir, 'bin', 'node')
    const npmBin = os === 'win32' ? join(nodeDir, 'npm.cmd') : join(nodeDir, 'bin', 'npm')

    if (existsSync(nodeBin)) {
      console.log(`[Setup] 找到打包的 Node.js: ${nodeDir}`)
      return { node: nodeBin, npm: npmBin }
    }
  }

  return null
}

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
 * │                       检查 npm 是否可用                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function checkNpmAvailable(): {
  available: boolean
  version?: string
  error?: string
  bundled?: boolean
  npmPath?: string
} {
  // 优先检查打包的 Node.js
  const bundled = getBundledNodePath()
  if (bundled && existsSync(bundled.npm)) {
    try {
      const version = execSync(`"${bundled.npm}" --version`, {
        encoding: 'utf-8',
        shell: true
      }).trim()
      return { available: true, version, bundled: true, npmPath: bundled.npm }
    } catch {
      // 打包的 npm 不可用，继续检查系统 npm
    }
  }

  // 检查系统 npm
  try {
    const version = execSync('npm --version', { encoding: 'utf-8' }).trim()
    return { available: true, version, bundled: false }
  } catch {
    // 系统 npm 也不可用
  }

  // 都不可用
  return {
    available: false,
    error: 'Node.js 未找到。正在准备自动安装...'
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       检查设���状态                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
setup.get('/status', (c) => {
  const claudeCodePath = findClaudeCodePath()
  const npmStatus = checkNpmAvailable()

  // 如果 Claude Code 已安装，直接返回就绪
  if (claudeCodePath) {
    return c.json({
      claudeCode: { installed: true, path: claudeCodePath },
      npm: npmStatus,
      ready: true,
    })
  }

  return c.json({
    claudeCode: { installed: false, path: null },
    npm: npmStatus,
    ready: false,
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
      error: 'Node.js 未安装。请先安装 Node.js: https://nodejs.org/',
      needsNodejs: true
    }, 400)
  }

  return streamSSE(c, async (stream) => {
    const npmCmd = npmStatus.npmPath || (platform() === 'win32' ? 'npm.cmd' : 'npm')
    const useShell = !npmStatus.bundled && platform() === 'win32'

    await stream.writeSSE({
      data: JSON.stringify({
        type: 'log',
        message: '🚀 开始安装 Claude Code CLI...'
      })
    })

    await stream.writeSSE({
      data: JSON.stringify({
        type: 'log',
        message: npmStatus.bundled
          ? '📦 使用内置 Node.js 安装...'
          : '📦 使用系统 Node.js 安装...'
      })
    })

    await stream.writeSSE({
      data: JSON.stringify({
        type: 'log',
        message: `运行: ${npmCmd} install -g @anthropic-ai/claude-code`
      })
    })

    const proc = spawn(npmCmd, ['install', '-g', '@anthropic-ai/claude-code'], {
      shell: useShell,
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
        await stream.writeSSE({
          data: JSON.stringify({ type: 'log', message: line })
        })
      }
    })

    await new Promise<void>((resolve) => {
      proc.on('close', async (code) => {
        if (code === 0) {
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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       下载并安装 Node.js                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
setup.post('/install-nodejs', async (c) => {
  const os = platform()

  if (os !== 'win32') {
    return c.json({
      success: false,
      error: '自动安装 Node.js 目前仅支持 Windows'
    }, 400)
  }

  return streamSSE(c, async (stream) => {
    const https = await import('https')
    const fs = await import('fs')
    const { pipeline } = await import('stream/promises')
    const { createWriteStream } = fs
    const { tmpdir } = await import('os')
    const { execSync: exec } = await import('child_process')

    const nodeVersion = 'v20.18.0'
    const downloadUrl = `https://nodejs.org/dist/${nodeVersion}/node-${nodeVersion}-x64.msi`
    const tempFile = join(tmpdir(), 'node-installer.msi')

    await stream.writeSSE({
      data: JSON.stringify({
        type: 'log',
        message: '🌐 正在下载 Node.js...'
      })
    })

    await stream.writeSSE({
      data: JSON.stringify({
        type: 'log',
        message: `版本: ${nodeVersion}`
      })
    })

    try {
      // 下载 Node.js 安装程序
      await new Promise<void>((resolve, reject) => {
        const file = createWriteStream(tempFile)
        https.get(downloadUrl, (response) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            // 处理重定向
            https.get(response.headers.location!, (res) => {
              res.pipe(file)
              file.on('finish', () => {
                file.close()
                resolve()
              })
            }).on('error', reject)
          } else {
            response.pipe(file)
            file.on('finish', () => {
              file.close()
              resolve()
            })
          }
        }).on('error', reject)
      })

      await stream.writeSSE({
        data: JSON.stringify({
          type: 'log',
          message: '✅ 下载完成，正在安装...'
        })
      })

      await stream.writeSSE({
        data: JSON.stringify({
          type: 'log',
          message: '⚠️ 可能需要管理员权限，请在弹出的窗口中确认'
        })
      })

      // 运行安装程序（静默安装）
      exec(`msiexec /i "${tempFile}" /qn /norestart`, {
        encoding: 'utf-8',
        stdio: 'inherit'
      })

      // 清理临时文件
      fs.unlinkSync(tempFile)

      await stream.writeSSE({
        data: JSON.stringify({
          type: 'log',
          message: '✅ Node.js 安装完成!'
        })
      })

      await stream.writeSSE({
        data: JSON.stringify({
          type: 'done',
          success: true,
          message: '请重启应用以完成设置'
        })
      })
    } catch (error) {
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'done',
          success: false,
          error: `安装失败: ${error instanceof Error ? error.message : error}`
        })
      })
    }
  })
})

export default setup
