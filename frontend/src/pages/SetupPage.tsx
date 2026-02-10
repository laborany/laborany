/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         初始化设置页面                                    ║
 * ║                                                                          ║
 * ║  功能：检查并安装 Node.js 和 Claude Code CLI                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect, useRef } from 'react'
import { API_BASE } from '../config'
import { LaborAnyLogo } from '../components/ui/LaborAnyLogo'

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
          <div className="flex justify-center mb-2">
            <LaborAnyLogo size={56} />
          </div>
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
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-red-600">❌ 出现问题</p>
              <p className="text-sm text-red-500">{error}</p>
              <p className="text-xs text-muted-foreground mt-2">
                如果问题持续出现，请联系技术支持或尝试手动安装 Node.js：
                <a
                  href="https://nodejs.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline ml-1"
                >
                  https://nodejs.org/
                </a>
              </p>
            </div>
          )}

          {/* 提示信息 - 首次安装说明 */}
          {(step === 'installing-nodejs' || step === 'installing-claude') && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-blue-600">📦 首次运行需要安装必要组件</p>
              <p className="text-xs text-muted-foreground">
                这是一次性的自动安装过程，完成后以后打开应用将直接进入。
              </p>
              {step === 'installing-nodejs' && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mt-2">
                  <p className="text-sm font-medium text-yellow-700">⚠️ 重要提示</p>
                  <ul className="text-xs text-yellow-600 mt-1 space-y-1 list-disc list-inside">
                    <li>安装过程中可能会弹出「用户账户控制」窗口</li>
                    <li>请点击「是」允许安装（这是正常的系统安全提示）</li>
                    <li>安装完成后需要重启应用才能生效</li>
                  </ul>
                </div>
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
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="font-medium text-green-600">Node.js 安装成功！</p>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                <p className="text-sm font-medium text-yellow-700">🔄 请重启应用</p>
                <p className="text-xs text-yellow-600 mt-1">
                  为了让新安装的组件生效，请关闭此窗口，然后重新打开 LaborAny。
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  （就像安装新软件后有时需要重启电脑一样，这里只需要重启应用即可）
                </p>
              </div>
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
