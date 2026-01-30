/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       Live Preview 服务                                   ║
 * ║                                                                          ║
 * ║  管理 Vite 开发服务器实例，支持 HMR 热更新预览                               ║
 * ║  优先使用内置 Node.js，无需系统安装                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { execSync, spawn, type ChildProcess } from 'child_process'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import { platform } from 'os'
import { dirname } from 'path'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           配置常量                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const CONFIG = {
  PORT_START: 5173,
  PORT_END: 5273,
  MAX_CONCURRENT: 5,
  IDLE_TIMEOUT_MS: 30 * 60 * 1000,    // 30 分钟
  HEALTH_CHECK_MS: 10 * 1000,          // 10 秒
  STARTUP_TIMEOUT_MS: 120 * 1000,      // 2 分钟
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface PreviewStatus {
  id: string
  taskId: string
  status: 'starting' | 'running' | 'stopped' | 'error'
  url?: string
  port?: number
  error?: string
}

interface PreviewInstance {
  id: string
  taskId: string
  port: number
  status: PreviewStatus['status']
  error?: string
  startedAt: Date
  lastAccessedAt: Date
  process?: ChildProcess
  healthCheck?: ReturnType<typeof setInterval>
  idleTimeout?: ReturnType<typeof setTimeout>
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       默认项目文件                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const DEFAULT_PACKAGE_JSON = {
  name: 'preview',
  type: 'module',
  scripts: { dev: 'vite' },
  devDependencies: { vite: '~5.4.0' },
}

const generateViteConfig = (port: number): string => `export default {
  server: {
    host: '0.0.0.0',
    port: ${port},
    strictPort: true,
    watch: { usePolling: true },
  },
  appType: 'mpa',
}`

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       内置 Node.js 路径检测                               │
 * │  优先使用打包的 Node.js，避免依赖系统安装                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface BundledNode {
  node: string
  npm: string
}

let cachedBundledNode: BundledNode | null | undefined = undefined

/* ── 列出目录内容（用于调试） ── */
function listDir(dir: string): string[] {
  try {
    if (fsSync.existsSync(dir)) {
      return fsSync.readdirSync(dir)
    }
  } catch { /* ignore */ }
  return []
}

function getBundledNodePath(): BundledNode | null {
  if (cachedBundledNode !== undefined) return cachedBundledNode

  const os = platform()
  const exeDir = dirname(process.execPath)
  const parentDir = dirname(exeDir)

  console.log('[Preview] ========== 检测 Node.js 路径 ==========')
  console.log('[Preview] platform:', os)
  console.log('[Preview] process.execPath:', process.execPath)
  console.log('[Preview] exeDir:', exeDir)
  console.log('[Preview] parentDir:', parentDir)
  console.log('[Preview] __dirname:', __dirname)
  console.log('[Preview] cwd:', process.cwd())

  /* ── 列出关键目录内容 ── */
  console.log('[Preview] exeDir 内容:', listDir(exeDir))
  console.log('[Preview] parentDir 内容:', listDir(parentDir))

  /* ── 候选路径：覆盖 Electron 打包环境 ── */
  const candidates = [
    /* ═══════════════════════════════════════════════════════════════════════
     *  Electron 生产环境（最重要）
     *  API 运行位置: resources/api/laborany-api.exe
     *  cli-bundle 位置: resources/cli-bundle/
     * ═══════════════════════════════════════════════════════════════════════ */
    path.join(exeDir, '..', 'cli-bundle'),

    /* ── macOS Electron 路径 ── */
    path.join(exeDir, '..', 'Resources', 'cli-bundle'),
    path.join(parentDir, 'cli-bundle'),

    /* ── Windows/Linux Electron 路径 ── */
    path.join(exeDir, 'resources', 'cli-bundle'),
    path.join(exeDir, '..', 'resources', 'cli-bundle'),

    /* ── 开发环境路径 ── */
    path.join(process.cwd(), 'cli-bundle'),
    path.join(__dirname, '..', '..', 'cli-bundle'),
    path.join(__dirname, '..', '..', '..', 'cli-bundle'),

    /* ── Electron asar.unpacked 路径 ── */
    path.join(exeDir, '..', 'app.asar.unpacked', 'cli-bundle'),
  ]

  for (const bundleDir of candidates) {
    const resolvedDir = path.resolve(bundleDir)
    const nodeBin = os === 'win32'
      ? path.join(resolvedDir, 'node.exe')
      : path.join(resolvedDir, 'node')
    const npmCli = path.join(resolvedDir, 'deps', 'npm', 'bin', 'npm-cli.js')

    const dirExists = fsSync.existsSync(resolvedDir)
    const nodeExists = fsSync.existsSync(nodeBin)
    const npmExists = fsSync.existsSync(npmCli)

    console.log(`[Preview] 检查: ${resolvedDir}`)
    console.log(`[Preview]   目录存在: ${dirExists}, node: ${nodeExists}, npm: ${npmExists}`)

    if (dirExists) {
      console.log(`[Preview]   目录内容: ${listDir(resolvedDir).join(', ')}`)
    }

    if (nodeExists && npmExists) {
      console.log(`[Preview] ✓ 找到内置 Node.js: ${resolvedDir}`)
      cachedBundledNode = { node: nodeBin, npm: npmCli }
      return cachedBundledNode
    }
  }

  console.log('[Preview] ✗ 未找到内置 Node.js，将回退到系统 Node.js')
  cachedBundledNode = null
  return null
}

export function isNodeAvailable(): boolean {
  // 优先检查内置 Node.js
  if (getBundledNodePath()) return true

  // 回退到系统 Node.js
  try {
    execSync('node --version', { stdio: 'pipe' })
    execSync('npm --version', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       PreviewManager 类                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class PreviewManager {
  private instances = new Map<string, PreviewInstance>()
  private usedPorts = new Set<number>()

  constructor() {
    process.on('SIGTERM', () => this.stopAll())
    process.on('SIGINT', () => this.stopAll())
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 启动预览
   * ──────────────────────────────────────────────────────────────────────── */
  async startPreview(taskId: string, workDir: string): Promise<PreviewStatus> {
    // 已在运行
    const existing = this.instances.get(taskId)
    if (existing?.status === 'running') {
      existing.lastAccessedAt = new Date()
      this.resetIdleTimeout(existing)
      return this.toStatus(existing)
    }

    // 检查并发限制
    const running = [...this.instances.values()].filter(
      i => i.status === 'running' || i.status === 'starting'
    ).length
    if (running >= CONFIG.MAX_CONCURRENT) {
      const oldest = this.findOldestIdle()
      if (oldest) await this.stopPreview(oldest.taskId)
      else return { id: `preview-${taskId}`, taskId, status: 'error', error: '已达最大并发数' }
    }

    // 分配端口
    const port = this.allocatePort()
    if (!port) {
      return { id: `preview-${taskId}`, taskId, status: 'error', error: '无可用端口' }
    }

    // 创建实例
    const instance: PreviewInstance = {
      id: `preview-${taskId}`,
      taskId,
      port,
      status: 'starting',
      startedAt: new Date(),
      lastAccessedAt: new Date(),
    }
    this.instances.set(taskId, instance)

    // 异步启动
    this.startViteServer(instance, workDir).catch(err => {
      console.error(`[Preview] 启动失败 ${taskId}:`, err)
      instance.status = 'error'
      instance.error = err instanceof Error ? err.message : String(err)
      this.releasePort(port)
    })

    return this.toStatus(instance)
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 停止预览
   * ──────────────────────────────────────────────────────────────────────── */
  async stopPreview(taskId: string): Promise<PreviewStatus> {
    const instance = this.instances.get(taskId)
    if (!instance) return { id: `preview-${taskId}`, taskId, status: 'stopped' }

    console.log(`[Preview] 停止 ${taskId}`)
    await this.cleanup(instance)
    instance.status = 'stopped'
    return this.toStatus(instance)
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 获取状态
   * ──────────────────────────────────────────────────────────────────────── */
  getStatus(taskId: string): PreviewStatus {
    const instance = this.instances.get(taskId)
    if (!instance) return { id: `preview-${taskId}`, taskId, status: 'stopped' }

    instance.lastAccessedAt = new Date()
    this.resetIdleTimeout(instance)
    return this.toStatus(instance)
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 停止所有
   * ──────────────────────────────────────────────────────────────────────── */
  async stopAll(): Promise<void> {
    console.log('[Preview] 停止所有预览服务器')
    await Promise.all([...this.instances.keys()].map(id => this.stopPreview(id)))
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 私有方法：启动 Vite 服务器
   * ──────────────────────────────────────────────────────────────────────── */
  private async startViteServer(instance: PreviewInstance, workDir: string): Promise<void> {
    console.log(`[Preview] ========== 启动 Vite 服务器 ==========`)
    console.log(`[Preview] taskId: ${instance.taskId}`)
    console.log(`[Preview] workDir: ${workDir}`)
    console.log(`[Preview] port: ${instance.port}`)

    await this.ensureProjectFiles(workDir, instance.port)

    // 检查是否需要安装依赖
    const viteBin = path.join(workDir, 'node_modules', '.bin', 'vite')
    const viteBinExists = fsSync.existsSync(viteBin)
    console.log(`[Preview] viteBin 路径: ${viteBin}`)
    console.log(`[Preview] viteBin 存在: ${viteBinExists}`)

    if (!viteBinExists) {
      console.log('[Preview] 开始安装依赖...')
      try {
        await this.runNpmInstall(workDir)
        console.log('[Preview] 依赖安装完成')
      } catch (err) {
        console.error('[Preview] 依赖安装失败:', err)
        throw err
      }
    }

    // 启动 Vite（优先使用内置 Node.js）
    const viteCli = path.join(workDir, 'node_modules', 'vite', 'bin', 'vite.js')
    const viteCliExists = fsSync.existsSync(viteCli)
    const bundled = getBundledNodePath()

    console.log(`[Preview] viteCli 路径: ${viteCli}`)
    console.log(`[Preview] viteCli 存在: ${viteCliExists}`)
    console.log(`[Preview] bundled Node.js: ${bundled ? bundled.node : 'null'}`)

    let cmd: string
    let args: string[]
    let useShell: boolean

    if (viteCliExists && bundled) {
      cmd = bundled.node
      args = [viteCli]
      useShell = false
      console.log(`[Preview] 使用内置 Node.js 启动 Vite`)
    } else if (viteCliExists) {
      cmd = 'node'
      args = [viteCli]
      useShell = true
      console.log(`[Preview] 使用系统 Node.js 启动 Vite`)
    } else {
      cmd = 'npx'
      args = ['vite']
      useShell = true
      console.log(`[Preview] 使用 npx 启动 Vite`)
    }

    console.log(`[Preview] 执行命令: ${cmd} ${args.join(' ')}`)
    console.log(`[Preview] shell: ${useShell}`)

    const proc = spawn(cmd, args, {
      cwd: workDir,
      shell: useShell,
      stdio: 'pipe',
      env: { ...process.env, FORCE_COLOR: '0' },
    })

    instance.process = proc
    console.log(`[Preview] 进程已启动, PID: ${proc.pid}`)

    proc.stdout?.on('data', d => console.log(`[Preview:vite:stdout] ${d.toString().trim()}`))
    proc.stderr?.on('data', d => console.log(`[Preview:vite:stderr] ${d.toString().trim()}`))

    proc.on('close', code => {
      console.log(`[Preview] Vite 进程关闭, code=${code}, 当前状态=${instance.status}`)
      if (instance.status === 'running' || instance.status === 'starting') {
        instance.status = 'error'
        instance.error = `Vite 进程异常退出 (code=${code})`
        // 清理资源但保留实例，让前端能获取错误信息
        if (instance.healthCheck) {
          clearInterval(instance.healthCheck)
          instance.healthCheck = undefined
        }
        if (instance.idleTimeout) {
          clearTimeout(instance.idleTimeout)
          instance.idleTimeout = undefined
        }
        instance.process = undefined
        this.releasePort(instance.port)
      }
    })

    proc.on('error', err => {
      console.error('[Preview] Vite 进程错误:', err)
      instance.status = 'error'
      instance.error = err.message
      this.cleanup(instance)
    })

    // 等待服务器就绪
    const ready = await this.waitForReady(instance.port)
    if (ready) {
      instance.status = 'running'
      this.startHealthCheck(instance)
      this.resetIdleTimeout(instance)
      console.log(`[Preview] Vite 运行在 http://localhost:${instance.port}`)
    } else {
      instance.status = 'error'
      instance.error = '启动超时'
      proc.kill()
      this.cleanup(instance)
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 私有方法：运行 npm install（优先使用内置 Node.js）
   * ──────────────────────────────────────────────────────────────────────── */
  private runNpmInstall(workDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const bundled = getBundledNodePath()

      let proc
      if (bundled) {
        proc = spawn(bundled.node, [bundled.npm, 'install'], { cwd: workDir, stdio: 'pipe' })
      } else {
        proc = spawn('npm', ['install'], { cwd: workDir, shell: true, stdio: 'pipe' })
      }
      let stderr = ''

      proc.stdout?.on('data', d => console.log(`[Preview:npm] ${d.toString().trim()}`))
      proc.stderr?.on('data', d => { stderr += d.toString() })

      const timeout = setTimeout(() => {
        proc.kill()
        reject(new Error('npm install 超时'))
      }, 120000)

      proc.on('close', code => {
        clearTimeout(timeout)
        code === 0 ? resolve() : reject(new Error(`npm install 失败: ${stderr}`))
      })

      proc.on('error', err => {
        clearTimeout(timeout)
        reject(err)
      })
    })
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 私有方法：确保项目文件存在
   * ──────────────────────────────────────────────────────────────────────── */
  private async ensureProjectFiles(workDir: string, port: number): Promise<void> {
    // package.json
    const pkgPath = path.join(workDir, 'package.json')
    if (!fsSync.existsSync(pkgPath)) {
      await fs.writeFile(pkgPath, JSON.stringify(DEFAULT_PACKAGE_JSON, null, 2))
    }

    // 删除可能冲突的配置文件
    for (const ext of ['ts', 'mts', 'mjs']) {
      const p = path.join(workDir, `vite.config.${ext}`)
      if (fsSync.existsSync(p)) await fs.unlink(p)
    }

    // vite.config.js
    await fs.writeFile(path.join(workDir, 'vite.config.js'), generateViteConfig(port))

    // index.html - 确保始终存在
    const indexPath = path.join(workDir, 'index.html')
    if (!fsSync.existsSync(indexPath)) {
      const files = await fs.readdir(workDir)
      const htmlFiles = files.filter(f => f.endsWith('.html'))

      if (htmlFiles.length > 0) {
        /* ── 有其他 HTML 文件，创建重定向页面 ── */
        const html = htmlFiles[0]
        await fs.writeFile(indexPath, `<!DOCTYPE html>
<html><head><meta http-equiv="refresh" content="0; url='./${html}'"></head>
<body><p>重定向到 <a href="./${html}">${html}</a>...</p></body></html>`)
      } else {
        /* ── 没有 HTML 文件，创建文件列表页面 ── */
        const previewableExts = ['.js', '.css', '.json', '.txt', '.md', '.svg', '.png', '.jpg', '.gif']
        const previewFiles = files.filter(f => {
          const ext = path.extname(f).toLowerCase()
          return previewableExts.includes(ext) || f.endsWith('.html')
        })

        const fileLinks = previewFiles.length > 0
          ? previewFiles.map(f => `<li><a href="./${f}">${f}</a></li>`).join('\n')
          : '<li>暂无可预览的文件</li>'

        await fs.writeFile(indexPath, `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Preview</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
    h1 { color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    ul { list-style: none; padding: 0; }
    li { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .hint { color: #666; font-size: 14px; margin-top: 20px; }
  </style>
</head>
<body>
  <h1>📁 Live Preview</h1>
  <p>工作目录中的文件：</p>
  <ul>${fileLinks}</ul>
  <p class="hint">提示：创建 index.html 文件后，此页面将自动显示您的内容。</p>
</body>
</html>`)
      }
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 私有方法：等待服务器就绪
   * ──────────────────────────────────────────────────────────────────────── */
  private async waitForReady(port: number): Promise<boolean> {
    const start = Date.now()
    let attempts = 0

    while (Date.now() - start < CONFIG.STARTUP_TIMEOUT_MS) {
      attempts++
      try {
        const ctrl = new AbortController()
        const tid = setTimeout(() => ctrl.abort(), 3000)
        const res = await fetch(`http://localhost:${port}`, { signal: ctrl.signal })
        clearTimeout(tid)
        if (res.ok || res.status === 404) {
          console.log(`[Preview] 服务器就绪 (${attempts} 次尝试)`)
          return true
        }
      } catch {
        if (attempts % 10 === 0) console.log(`[Preview] 等待中... ${attempts} 次`)
      }
      await new Promise(r => setTimeout(r, 1000))
    }
    return false
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 私有方法：端口管理
   * ──────────────────────────────────────────────────────────────────────── */
  private allocatePort(): number | null {
    for (let p = CONFIG.PORT_START; p <= CONFIG.PORT_END; p++) {
      if (!this.usedPorts.has(p)) {
        this.usedPorts.add(p)
        return p
      }
    }
    return null
  }

  private releasePort(port: number): void {
    this.usedPorts.delete(port)
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 私有方法：健康检查
   * ──────────────────────────────────────────────────────────────────────── */
  private startHealthCheck(instance: PreviewInstance): void {
    if (instance.healthCheck) clearInterval(instance.healthCheck)

    instance.healthCheck = setInterval(async () => {
      if (instance.status !== 'running') return
      try {
        const res = await fetch(`http://localhost:${instance.port}`, { method: 'HEAD' })
        if (!res.ok && res.status !== 404) throw new Error('健康检查失败')
      } catch {
        console.log(`[Preview] 健康检查失败 ${instance.taskId}`)
        instance.status = 'error'
        instance.error = '服务器无响应'
        this.cleanup(instance)
      }
    }, CONFIG.HEALTH_CHECK_MS)
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 私有方法：空闲超时
   * ──────────────────────────────────────────────────────────────────────── */
  private resetIdleTimeout(instance: PreviewInstance): void {
    if (instance.idleTimeout) clearTimeout(instance.idleTimeout)
    instance.idleTimeout = setTimeout(() => {
      console.log(`[Preview] 空闲超时 ${instance.taskId}`)
      this.stopPreview(instance.taskId)
    }, CONFIG.IDLE_TIMEOUT_MS)
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 私有方法：查找最旧的空闲实例
   * ──────────────────────────────────────────────────────────────────────── */
  private findOldestIdle(): PreviewInstance | null {
    let oldest: PreviewInstance | null = null
    let oldestTime = Date.now()

    for (const inst of this.instances.values()) {
      if (inst.status === 'running' && inst.lastAccessedAt.getTime() < oldestTime) {
        oldest = inst
        oldestTime = inst.lastAccessedAt.getTime()
      }
    }
    return oldest
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 私有方法：清理实例
   * ──────────────────────────────────────────────────────────────────────── */
  private async cleanup(instance: PreviewInstance): Promise<void> {
    if (instance.healthCheck) {
      clearInterval(instance.healthCheck)
      instance.healthCheck = undefined
    }
    if (instance.idleTimeout) {
      clearTimeout(instance.idleTimeout)
      instance.idleTimeout = undefined
    }
    if (instance.process) {
      try { instance.process.kill('SIGTERM') } catch {}
      instance.process = undefined
    }
    this.releasePort(instance.port)
    this.instances.delete(instance.taskId)
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 私有方法：转换为状态对象
   * ──────────────────────────────────────────────────────────────────────── */
  private toStatus(instance: PreviewInstance): PreviewStatus {
    return {
      id: instance.id,
      taskId: instance.taskId,
      status: instance.status,
      url: instance.status === 'running' ? `http://localhost:${instance.port}` : undefined,
      port: instance.port,
      error: instance.error,
    }
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       全局单例                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
let manager: PreviewManager | null = null

export function getPreviewManager(): PreviewManager {
  if (!manager) manager = new PreviewManager()
  return manager
}
