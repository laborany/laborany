/**
 * Tab Manager
 *
 * Manages browser tabs created by the Web Research Runtime.
 * Only tracks tabs that _this_ runtime creates — never lists or touches
 * user-owned tabs.
 *
 * All operations go through the CDP Proxy HTTP API at localhost:PORT.
 */

const DEFAULT_PORT = 3456
const DEFAULT_TAB_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const REQUEST_TIMEOUT_MS = 30_000

interface TabRecord {
  targetId: string
  createdAt: number
  timer: ReturnType<typeof setTimeout>
}

export class TabManager {
  private tabs = new Map<string, TabRecord>()
  private port: number
  private defaultTimeoutMs: number

  constructor(options?: { port?: number; defaultTimeoutMs?: number }) {
    this.port = options?.port ?? DEFAULT_PORT
    this.defaultTimeoutMs = options?.defaultTimeoutMs ?? DEFAULT_TAB_TIMEOUT_MS
  }

  /**
   * Create a new background tab and navigate to the given URL.
   * Returns the CDP targetId.
   */
  async createTab(url: string, timeoutMs?: number): Promise<string> {
    const encodedUrl = encodeURIComponent(url)
    const data = await this.request<{ targetId: string }>(
      `/new?url=${encodedUrl}`,
      'GET',
    )

    const targetId = data.targetId
    if (!targetId) {
      throw new Error('CDP Proxy /new did not return a targetId')
    }

    // Register with auto-reclaim timer
    const ttl = timeoutMs ?? this.defaultTimeoutMs
    const timer = setTimeout(() => {
      console.log(`[TabManager] Tab ${targetId} timed out after ${ttl}ms, auto-closing`)
      this.closeTab(targetId).catch((err) => {
        console.error(`[TabManager] Failed to auto-close tab ${targetId}:`, err.message)
      })
    }, ttl)

    // Prevent the timer from keeping the Node.js process alive
    if (timer.unref) timer.unref()

    this.tabs.set(targetId, { targetId, createdAt: Date.now(), timer })
    return targetId
  }

  /** Close a single tab and remove it from tracking */
  async closeTab(targetId: string): Promise<void> {
    try {
      await this.request(`/close?target=${encodeURIComponent(targetId)}`, 'GET')
    } catch (err) {
      // If the tab was already closed externally, just clean up our record
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes('not found') && !message.includes('No target')) {
        throw err
      }
    } finally {
      this.removeRecord(targetId)
    }
  }

  /** Close all tabs created by this runtime */
  async closeAllTabs(): Promise<void> {
    const ids = Array.from(this.tabs.keys())
    const results = await Promise.allSettled(
      ids.map((id) => this.closeTab(id)),
    )

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('[TabManager] Error closing tab:', result.reason)
      }
    }
  }

  /** Return the number of currently tracked tabs */
  getActiveTabCount(): number {
    return this.tabs.size
  }

  /** Navigate an existing tab to a new URL */
  async navigateTab(targetId: string, url: string): Promise<void> {
    this.assertTracked(targetId)
    await this.request(
      `/navigate?target=${encodeURIComponent(targetId)}&url=${encodeURIComponent(url)}`,
      'GET',
    )
  }

  /** Evaluate a JavaScript expression in a tab and return the result */
  async evalInTab(targetId: string, expression: string): Promise<unknown> {
    this.assertTracked(targetId)
    const data = await this.request<{ value?: unknown; error?: string }>(
      `/eval?target=${encodeURIComponent(targetId)}`,
      'POST',
      expression,
    )

    if (data.error) {
      throw new Error(`eval error: ${data.error}`)
    }
    return data.value
  }

  /** Take a screenshot of a tab and save to filePath. Returns the saved path. */
  async screenshotTab(targetId: string, filePath: string): Promise<string> {
    this.assertTracked(targetId)
    const data = await this.request<{ saved?: string }>(
      `/screenshot?target=${encodeURIComponent(targetId)}&file=${encodeURIComponent(filePath)}`,
      'GET',
    )
    return data.saved ?? filePath
  }

  /** Scroll a tab in the given direction (down | up | top | bottom) */
  async scrollTab(targetId: string, direction: string): Promise<void> {
    this.assertTracked(targetId)
    await this.request(
      `/scroll?target=${encodeURIComponent(targetId)}&direction=${encodeURIComponent(direction)}`,
      'GET',
    )
  }

  /** Click an element in a tab by CSS selector */
  async clickInTab(targetId: string, selector: string): Promise<{ clicked: boolean; tag?: string; text?: string }> {
    this.assertTracked(targetId)
    const data = await this.request<{ clicked: boolean; tag?: string; text?: string; error?: string }>(
      `/click?target=${encodeURIComponent(targetId)}`,
      'POST',
      selector,
    )
    if (data.error) {
      throw new Error(`click error: ${data.error}`)
    }
    return { clicked: data.clicked, tag: data.tag, text: data.text }
  }

  // ── Private helpers ──

  private assertTracked(targetId: string): void {
    if (!this.tabs.has(targetId)) {
      throw new Error(
        `Tab ${targetId} is not managed by this TabManager. ` +
        `Only tabs created via createTab() can be operated on.`
      )
    }
  }

  private removeRecord(targetId: string): void {
    const record = this.tabs.get(targetId)
    if (record) {
      clearTimeout(record.timer)
      this.tabs.delete(targetId)
    }
  }

  private async request<T = Record<string, unknown>>(
    path: string,
    method: 'GET' | 'POST',
    body?: string,
  ): Promise<T> {
    const url = `http://127.0.0.1:${this.port}${path}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const res = await fetch(url, {
        method,
        body: method === 'POST' ? body : undefined,
        headers: method === 'POST' ? { 'Content-Type': 'text/plain' } : undefined,
        signal: controller.signal,
      })

      const text = await res.text()
      let data: T
      try {
        data = JSON.parse(text) as T
      } catch {
        throw new Error(`CDP Proxy returned non-JSON response: ${text.slice(0, 200)}`)
      }

      if (!res.ok) {
        const errorMsg = (data as Record<string, unknown>)?.error ?? text.slice(0, 200)
        throw new Error(`CDP Proxy ${method} ${path} returned ${res.status}: ${errorMsg}`)
      }

      return data
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`CDP Proxy request timed out: ${method} ${path}`)
      }
      // Wrap connection errors with a clearer message
      if (err instanceof TypeError) {
        throw new Error(
          `CDP Proxy is not reachable at http://127.0.0.1:${this.port}. ` +
          `Ensure the proxy is running (call CdpProxyManager.ensureRunning() first).`
        )
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
}
