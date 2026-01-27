/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         初始化设置页面                                    ║
 * ║                                                                          ║
 * ║  功能：检查并安装 Claude Code CLI                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect, useRef } from 'react'

const API_BASE = '/api'

interface SetupStatus {
  claudeCode: {
    installed: boolean
    path: string | null
  }
  npm: {
    available: boolean
    version?: string
    error?: string
  }
  ready: boolean
}

interface SetupPageProps {
  onReady: () => void
}

export default function SetupPage({ onReady }: SetupPageProps) {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [installing, setInstalling] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // 自动滚动到日志底部
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // 检查状态
  useEffect(() => {
    checkStatus()
  }, [])

  async function checkStatus() {
    try {
      const res = await fetch(`${API_BASE}/setup/status`)
      const data: SetupStatus = await res.json()
      setStatus(data)

      if (data.ready) {
        // 已就绪，直接进入
        onReady()
      } else if (!data.npm.available) {
        // npm 不可用
        setError(data.npm.error || 'npm 未安装')
      } else if (!data.claudeCode.installed) {
        // 需要安装 Claude Code，自动开始安装
        startInstall()
      }
    } catch (err) {
      setError('无法连接到服务')
    }
  }

  async function startInstall() {
    setInstalling(true)
    setLogs([])
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/setup/install`, { method: 'POST' })

      // 检查是否是 JSON 响应（已安装的情况）
      const contentType = res.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        const data = await res.json()
        if (data.success) {
          setLogs(prev => [...prev, '✅ Claude Code 已安装'])
          setTimeout(onReady, 1000)
        } else {
          setError(data.error)
        }
        setInstalling(false)
        return
      }

      // SSE 流式响应
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        setError('无法读取安装进度')
        setInstalling(false)
        return
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue

          try {
            const event = JSON.parse(line.slice(6))

            if (event.type === 'log') {
              setLogs(prev => [...prev, event.message])
            } else if (event.type === 'done') {
              if (event.success) {
                setLogs(prev => [...prev, '🎉 安装完成！正在进入应用...'])
                setTimeout(onReady, 1500)
              } else {
                setError(event.error)
              }
              setInstalling(false)
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    } catch (err) {
      setError('安装过程出错')
      setInstalling(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        {/* Logo 和标题 */}
        <div className="text-center space-y-2">
          <div className="text-5xl">🤖</div>
          <h1 className="text-2xl font-bold text-foreground">LaborAny</h1>
          <p className="text-muted-foreground">AI 驱动的自动化工作平台</p>
        </div>

        {/* 状态卡片 */}
        <div className="bg-card rounded-lg border border-border p-6 space-y-4">
          {!status && !error && (
            <div className="flex items-center justify-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
              <span className="text-muted-foreground">正在检查环境...</span>
            </div>
          )}

          {error && (
            <div className="space-y-4">
              <div className="bg-red-500/10 text-red-600 border border-red-500/20 rounded-lg p-4">
                <p className="font-medium">❌ 初始化失败</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
              {error.includes('npm') && (
                <div className="text-sm text-muted-foreground">
                  <p>请先安装 Node.js：</p>
                  <a
                    href="https://nodejs.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    https://nodejs.org/
                  </a>
                </div>
              )}
              <button
                onClick={checkStatus}
                className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                重试
              </button>
            </div>
          )}

          {installing && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
                <span className="text-foreground font-medium">正在安装 Claude Code CLI...</span>
              </div>

              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
                <p>💡 这是首次运行需要的一次性安装，请耐心等待。</p>
                <p className="mt-1">安装完成后，以后打开应用将直接进入。</p>
              </div>

              {/* 安装日志 */}
              <div className="bg-black/90 rounded-lg p-3 h-48 overflow-y-auto font-mono text-xs">
                {logs.map((log, i) => (
                  <div key={i} className="text-green-400 whitespace-pre-wrap break-all">
                    {log}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}

          {status?.ready && (
            <div className="flex items-center justify-center gap-3 text-green-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-medium">环境就绪，正在进入...</span>
            </div>
          )}
        </div>

        {/* 底部信息 */}
        <p className="text-center text-xs text-muted-foreground">
          Powered by Claude Code CLI
        </p>
      </div>
    </div>
  )
}
