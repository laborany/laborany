/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         原生沙盒提供者                                     ║
 * ║                                                                          ║
 * ║  职责：直接在主机上执行脚本，无隔离                                         ║
 * ║  设计：作为回退方案，当 uv 不可用时使用                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { spawn } from 'child_process'
import { extname } from 'path'
import { platform } from 'os'
import type { ISandboxProvider, ScriptExecOptions, ScriptExecResult } from '../core/sandbox/types.js'
import { DEFAULT_TIMEOUT } from '../core/sandbox/types.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           运行时检测                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function detectRuntime(filePath: string): { cmd: string; args: string[] } {
  const ext = extname(filePath).toLowerCase()
  const isWindows = platform() === 'win32'

  switch (ext) {
    case '.py':
      // Windows 上使用 python，Unix 上使用 python3
      return { cmd: isWindows ? 'python' : 'python3', args: [] }
    case '.ts':
    case '.mts':
      return { cmd: 'npx', args: ['tsx'] }
    case '.js':
    case '.mjs':
      return { cmd: 'node', args: [] }
    case '.sh':
      return { cmd: 'bash', args: [] }
    default:
      return { cmd: 'node', args: [] }
  }
}

/* ┌───────────────────────────────────────────────────────────────────────���──┐
 * │                           NativeProvider 实现                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export class NativeProvider implements ISandboxProvider {
  readonly type = 'native'
  readonly name = 'Native (无隔离)'

  async isAvailable(): Promise<boolean> {
    // 原生执行始终可用
    return true
  }

  async init(): Promise<void> {
    console.log('[NativeProvider] 初始化完成（无隔离模式）')
  }

  async runScript(options: ScriptExecOptions): Promise<ScriptExecResult> {
    const { scriptPath, workDir, args = [], env = {}, timeout = DEFAULT_TIMEOUT } = options
    const startTime = Date.now()

    const runtime = detectRuntime(scriptPath)
    const fullArgs = [...runtime.args, scriptPath, ...args]

    console.log(`[NativeProvider] 执行: ${runtime.cmd} ${fullArgs.join(' ')} (cwd: ${workDir})`)

    return new Promise((resolve) => {
      const proc = spawn(runtime.cmd, fullArgs, {
        cwd: workDir,
        env: { ...process.env, ...env },
        timeout,
        // Windows 上不使用 shell，直接执行
      })

      let stdout = ''
      let stderr = ''

      proc.stdout?.on('data', (data) => { stdout += data.toString() })
      proc.stderr?.on('data', (data) => { stderr += data.toString() })

      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          stdout,
          stderr,
          exitCode: code || 0,
          duration: Date.now() - startTime,
          provider: { type: this.type, name: this.name, isolation: 'none' },
        })
      })

      proc.on('error', (err) => {
        resolve({
          success: false,
          stdout,
          stderr: stderr + '\n' + err.message,
          exitCode: 1,
          duration: Date.now() - startTime,
          provider: { type: this.type, name: this.name, isolation: 'none' },
        })
      })
    })
  }

  async stop(): Promise<void> {
    console.log('[NativeProvider] 已停止')
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           工厂函数                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function createNativeProvider(): NativeProvider {
  return new NativeProvider()
}
