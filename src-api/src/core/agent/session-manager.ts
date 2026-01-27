/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         会话管理器                                        ║
 * ║                                                                          ║
 * ║  职责：管理活跃会话，支持中止正在执行的 Agent                               ║
 * ║  设计：使用 AbortController 实现优雅中止                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           会话信息                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface SessionInfo {
  controller: AbortController
  createdAt: Date
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                         会话管理器类                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class SessionManager {
  private sessions = new Map<string, SessionInfo>()

  register(sessionId: string, controller: AbortController): void {
    this.sessions.set(sessionId, {
      controller,
      createdAt: new Date(),
    })
  }

  unregister(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  abort(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    session.controller.abort()
    this.sessions.delete(sessionId)
    return true
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  get activeCount(): number {
    return this.sessions.size
  }

  cleanup(maxAgeMs = 30 * 60 * 1000): number {
    const now = Date.now()
    let cleaned = 0

    for (const [id, info] of this.sessions) {
      if (now - info.createdAt.getTime() > maxAgeMs) {
        info.controller.abort()
        this.sessions.delete(id)
        cleaned++
      }
    }
    return cleaned
  }
}

// 全局单例
export const sessionManager = new SessionManager()
