/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         设置页面                                          ║
 * ║                                                                          ║
 * ║  功能：配置 API 密钥等环境变量                                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import { API_BASE, AGENT_API_BASE } from '../config/api'

interface ConfigItem {
  value: string
  masked: string
}

interface ConfigTemplate {
  description: string
  required: boolean
  placeholder: string
  sensitive: boolean
}

export default function SettingsPage() {
  const [config, setConfig] = useState<Record<string, ConfigItem>>({})
  const [template, setTemplate] = useState<Record<string, ConfigTemplate>>({})
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [configPath, setConfigPath] = useState('')
  const [profilePath, setProfilePath] = useState('')
  const [logsPath, setLogsPath] = useState('')
  const [logsFallbackActive, setLogsFallbackActive] = useState(false)
  const [logsFallbackReason, setLogsFallbackReason] = useState('')
  const [migrationReportPath, setMigrationReportPath] = useState('')
  const [exportingLogs, setExportingLogs] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showValues, setShowValues] = useState<Record<string, boolean>>({})

  useEffect(() => {
    loadConfig()
    loadTemplate()
  }, [])

  async function loadConfig() {
    try {
      const res = await fetch(`${API_BASE}/config`)
      const data = await res.json()
      setConfig(data.config || {})
      setConfigPath(data.envPath || '')
      setProfilePath(data.profilePath || '')
      setLogsPath(data.logsDir || '')
      setLogsFallbackActive(Boolean(data.logsFallbackActive))
      setLogsFallbackReason(data.logsFallbackReason || '')
      setMigrationReportPath(data.migrationReportPath || '')
      setProfileName(data.profile?.name || '')

      const values: Record<string, string> = {}
      for (const [key, item] of Object.entries(data.config || {})) {
        values[key] = (item as ConfigItem).value
      }
      setEditValues(values)
    } catch (err) {
      setMessage({ type: 'error', text: '加载配置失败' })
    } finally {
      setLoading(false)
    }
  }

  async function loadTemplate() {
    try {
      const res = await fetch(`${API_BASE}/config/template`)
      const data = await res.json()
      setTemplate(data.template || {})
    } catch {
      // 忽略模板加载失败
    }
  }

  async function saveConfig() {
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: editValues,
          profileName: profileName.trim(),
        })
      })

      const data = await res.json()

      if (res.ok) {
        setMessage({ type: 'success', text: data.message || '配置已保存' })
        if (data.profile?.name) {
          localStorage.setItem('laborany.profile.name', data.profile.name)
        } else if (profileName.trim()) {
          localStorage.setItem('laborany.profile.name', profileName.trim())
        }
        loadConfig()
      } else {
        setMessage({ type: 'error', text: data.error || '保存失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '保存配置失败' })
    } finally {
      setSaving(false)
    }
  }

  function handleChange(key: string, value: string) {
    setEditValues(prev => ({ ...prev, [key]: value }))
  }

  async function exportLogs() {
    setExportingLogs(true)
    setMessage(null)

    try {
      const response = await fetch(`${API_BASE}/logs/export`)
      if (!response.ok) {
        throw new Error('导出失败')
      }

      const blob = await response.blob()
      const contentDisposition = response.headers.get('content-disposition') || ''
      const matchedFileName = contentDisposition.match(/filename="([^"]+)"/)
      const filename = matchedFileName?.[1] || `laborany-logs-${Date.now()}.zip`

      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)

      setMessage({ type: 'success', text: '诊断日志已导出' })
    } catch {
      setMessage({ type: 'error', text: '日志导出失败' })
    } finally {
      setExportingLogs(false)
    }
  }

  function toggleShowValue(key: string) {
    setShowValues(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // 合并模板和现有配置的键
  const allKeys = new Set([...Object.keys(template), ...Object.keys(config)])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部标题栏 */}
      <header className="h-14 border-b border-border bg-card flex items-center px-6">
        <h1 className="text-lg font-semibold text-foreground">设置</h1>
      </header>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* 配置文件路径 */}
        {configPath && (
          <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">
              配置文件位置：<code className="bg-background px-2 py-0.5 rounded text-xs">{configPath}</code>
            </p>
            {profilePath && (
              <p className="text-sm text-muted-foreground mt-2">
                Profile 位置：<code className="bg-background px-2 py-0.5 rounded text-xs">{profilePath}</code>
              </p>
            )}
            {logsPath && (
              <p className="text-sm text-muted-foreground mt-2">
                日志目录：<code className="bg-background px-2 py-0.5 rounded text-xs">{logsPath}</code>
              </p>
            )}
            {migrationReportPath && (
              <p className="text-sm text-muted-foreground mt-2">
                迁移报告：<code className="bg-background px-2 py-0.5 rounded text-xs">{migrationReportPath}</code>
              </p>
            )}
            {logsFallbackActive && logsFallbackReason && (
              <p className="text-xs text-amber-600 mt-2">
                日志目录降级：{logsFallbackReason}
              </p>
            )}
            <div className="mt-3">
              <button
                onClick={exportLogs}
                disabled={exportingLogs}
                className="px-3 py-1.5 bg-background border border-border rounded text-sm hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportingLogs ? '导出中...' : '导出诊断日志 (.zip)'}
              </button>
            </div>
          </div>
        )}

        <div className="bg-card rounded-lg border border-border p-4 space-y-2">
          <label className="block text-sm font-medium text-foreground">
            本地名称
          </label>
          <input
            type="text"
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            placeholder="例如：Nathan"
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <p className="text-xs text-muted-foreground">
            用于本地模式显示昵称，不再需要邮箱注册。
          </p>
        </div>

        {/* 消息提示 */}
        {message && (
          <div className={`p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-500/10 text-green-600 border border-green-500/20'
              : 'bg-red-500/10 text-red-600 border border-red-500/20'
          }`}>
            {message.text}
          </div>
        )}

        {/* 邮箱配置帮助卡片 */}
        <EmailConfigHelp />

        {/* 配置项列表 */}
        <div className="bg-card rounded-lg border border-border divide-y divide-border">
          {Array.from(allKeys).map(key => {
            const tmpl = template[key]
            const isSensitive = tmpl?.sensitive ||
              key.toLowerCase().includes('key') ||
              key.toLowerCase().includes('secret')

            return (
              <div key={key} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-foreground mb-1">
                      {key}
                      {tmpl?.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {tmpl?.description && (
                      <p className="text-xs text-muted-foreground mb-2">{tmpl.description}</p>
                    )}
                    <div className="relative">
                      <input
                        type={isSensitive && !showValues[key] ? 'password' : 'text'}
                        value={editValues[key] || ''}
                        onChange={(e) => handleChange(key, e.target.value)}
                        placeholder={tmpl?.placeholder || ''}
                        className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 pr-10"
                      />
                      {isSensitive && (
                        <button
                          type="button"
                          onClick={() => toggleShowValue(key)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                        >
                          {showValues[key] ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* 添加自定义配置 */}
          <div className="p-4">
            <AddConfigItem onAdd={(key) => {
              setEditValues(prev => ({ ...prev, [key]: '' }))
            }} existingKeys={allKeys} />
          </div>
        </div>

        {/* 保存按钮 */}
        <div className="flex justify-end">
          <button
            onClick={saveConfig}
            disabled={saving}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
            )}
            保存配置
          </button>
        </div>

        {/* 说明 */}
        <div className="text-sm text-muted-foreground space-y-2">
          <p>* 标记的配置项为必填项</p>
          <p>部分配置修改后可能需要重启应用才能生效</p>
        </div>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       邮箱配置帮助组件                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function EmailConfigHelp() {
  const [expanded, setExpanded] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  async function handleTestEmail() {
    setTesting(true)
    setTestResult(null)

    try {
      // 使用 agent-service 的 API
      const res = await fetch(`${AGENT_API_BASE}/notifications/test-email`, {
        method: 'POST',
      })
      const data = await res.json()

      if (data.success) {
        setTestResult({ success: true, message: '测试邮件已发送，请检查收件箱！' })
      } else {
        setTestResult({ success: false, message: data.error || '发送失败' })
      }
    } catch (err) {
      setTestResult({ success: false, message: '无法连接到服务，请确保 Agent Service 正在运行' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-blue-600 dark:text-blue-400">📧</span>
          <span className="font-medium text-blue-900 dark:text-blue-100">邮箱通知配置指南</span>
        </div>
        <svg
          className={`w-5 h-5 text-blue-600 dark:text-blue-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 text-sm">
          {/* QQ 邮箱 */}
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-blue-100 dark:border-blue-900">
            <h4 className="font-medium text-foreground mb-2">QQ 邮箱配置</h4>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs">
              <li>登录 <a href="https://mail.qq.com" target="_blank" rel="noopener" className="text-primary hover:underline">QQ 邮箱网页版</a></li>
              <li>点击「设置」→「账户」</li>
              <li>找到「POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV服务」</li>
              <li>开启「SMTP 服务」，按提示发短信获取<strong className="text-foreground">授权码</strong></li>
            </ol>
            <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono">
              <div>SMTP_HOST = <span className="text-green-600 dark:text-green-400">smtp.qq.com</span></div>
              <div>SMTP_PORT = <span className="text-green-600 dark:text-green-400">465</span></div>
              <div>SMTP_USER = <span className="text-green-600 dark:text-green-400">你的QQ号@qq.com</span></div>
              <div>SMTP_PASS = <span className="text-green-600 dark:text-green-400">16位授权码</span></div>
            </div>
          </div>

          {/* 163 邮箱 */}
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-blue-100 dark:border-blue-900">
            <h4 className="font-medium text-foreground mb-2">163 邮箱配置</h4>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs">
              <li>登录 <a href="https://mail.163.com" target="_blank" rel="noopener" className="text-primary hover:underline">163 邮箱网页版</a></li>
              <li>点击「设置」→「POP3/SMTP/IMAP」</li>
              <li>开启「SMTP 服务」</li>
              <li>设置<strong className="text-foreground">客户端授权密码</strong></li>
            </ol>
            <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono">
              <div>SMTP_HOST = <span className="text-green-600 dark:text-green-400">smtp.163.com</span></div>
              <div>SMTP_PORT = <span className="text-green-600 dark:text-green-400">465</span></div>
              <div>SMTP_USER = <span className="text-green-600 dark:text-green-400">你的邮箱@163.com</span></div>
              <div>SMTP_PASS = <span className="text-green-600 dark:text-green-400">授权密码</span></div>
            </div>
          </div>

          {/* 重要提示 */}
          <div className="flex items-start gap-2 p-2 bg-yellow-50 dark:bg-yellow-950/30 rounded border border-yellow-200 dark:border-yellow-800">
            <span className="text-yellow-600">⚠️</span>
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              <strong>重要：</strong>SMTP_PASS 填写的是<strong>授权码</strong>，不是邮箱登录密码！授权码需要在邮箱设置中单独获取。
            </p>
          </div>

          {/* 测试邮件按钮 */}
          <div className="pt-2 border-t border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-3">
              <button
                onClick={handleTestEmail}
                disabled={testing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {testing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    发送中...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    发送测试邮件
                  </>
                )}
              </button>
              <span className="text-xs text-muted-foreground">
                配置完成后，点击发送测试邮件验证配置是否正确
              </span>
            </div>

            {/* 测试结果 */}
            {testResult && (
              <div className={`mt-3 p-3 rounded-lg text-sm ${
                testResult.success
                  ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
              }`}>
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <span>{testResult.message}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       添加自定义配置项组件                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function AddConfigItem({
  onAdd,
  existingKeys
}: {
  onAdd: (key: string) => void
  existingKeys: Set<string>
}) {
  const [isAdding, setIsAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [error, setError] = useState('')

  function handleAdd() {
    const key = newKey.trim().toUpperCase()
    if (!key) {
      setError('请输入配置名称')
      return
    }
    if (existingKeys.has(key)) {
      setError('该配置项已存在')
      return
    }
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      setError('配置名称只能包含大写字母、数字和下划线')
      return
    }

    onAdd(key)
    setNewKey('')
    setIsAdding(false)
    setError('')
  }

  if (!isAdding) {
    return (
      <button
        onClick={() => setIsAdding(true)}
        className="text-sm text-primary hover:text-primary/80 flex items-center gap-1"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        添加自定义配置
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={newKey}
          onChange={(e) => {
            setNewKey(e.target.value.toUpperCase())
            setError('')
          }}
          placeholder="配置名称（如 MY_CONFIG）"
          className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          autoFocus
        />
        <button
          onClick={handleAdd}
          className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
        >
          添加
        </button>
        <button
          onClick={() => {
            setIsAdding(false)
            setNewKey('')
            setError('')
          }}
          className="px-3 py-2 bg-muted text-muted-foreground rounded-md text-sm hover:bg-muted/80"
        >
          取消
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
