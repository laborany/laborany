/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         uv 管理工具                                       ║
 * ║                                                                          ║
 * ║  职责：管理 uv 二进制、Python 安装、依赖安装                               ║
 * ║  设计：自动检测打包的 uv，自动安装 Python 和依赖                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { spawn, execSync } from 'child_process'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { platform } from 'os'
import { DEFAULT_PYTHON_VERSION } from './types.js'
import { wrapCmdForUtf8, withUtf8Env } from 'laborany-shared'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           路径工具函数                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function isPackaged(): boolean {
  // pkg 打包后，process.execPath 不包含 'node'
  return !process.execPath.includes('node')
}

/**
 * 获取 Electron resourcesPath（如果在 Electron 环境中）
 */
function getResourcesPath(): string | null {
  const proc = process as NodeJS.Process & { resourcesPath?: string }
  return proc.resourcesPath || null
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           uv 路径检测                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/**
 * 获取打包的 uv 二进制路径
 * 优先级：Electron resources > pkg 打包路径 > 开发模式 > 系统安装
 */
export function getUvPath(): string | null {
  const os = platform()
  const arch = process.arch
  const uvBin = os === 'win32' ? 'uv.exe' : 'uv'
  const exeDir = dirname(process.execPath)
  const resourcesPath = getResourcesPath()
  const bundleDirNames = os === 'darwin'
    ? [arch === 'arm64' ? 'uv-bundle-arm64' : 'uv-bundle-x64', 'uv-bundle']
    : ['uv-bundle']

  const candidates: string[] = []
  const seen = new Set<string>()

  // 1. Electron 打包路径（resourcesPath 存在时）
  if (resourcesPath) {
    for (const dirName of bundleDirNames) {
      const candidate = join(resourcesPath, dirName, uvBin)
      if (!seen.has(candidate)) {
        seen.add(candidate)
        candidates.push(candidate)
      }
    }
  }

  // 2. pkg 打包路径（API exe 在 resources/api/）
  for (const base of [join(exeDir, '..'), exeDir, join(exeDir, '..', 'resources'), join(exeDir, 'resources')]) {
    for (const dirName of bundleDirNames) {
      const candidate = join(base, dirName, uvBin)
      if (!seen.has(candidate)) {
        seen.add(candidate)
        candidates.push(candidate)
      }
    }
  }
  const exeLocalUv = join(exeDir, uvBin)
  if (!seen.has(exeLocalUv)) {
    seen.add(exeLocalUv)
    candidates.push(exeLocalUv)
  }

  // 3. 开发模式路径
  if (!isPackaged()) {
    for (const base of [join(__dirname, '..', '..', '..', '..'), process.cwd()]) {
      for (const dirName of bundleDirNames) {
        const candidate = join(base, dirName, uvBin)
        if (!seen.has(candidate)) {
          seen.add(candidate)
          candidates.push(candidate)
        }
      }
    }
  }

  for (const path of candidates) {
    if (existsSync(path)) {
      console.log(`[uv] 找到打包的 uv: ${path}`)
      return path
    }
  }

  // 4. 检查系统安装的 uv
  try {
    const whichCmd = os === 'win32' ? 'where' : 'which'
    const result = execSync(wrapCmdForUtf8(`${whichCmd} uv`), { encoding: 'utf-8' }).trim()
    if (result) {
      // Windows 的 where 命令返回 \r\n，需要处理
      const paths = result.split(/[\r\n]+/).map(p => p.trim()).filter(Boolean)
      for (const p of paths) {
        if (existsSync(p)) {
          console.log(`[uv] 找到系统安装的 uv: ${p}`)
          return p
        }
      }
    }
  } catch {
    // uv 未安装
  }

  return null
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           uv 命令执行                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */

interface UvExecResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
}

/**
 * 执行 uv 命令
 */
export async function execUv(
  args: string[],
  options?: { cwd?: string; timeout?: number }
): Promise<UvExecResult> {
  const uvPath = getUvPath()
  if (!uvPath) {
    return {
      success: false,
      stdout: '',
      stderr: 'uv 未找到，请确保已打包或安装 uv',
      exitCode: 1,
    }
  }

  return new Promise((resolve) => {
    const proc = spawn(uvPath, args, {
      cwd: options?.cwd || process.cwd(),
      env: withUtf8Env({ ...process.env }),
      timeout: options?.timeout || 300000,  // 5 分钟默认超时
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
      })
    })

    proc.on('error', (err) => {
      resolve({
        success: false,
        stdout,
        stderr: stderr + '\n' + err.message,
        exitCode: 1,
      })
    })
  })
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Python 环境管理                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */

let pythonInstalled = false

/**
 * 确保 Python 已安装
 * 使用 uv python install 自动安装
 */
export async function ensurePython(
  version: string = DEFAULT_PYTHON_VERSION
): Promise<boolean> {
  if (pythonInstalled) return true

  const uvPath = getUvPath()
  if (!uvPath) {
    console.error('[uv] uv 未找到，无法安装 Python')
    return false
  }

  console.log(`[uv] 检查 Python ${version}...`)

  // 先检查是否已安装
  const checkResult = await execUv(['python', 'find', version])
  if (checkResult.success && checkResult.stdout.trim()) {
    console.log(`[uv] Python ${version} 已安装: ${checkResult.stdout.trim()}`)
    pythonInstalled = true
    return true
  }

  // 安装 Python
  console.log(`[uv] 正在安装 Python ${version}...`)
  const installResult = await execUv(['python', 'install', version])

  if (installResult.success) {
    console.log(`[uv] Python ${version} 安装成功`)
    pythonInstalled = true
    return true
  }

  console.error(`[uv] Python 安装失败: ${installResult.stderr}`)
  return false
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           依赖包安装                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */

const installedPackages = new Set<string>()

/**
 * 安装 Python 依赖包
 * 使用 uv pip install
 */
export async function installPackages(
  packages: string[],
  workDir: string
): Promise<boolean> {
  if (packages.length === 0) return true

  // 过滤已安装的包
  const toInstall = packages.filter(pkg => !installedPackages.has(pkg))
  if (toInstall.length === 0) {
    console.log('[uv] 所有依赖已安装')
    return true
  }

  console.log(`[uv] 正在安装依赖: ${toInstall.join(', ')}`)

  const result = await execUv(
    ['pip', 'install', '--quiet', ...toInstall],
    { cwd: workDir }
  )

  if (result.success) {
    toInstall.forEach(pkg => installedPackages.add(pkg))
    console.log('[uv] 依赖安装成功')
    return true
  }

  console.error(`[uv] 依赖安装失败: ${result.stderr}`)
  return false
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Python 脚本执行                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */

interface RunPythonOptions {
  scriptPath: string
  workDir: string
  args?: string[]
  env?: Record<string, string>
  timeout?: number
}

interface RunPythonResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
  duration: number
}

/**
 * 使用 uv run 执行 Python 脚本
 */
export async function runPython(options: RunPythonOptions): Promise<RunPythonResult> {
  const { scriptPath, workDir, args = [], env = {}, timeout = 120000 } = options
  const startTime = Date.now()

  const uvPath = getUvPath()
  if (!uvPath) {
    return {
      success: false,
      stdout: '',
      stderr: 'uv 未找到',
      exitCode: 1,
      duration: Date.now() - startTime,
    }
  }

  return new Promise((resolve) => {
    const uvArgs = ['run', 'python', scriptPath, ...args]

    console.log(`[uv] 执行: uv ${uvArgs.join(' ')} (cwd: ${workDir})`)

    const proc = spawn(uvPath, uvArgs, {
      cwd: workDir,
      env: withUtf8Env({ ...process.env, ...env }),
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
      })
    })

    proc.on('error', (err) => {
      resolve({
        success: false,
        stdout,
        stderr: stderr + '\n' + err.message,
        exitCode: 1,
        duration: Date.now() - startTime,
      })
    })
  })
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           uv 可用性检查                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/**
 * 检查 uv 是否可用
 */
export async function isUvAvailable(): Promise<boolean> {
  const uvPath = getUvPath()
  if (!uvPath) return false

  const result = await execUv(['--version'])
  if (result.success) {
    console.log(`[uv] 版本: ${result.stdout.trim()}`)
    return true
  }
  return false
}
