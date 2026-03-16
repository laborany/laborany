/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    MCP 预设浏览 + 安装对话框                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog'
import { API_BASE } from '../../config/api'
import { McpPresetCard } from './McpPresetCard'
import type { McpPreset } from './types'

interface McpPresetPickerDialogProps {
  open: boolean
  onClose: () => void
  onInstalled: () => void
}

export function McpPresetPickerDialog({
  open,
  onClose,
  onInstalled,
}: McpPresetPickerDialogProps) {
  const [presets, setPresets] = useState<McpPreset[]>([])
  const [loading, setLoading] = useState(false)

  // 凭证填写状态
  const [selectedPreset, setSelectedPreset] = useState<McpPreset | null>(null)
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({})
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    void loadPresets()
    setSelectedPreset(null)
    setCredentialValues({})
    setError('')
  }, [open])

  async function loadPresets() {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/mcp/presets`)
      const data = await res.json() as { success: boolean; presets: McpPreset[] }
      if (data.success) setPresets(data.presets)
    } catch {
      setError('加载预设失败')
    } finally {
      setLoading(false)
    }
  }

  function handleSelectPreset(preset: McpPreset) {
    if (preset.installed) return
    if (preset.credentials.length === 0) {
      // 无需凭证，直接安装
      void installPreset(preset.id, {})
      return
    }
    setSelectedPreset(preset)
    setCredentialValues({})
    setError('')
  }

  async function installPreset(presetId: string, credentials: Record<string, string>) {
    setInstalling(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/mcp/presets/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId, credentials }),
      })
      const data = await res.json() as { success: boolean; error?: string }
      if (data.success) {
        setSelectedPreset(null)
        onInstalled()
        void loadPresets()
      } else {
        setError(data.error || '安装失败')
      }
    } catch {
      setError('安装请求失败')
    } finally {
      setInstalling(false)
    }
  }

  function handleInstallWithCredentials() {
    if (!selectedPreset) return
    void installPreset(selectedPreset.id, credentialValues)
  }

  // 凭证填写视图
  if (selectedPreset) {
    return (
      <Dialog open={open} onClose={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>安装 {selectedPreset.name}</DialogTitle>
            <DialogDescription>请填写以下凭证信息以完成安装。</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedPreset.credentials.map(cred => (
              <div key={cred.key}>
                <label className="block text-sm font-medium text-foreground mb-1">
                  {cred.label}
                </label>
                <input
                  type={cred.sensitive ? 'password' : 'text'}
                  value={credentialValues[cred.key] || ''}
                  onChange={e =>
                    setCredentialValues(prev => ({ ...prev, [cred.key]: e.target.value }))
                  }
                  placeholder={cred.placeholder}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            ))}
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>

          <DialogFooter>
            <button
              onClick={() => { setSelectedPreset(null); setError('') }}
              className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm hover:bg-muted/80"
            >
              返回
            </button>
            <button
              onClick={handleInstallWithCredentials}
              disabled={installing}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {installing ? '安装中...' : '确认安装'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // 预设列表视图
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>从预设添加 MCP 服务器</DialogTitle>
          <DialogDescription>选择一个预设快速安装常用 MCP 服务器。</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-2">
            {presets.map(preset => (
              <McpPresetCard
                key={preset.id}
                preset={preset}
                onInstall={handleSelectPreset}
              />
            ))}
          </div>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        <DialogFooter>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm hover:bg-muted/80"
          >
            关闭
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
