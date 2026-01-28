/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         uv Python 沙盒提供者                              ║
 * ║                                                                          ║
 * ║  职责：使用 uv 管理 Python 环境和依赖，执行 Python 脚本                     ║
 * ║  设计：自动安装 Python、自动安装依赖、使用 uv run 执行                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { extname } from 'path'
import type { ISandboxProvider, ScriptExecOptions, ScriptExecResult } from '../core/sandbox/types.js'
import { DEFAULT_TIMEOUT, DEFAULT_PYTHON_VERSION } from '../core/sandbox/types.js'
import { isUvAvailable, ensurePython, installPackages, runPython } from '../core/sandbox/uv.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           UvPythonProvider 实现                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export class UvPythonProvider implements ISandboxProvider {
  readonly type = 'uv-python'
  readonly name = 'uv Python'

  private initialized = false

  async isAvailable(): Promise<boolean> {
    return isUvAvailable()
  }

  async init(): Promise<void> {
    if (this.initialized) return

    console.log('[UvPythonProvider] 初始化中...')

    // 确保 Python 已安装
    const pythonReady = await ensurePython(DEFAULT_PYTHON_VERSION)
    if (!pythonReady) {
      throw new Error('Python 安装失败')
    }

    this.initialized = true
    console.log('[UvPythonProvider] 初始化完成')
  }

  async runScript(options: ScriptExecOptions): Promise<ScriptExecResult> {
    const { scriptPath, workDir, args = [], env = {}, timeout = DEFAULT_TIMEOUT, packages = [] } = options
    const startTime = Date.now()

    // 检查是否为 Python 脚本
    const ext = extname(scriptPath).toLowerCase()
    if (ext !== '.py') {
      return {
        success: false,
        stdout: '',
        stderr: `UvPythonProvider 只支持 Python 脚本，收到: ${ext}`,
        exitCode: 1,
        duration: Date.now() - startTime,
        provider: { type: this.type, name: this.name, isolation: 'process' },
      }
    }

    // 安装依赖（如果有）
    if (packages.length > 0) {
      const installed = await installPackages(packages, workDir)
      if (!installed) {
        return {
          success: false,
          stdout: '',
          stderr: `依赖安装失败: ${packages.join(', ')}`,
          exitCode: 1,
          duration: Date.now() - startTime,
          provider: { type: this.type, name: this.name, isolation: 'process' },
        }
      }
    }

    // 执行脚本
    const result = await runPython({
      scriptPath,
      workDir,
      args,
      env,
      timeout,
    })

    return {
      ...result,
      provider: { type: this.type, name: this.name, isolation: 'process' },
    }
  }

  async stop(): Promise<void> {
    console.log('[UvPythonProvider] 已停止')
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           工厂函数                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function createUvPythonProvider(): UvPythonProvider {
  return new UvPythonProvider()
}
