/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         初始化设置页面                                    ║
 * ║                                                                          ║
 * ║  功能：检查并安装 Node.js 和 Claude Code CLI                              ║
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

type SetupStep = 'checking' | 'need-nodejs' | 'installing-nodejs' | 'installing-claude' | 'done' | 'error'

export default function SetupPage({ onReady }: SetupPageProps) {
  const [step, setStep] = useState<SetupStep>('checking')
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [needRestart, setNeedRestart] = useState(false)
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
    setStep('checking')
    setLogs([])
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/setup/status`)
      const data: SetupStatus = await res.json()

      if (data.ready) {
        // 已就绪，直接进入
        onReady()
        return
      }

      if (!data.npm.available) {
        // 需要安装 Node.js
        setStep('need-nodejs')
        // 自动开始安装 Node.js
        setTimeout(() => installNodejs(), 500)
      } else if (!data.claudeCode.installed) {
        // 需要安装 Claude Code
        setStep('installing-claude')
        installClaudeCode()
      }
    } catch (err) {
      setError('无法连接到服务，请稍后重试')
      setStep('error')
    }
  }

  async function installNodejs() {
    setStep('installing-nodejs')
    setLogs(['🔍 检测到系统未安装 Node.js'])
    setLogs(prev => [...prev, '📥 正在下载 Node.js 安装程序...'])

    try {
      const res = await fetch(`${API_BASE}/setup/install-nodejs`, { method: 'POST' })

      // 检查是否是 JSON 响应
      const contentType = res.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        const data = await res.json()
        if (!data.success) {
          setError(data.error)
          setStep('error')
        }
        return
      }

      // SSE 流式响应
      await handleSSEResponse(res, () => {
        setNeedRestart(true)
        setStep('done')
      })
    } catch (err) {
      setError('Node.js 安装失败')
      setStep('error')
    }
  }

  async function installClaudeCode() {
    setStep('installing-claude')
    setLogs([])

    try {
      const res = await fetch(`${API_BASE}/setup/install`, { method: 'POST' })

      // 检查是否是 JSON 响应
      const contentType = res.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        const data = await res.json()
        if (data.success) {
          setLogs(prev => [...prev, '✅ Claude Code 已安装'])
          setTimeout(onReady, 1000)
        } else if (data.needsNodejs) {
          // 需要先安装 Node.js
          setStep('need-nodejs')
          setTimeout(() => installNodejs(), 500)
        } else {
          setError(data.error)
          setStep('error')
        }
        return
      }

      // SSE 流式响应
      await handleSSEResponse(res, () => {
        setLogs(prev => [...prev, '🎉 安装完成！正在进入应用...'])
        setTimeout(onReady, 1500)
      })
    } catch (err) {
      setError('Claude Code 安装失败')
      setStep('error')
    }
  }

  async function handleSSEResponse(res: Response, onSuccess: () => void) {
    const reader = res.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) {
      setError('无法读取安装进度')
      setStep('error')
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
              onSuccess()
            } else {
              setError(event.error)
              setStep('error')
            }
          }
        } catch {
          // 忽略解析错误
        }
      }
    }
  }

  function getStepTitle(): string {
    switch (step) {
      case 'checking': return '正在检查环境...'
      case 'need-nodejs': return '准备安装 Node.js...'
      case 'installing-nodejs': return '正在安装 Node.js...'
      case 'installing-claude': return '正在安装 Claude Code CLI...'
      case 'done': return '安装完成'
      case 'error': return '初始化失败'
      default: return '初始化中...'
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
          {/* 步骤标题 */}
          <div className="flex items-center gap-3">
            {step !== 'error' && step !== 'done' && (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
            )}
            {step === 'done' && (
              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {step === 'error' && (
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span className={`font-medium ${step === 'error' ? 'text-red-500' : 'text-foreground'}`}>
              {getStepTitle()}
            </span>
          </div>

          {/* 错误信息 */}
          {error && (
            <div className="bg-red-500/10 text-red-600 border border-red-500/20 rounded-lg p-4">
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* 提示信息 */}
          {(step === 'installing-nodejs' || step === 'installing-claude') && (
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              <p>💡 这是首次运行需要的一次性安装，请耐心等待。</p>
              <p className="mt-1">安装完成后，以后打开应用将直接进入。</p>
              {step === 'installing-nodejs' && (
                <p className="mt-1 text-yellow-600">⚠️ 安装 Node.js 可能需要管理员权限</p>
              )}
            </div>
          )}

          {/* 安装日志 */}
          {logs.length > 0 && (
            <div className="bg-black/90 rounded-lg p-3 h-56 overflow-y-auto font-mono text-xs">
              {logs.map((log, i) => (
                <div key={i} className="text-green-400 whitespace-pre-wrap break-all py-0.5">
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}

          {/* 需要重启提示 */}
          {needRestart && (
            <div className="bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 rounded-lg p-4">
              <p className="font-medium">⚠️ 需要重启应用</p>
              <p className="text-sm mt-1">Node.js 已安装完成，请关闭并重新打开应用以继续。</p>
            </div>
          )}

          {/* 重试按钮 */}
          {step === 'error' && (
            <button
              onClick={checkStatus}
              className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              重试
            </button>
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
