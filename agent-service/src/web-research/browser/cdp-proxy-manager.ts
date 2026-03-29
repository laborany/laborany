/**
 * CDP Proxy Manager
 *
 * Manages the lifecycle of the cdp-proxy.mjs child process.
 * Provides health checking, automatic restart, and on-demand startup.
 */

import { fork, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

const DEFAULT_PORT = 3456
const HEALTH_CHECK_TIMEOUT_MS = 3000
const WARM_CONNECT_TIMEOUT_MS = 60000
const STARTUP_WAIT_MS = 5000
const STARTUP_POLL_INTERVAL_MS = 300
const MAX_RESTART_ATTEMPTS = 3
const RESTART_COOLDOWN_MS = 2000

interface HealthStatus {
  status: string
  connected: boolean
  sessions: number
  chromePort: number | null
}

interface ProxyDiagnostics {
  status: string
  connected: boolean
  sessions: number
  chromePort: number | null
  diagnostics?: unknown
}

interface StartupDiagnostics {
  scriptPath: string | null
  lastStdout: string[]
  lastStderr: string[]
  lastExit: { code: number | null; signal: NodeJS.Signals | null } | null
}

export class CdpProxyManager {
  private process: ChildProcess | null = null
  private port: number
  private starting = false
  private stopping = false
  private restartAttempts = 0
  private lastRestartTime = 0
  private startupDiagnostics: StartupDiagnostics = {
    scriptPath: null,
    lastStdout: [],
    lastStderr: [],
    lastExit: null,
  }

  constructor(port?: number) {
    this.port = port ?? parseInt(process.env.CDP_PROXY_PORT || String(DEFAULT_PORT))
  }

  /** Returns the CDP Proxy port */
  getPort(): number {
    return this.port
  }

  /**
   * Start the CDP Proxy child process.
   * Resolves when the process is listening and healthy, or rejects on failure.
   */
  async start(): Promise<void> {
    if (this.process && !this.process.killed) {
      const healthy = await this.checkHealth()
      if (healthy) return
      // Process exists but unhealthy — kill and restart
      this.killProcess()
    }

    this.starting = true
    try {
      await this.spawnAndWait()
    } finally {
      this.starting = false
    }
  }

  /** Gracefully stop the CDP Proxy child process */
  async stop(): Promise<void> {
    if (!this.process || this.process.killed) {
      this.stopping = false
      return
    }
    this.stopping = true
    this.killProcess({ preserveReferenceUntilExit: true })
  }

  /**
   * Ensure the CDP Proxy is running and healthy.
   * Starts on first call; restarts if health check fails.
   */
  async ensureRunning(): Promise<void> {
    const currentStatus = await this.fetchHealth().catch(() => null)

    // Proxy already running and connected
    if (currentStatus?.status === 'ok' && Boolean(currentStatus.connected)) {
      this.restartAttempts = 0
      return
    }

    // Proxy already listening but has not connected to Chrome yet.
    // Trigger a lightweight request so the proxy performs its lazy connect flow.
    if (currentStatus?.status === 'ok') {
      await this.tryWarmConnect()
      if (await this.checkHealth()) {
        this.restartAttempts = 0
        return
      }
    }

    await this.start()
    await this.tryWarmConnect()
  }

  /**
   * Check if CDP Proxy is healthy and connected to Chrome.
   * Returns true only when the proxy is reachable AND connected.
   */
  async checkHealth(): Promise<boolean> {
    try {
      const status = await this.fetchHealth()
      return status.status === 'ok' && Boolean(status.connected)
    } catch {
      return false
    }
  }

  /** Returns whether the proxy is currently available (healthy + connected) */
  async isAvailable(): Promise<boolean> {
    return this.checkHealth()
  }

  async getDiagnostics(): Promise<ProxyDiagnostics> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), WARM_CONNECT_TIMEOUT_MS)

    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/diagnostics`, {
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`Diagnostics returned ${res.status}`)
      return (await res.json()) as ProxyDiagnostics
    } finally {
      clearTimeout(timer)
    }
  }

  getStartupDiagnostics(): StartupDiagnostics {
    return {
      scriptPath: this.startupDiagnostics.scriptPath,
      lastStdout: [...this.startupDiagnostics.lastStdout],
      lastStderr: [...this.startupDiagnostics.lastStderr],
      lastExit: this.startupDiagnostics.lastExit ? { ...this.startupDiagnostics.lastExit } : null,
    }
  }

  // ── Private helpers ──

  private async fetchHealth(): Promise<HealthStatus> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS)

    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/health`, {
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`Health check returned ${res.status}`)
      return (await res.json()) as HealthStatus
    } finally {
      clearTimeout(timer)
    }
  }

  private async tryWarmConnect(): Promise<void> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), WARM_CONNECT_TIMEOUT_MS)

    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/targets`, {
        signal: controller.signal,
      })
      if (!res.ok) {
        throw new Error(`Warm connect returned ${res.status}`)
      }
      await res.text()
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(
          `Timed out waiting for Chrome authorization after ${WARM_CONNECT_TIMEOUT_MS}ms. ` +
          'Keep chrome://inspect/#remote-debugging open and click Allow in Chrome.'
        )
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  private spawnAndWait(): Promise<void> {
    return new Promise((resolve, reject) => {
      const scriptPath = resolveCdpProxyScript()
      this.startupDiagnostics.scriptPath = scriptPath
      this.startupDiagnostics.lastStdout = []
      this.startupDiagnostics.lastStderr = []
      this.startupDiagnostics.lastExit = null

      if (!existsSync(scriptPath)) {
        reject(new Error(`cdp-proxy script not found: ${scriptPath}`))
        return
      }

      const child = fork(scriptPath, [], {
        env: { ...process.env, CDP_PROXY_PORT: String(this.port) },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      })

      this.process = child

      // Forward stdout/stderr with prefix
      child.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().trim()
        if (lines) {
          this.pushLogLine('stdout', lines)
          console.log(`[CdpProxyManager] ${lines}`)
        }
      })
      child.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().trim()
        if (lines) {
          this.pushLogLine('stderr', lines)
          console.error(`[CdpProxyManager] ${lines}`)
        }
      })

      // Handle unexpected exit
      child.on('exit', (code, signal) => {
        this.startupDiagnostics.lastExit = { code, signal }
        console.log(`[CdpProxyManager] Process exited (code=${code}, signal=${signal})`)
        this.process = null
        if (this.stopping) {
          this.stopping = false
          return
        }
        this.maybeAutoRestart()
      })

      child.on('error', (err) => {
        console.error(`[CdpProxyManager] Process error:`, err.message)
        this.process = null
      })

      // Poll for health until healthy or timeout
      const startTime = Date.now()
      const poll = async () => {
        if (Date.now() - startTime > STARTUP_WAIT_MS) {
          reject(new Error(this.buildStartupFailureMessage()))
          return
        }

        try {
          const status = await this.fetchHealth()
          if (status.status === 'ok') {
            // Proxy is listening. It may not be connected to Chrome yet,
            // but that's OK — it will connect on first request.
            console.log(
              `[CdpProxyManager] Proxy is up (connected=${status.connected}, port=${this.port})`
            )
            resolve()
            return
          }
        } catch {
          // Not ready yet, keep polling
        }

        setTimeout(poll, STARTUP_POLL_INTERVAL_MS)
      }

      // Give the process a moment to bind the port
      setTimeout(poll, STARTUP_POLL_INTERVAL_MS)
    })
  }

  private killProcess(options?: { preserveReferenceUntilExit?: boolean }): void {
    if (this.process && !this.process.killed) {
      try {
        this.process.kill('SIGTERM')
      } catch {
        // Process may have already exited
      }
      if (!options?.preserveReferenceUntilExit) {
        this.process = null
      }
    }
  }

  private maybeAutoRestart(): void {
    if (this.starting) return // Already being started

    const now = Date.now()
    if (now - this.lastRestartTime < RESTART_COOLDOWN_MS) return
    if (this.restartAttempts >= MAX_RESTART_ATTEMPTS) {
      console.error(
        `[CdpProxyManager] Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached. ` +
        `Will not auto-restart. Call ensureRunning() to retry manually.`
      )
      return
    }

    this.restartAttempts++
    this.lastRestartTime = now
    console.log(
      `[CdpProxyManager] Auto-restarting (attempt ${this.restartAttempts}/${MAX_RESTART_ATTEMPTS})...`
    )

    this.start().catch((err) => {
      console.error(`[CdpProxyManager] Auto-restart failed:`, err.message)
    })
  }

  private pushLogLine(stream: 'stdout' | 'stderr', text: string): void {
    const key = stream === 'stdout' ? 'lastStdout' : 'lastStderr'
    const current = this.startupDiagnostics[key]
    current.push(...text.split(/\r?\n/).filter(Boolean))
    if (current.length > 20) {
      current.splice(0, current.length - 20)
    }
  }

  private buildStartupFailureMessage(): string {
    const parts = [
      `CDP Proxy failed to become healthy within ${STARTUP_WAIT_MS}ms.`,
      `port=${this.port}`,
    ]

    if (this.startupDiagnostics.scriptPath) {
      parts.push(`script=${this.startupDiagnostics.scriptPath}`)
    }
    if (this.startupDiagnostics.lastExit) {
      parts.push(
        `lastExit(code=${this.startupDiagnostics.lastExit.code}, signal=${this.startupDiagnostics.lastExit.signal})`,
      )
    }
    if (this.startupDiagnostics.lastStderr.length > 0) {
      parts.push(`stderr=${this.startupDiagnostics.lastStderr.slice(-3).join(' | ')}`)
    } else if (this.startupDiagnostics.lastStdout.length > 0) {
      parts.push(`stdout=${this.startupDiagnostics.lastStdout.slice(-3).join(' | ')}`)
    }

    return parts.join(' ')
  }
}

function resolveCdpProxyScript(): string {
  const candidates = [
    join(MODULE_DIR, 'cdp-proxy.cjs'),
    join(MODULE_DIR, 'cdp-proxy.mjs'),
    join(MODULE_DIR, 'web-research', 'browser', 'cdp-proxy.cjs'),
    join(MODULE_DIR, 'web-research', 'browser', 'cdp-proxy.mjs'),
    join(dirname(process.execPath), 'web-research', 'browser', 'cdp-proxy.cjs'),
    join(dirname(process.execPath), 'web-research', 'browser', 'cdp-proxy.mjs'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return candidates[0]
}
