/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         设置页面                                          ║
 * ║                                                                          ║
 * ║  功能：配置 API 密钥等环境变量                                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'

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

const API_BASE = '/api'

export default function SettingsPage() {
  const [config, setConfig] = useState<Record<string, ConfigItem>>({})
  const [template, setTemplate] = useState<Record<string, ConfigTemplate>>({})
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [configPath, setConfigPath] = useState('')
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
        body: JSON.stringify({ config: editValues })
      })

      const data = await res.json()

      if (res.ok) {
        setMessage({ type: 'success', text: data.message || '配置已保存' })
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
          </div>
        )}

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
