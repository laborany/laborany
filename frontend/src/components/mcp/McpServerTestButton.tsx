/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    MCP 测试连接按钮                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState } from 'react'
import { API_BASE } from '../../config/api'
import type { McpTestResult } from './types'

export function McpServerTestButton({ serverName }: { serverName: string }) {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<McpTestResult | null>(null)

  async function handleTest() {
    setTesting(true)
    setResult(null)
    try {
      const res = await fetch(`${API_BASE}/mcp/${encodeURIComponent(serverName)}/test`, {
        method: 'POST',
      })
      const data = await res.json() as McpTestResult
      setResult(data)
    } catch {
      setResult({ success: false, message: '请求失败' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={handleTest}
        disabled={testing}
        className="rounded px-2 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {testing ? '测试中...' : '测试'}
      </button>
      {result && (
        <span className={`text-xs ${result.success ? 'text-green-700' : 'text-red-600'}`}>
          {result.message}
        </span>
      )}
    </span>
  )
}
