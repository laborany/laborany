import { useEffect, useMemo, useState } from 'react'
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

interface ConfigResponse {
  config?: Record<string, ConfigItem>
  envPath?: string
  profilePath?: string
  logsDir?: string
  logsFallbackActive?: boolean
  logsFallbackReason?: string
  migrationReportPath?: string
  profile?: { name?: string }
}

interface SaveConfigResponse {
  success?: boolean
  message?: string
  error?: string
  profile?: { name?: string }
  applied?: boolean
  applyError?: string | null
}

interface ApplyRuntimeResponse {
  success?: boolean
  summary?: string
  error?: string
}

type BannerType = 'success' | 'error' | 'warning'

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
  const [profileName, setProfileName] = useState('')
  const [showValues, setShowValues] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exportingLogs, setExportingLogs] = useState(false)
  const [retryingApply, setRetryingApply] = useState(false)
  const [message, setMessage] = useState<{ type: BannerType; text: string } | null>(null)

  useEffect(() => {
    void loadConfig()
    void loadTemplate()
  }, [])

  async function loadConfig() {
    try {
      const res = await fetch(`${API_BASE}/config`)
      const data = await res.json() as ConfigResponse
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
        values[key] = item.value
      }
      setEditValues(values)
    } catch {
      setMessage({ type: 'error', text: '加载配置失败' })
    } finally {
      setLoading(false)
    }
  }

  async function loadTemplate() {
    try {
      const res = await fetch(`${API_BASE}/config/template`)
      const data = await res.json() as { template?: Record<string, ConfigTemplate> }
      setTemplate(data.template || {})
    } catch {
      // ignore template failures
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
        }),
      })
      const data = await res.json() as SaveConfigResponse

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '保存失败' })
        return
      }

      if (data.applied === false) {
        setMessage({
          type: 'warning',
          text: data.message || `配置已保存，但自动应用失败：${data.applyError || ''}`,
        })
      } else {
        setMessage({ type: 'success', text: data.message || '配置已保存并生效' })
      }

      if (data.profile?.name) {
        localStorage.setItem('laborany.profile.name', data.profile.name)
      } else if (profileName.trim()) {
        localStorage.setItem('laborany.profile.name', profileName.trim())
      }
      void loadConfig()
    } catch {
      setMessage({ type: 'error', text: '保存配置失败' })
    } finally {
      setSaving(false)
    }
  }

  async function retryApplyConfig() {
    setRetryingApply(true)
    setMessage(null)

    try {
      const res = await fetch(`${AGENT_API_BASE}/runtime/apply-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'manual-retry',
          force: true,
        }),
      })
      const data = await res.json() as ApplyRuntimeResponse

      if (res.ok && data.success) {
        setMessage({ type: 'success', text: data.summary || '配置重新应用成功' })
      } else {
        setMessage({
          type: 'warning',
          text: data.error || data.summary || '配置已保存，但重新应用仍失败',
        })
      }
    } catch {
      setMessage({ type: 'error', text: '无法重新应用配置，请检查 Agent Service 是否运行' })
    } finally {
      setRetryingApply(false)
    }
  }

  async function exportLogs() {
    setExportingLogs(true)
    setMessage(null)

    try {
      const response = await fetch(`${API_BASE}/logs/export`)
      if (!response.ok) throw new Error('export failed')

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

  function handleChange(key: string, value: string) {
    setEditValues(prev => ({ ...prev, [key]: value }))
  }

  function toggleShowValue(key: string) {
    setShowValues(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const allKeys = useMemo(() => {
    return new Set([...Object.keys(template), ...Object.keys(config), ...Object.keys(editValues)])
  }, [template, config, editValues])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b border-border bg-card flex items-center px-6">
        <h1 className="text-lg font-semibold text-foreground">设置</h1>
      </header>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {configPath && (
          <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">
              配置文件位置: <code className="bg-background px-2 py-0.5 rounded text-xs">{configPath}</code>
            </p>
            {profilePath && (
              <p className="text-sm text-muted-foreground mt-2">
                Profile 位置: <code className="bg-background px-2 py-0.5 rounded text-xs">{profilePath}</code>
              </p>
            )}
            {logsPath && (
              <p className="text-sm text-muted-foreground mt-2">
                日志目录: <code className="bg-background px-2 py-0.5 rounded text-xs">{logsPath}</code>
              </p>
            )}
            {migrationReportPath && (
              <p className="text-sm text-muted-foreground mt-2">
                迁移报告: <code className="bg-background px-2 py-0.5 rounded text-xs">{migrationReportPath}</code>
              </p>
            )}
            {logsFallbackActive && logsFallbackReason && (
              <p className="text-xs text-amber-600 mt-2">日志目录降级: {logsFallbackReason}</p>
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
          <label className="block text-sm font-medium text-foreground">本地名称</label>
          <input
            type="text"
            value={profileName}
            onChange={event => setProfileName(event.target.value)}
            placeholder="例如: Nathan"
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <p className="text-xs text-muted-foreground">
            用于本地模式显示昵称，不需要邮箱注册。
          </p>
        </div>

        {message && (
          <div className={`p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-500/10 text-green-600 border border-green-500/20'
              : message.type === 'warning'
                ? 'bg-amber-500/10 text-amber-700 border border-amber-500/20'
                : 'bg-red-500/10 text-red-600 border border-red-500/20'
          }`}
          >
            <div className="space-y-2">
              <p>{message.text}</p>
              {message.type === 'warning' && (
                <button
                  onClick={retryApplyConfig}
                  disabled={retryingApply}
                  className="px-3 py-1.5 bg-background border border-border rounded text-xs hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {retryingApply ? '重试中...' : '重试应用配置'}
                </button>
              )}
            </div>
          </div>
        )}

        <EmailConfigHelp />
        <FeishuConfigHelp />

        <div className="bg-card rounded-lg border border-border divide-y divide-border">
          {Array.from(allKeys).map(key => {
            const tmpl = template[key]
            const isSensitive = Boolean(
              tmpl?.sensitive || key.toLowerCase().includes('key') || key.toLowerCase().includes('secret'),
            )
            return (
              <div key={key} className="p-4">
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
                    onChange={e => handleChange(key, e.target.value)}
                    placeholder={tmpl?.placeholder || ''}
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 pr-10"
                  />
                  {isSensitive && (
                    <button
                      type="button"
                      onClick={() => toggleShowValue(key)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                    >
                      {showValues[key] ? 'Hide' : 'Show'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          <div className="p-4">
            <AddConfigItem
              onAdd={key => setEditValues(prev => ({ ...prev, [key]: '' }))}
              existingKeys={allKeys}
            />
          </div>
        </div>

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

        <div className="text-sm text-muted-foreground space-y-2">
          <p>* 标记项为必填项</p>
          <p>配置保存后会自动应用，出现异常时可点击“重试应用配置”。</p>
        </div>
      </div>
    </div>
  )
}

function EmailConfigHelp() {
  const [expanded, setExpanded] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  async function handleTestEmail() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`${AGENT_API_BASE}/notifications/test-email`, { method: 'POST' })
      const data = await res.json() as { success?: boolean; error?: string; message?: string }
      if (data.success) {
        setTestResult({ success: true, message: data.message || '测试邮件已发送，请检查收件箱' })
      } else {
        setTestResult({ success: false, message: data.error || '测试失败' })
      }
    } catch {
      setTestResult({ success: false, message: '无法连接 Agent Service' })
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
        <span className="font-medium text-blue-900 dark:text-blue-100">邮件通知配置指南</span>
        <span className="text-blue-600 dark:text-blue-400">{expanded ? '收起' : '展开'}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 text-sm">
          <p className="text-muted-foreground text-xs">
            配置 `NOTIFICATION_EMAIL`、`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS` 后可发送通知邮件。
          </p>
          <button
            onClick={handleTestEmail}
            disabled={testing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? '发送中...' : '发送测试邮件'}
          </button>
          {testResult && (
            <p className={testResult.success ? 'text-green-700 text-xs' : 'text-red-700 text-xs'}>
              {testResult.message}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function FeishuConfigHelp() {
  const [expanded, setExpanded] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  async function handleTestFeishu() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`${AGENT_API_BASE}/feishu/test`, { method: 'POST' })
      const data = await res.json() as { success?: boolean; error?: string; message?: string }
      if (data.success) {
        setTestResult({ success: true, message: data.message || '飞书连接成功' })
      } else {
        setTestResult({ success: false, message: data.error || '连接失败' })
      }
    } catch {
      setTestResult({ success: false, message: '无法连接 Agent Service' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-purple-100/50 dark:hover:bg-purple-900/30 transition-colors"
      >
        <span className="font-medium text-purple-900 dark:text-purple-100">飞书 Bot 配置指南</span>
        <span className="text-purple-600 dark:text-purple-400">{expanded ? '收起' : '展开'}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 text-sm">
          <p className="text-muted-foreground text-xs">
            需配置 `FEISHU_ENABLED=true`、`FEISHU_APP_ID`、`FEISHU_APP_SECRET`，并在飞书开放平台启用 WebSocket 事件订阅。
          </p>
          <button
            onClick={handleTestFeishu}
            disabled={testing}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? '连接中...' : '测试飞书连接'}
          </button>
          {testResult && (
            <p className={testResult.success ? 'text-green-700 text-xs' : 'text-red-700 text-xs'}>
              {testResult.message}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function AddConfigItem({
  onAdd,
  existingKeys,
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
      setError('请输入配置名')
      return
    }
    if (existingKeys.has(key)) {
      setError('配置项已存在')
      return
    }
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      setError('配置名只能包含大写字母、数字和下划线')
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
        + 添加自定义配置
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={newKey}
          onChange={e => {
            setNewKey(e.target.value.toUpperCase())
            setError('')
          }}
          placeholder="MY_CONFIG"
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
