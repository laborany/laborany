/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         API 配置                                         ║
 * ║                                                                          ║
 * ║  统一管理 API 相关配置，消除硬编码                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/// <reference types="vite/client" />

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           API 基础路径                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const API_BASE = import.meta.env.VITE_API_BASE || '/api'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Agent Service API 基础路径                      │
 * │  直接访问 agent-service，用于 cron 等功能                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const AGENT_API_BASE = import.meta.env.VITE_AGENT_API_BASE || 'http://localhost:3002'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           错误解析工具                                    │
 * │  统一处理后端返回的 error 和 detail 字段                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function parseErrorMessage(data: unknown, fallback = '请求失败'): string {
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>
    if (typeof obj.detail === 'string') return obj.detail
    if (typeof obj.error === 'string') return obj.error
    if (typeof obj.message === 'string') return obj.message
  }
  return fallback
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           请求日志工具                                    │
 * │  开发环境下记录 API 请求和响应                                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const isDev = import.meta.env.DEV

export function logRequest(method: string, url: string, body?: unknown): void {
  if (!isDev) return
  console.log(`[API] ${method} ${url}`, body ? { body } : '')
}

export function logResponse(method: string, url: string, status: number, data?: unknown): void {
  if (!isDev) return
  const emoji = status >= 200 && status < 300 ? '✓' : '✗'
  console.log(`[API] ${emoji} ${method} ${url} → ${status}`, data ? { data } : '')
}

export function logError(method: string, url: string, error: unknown): void {
  if (!isDev) return
  console.error(`[API] ✗ ${method} ${url}`, error)
}
