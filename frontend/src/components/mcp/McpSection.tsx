/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    MCP 工具扩展 Section                                   ║
 * ║                                                                        ║
 * ║  独立管理 MCP 服务器，即时保存到 ~/.claude/settings.json                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect, useCallback } from 'react'
import { API_BASE } from '../../config/api'
import { McpServerList } from './McpServerList'
import { McpServerEditorDialog } from './McpServerEditorDialog'
import { McpPresetPickerDialog } from './McpPresetPickerDialog'
import type { McpServerEntry, McpServerConfig } from './types'

export function McpSection() {
  const [servers, setServers] = useState<McpServerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [editorOpen, setEditorOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<McpServerEntry | null>(null)
  const [presetPickerOpen, setPresetPickerOpen] = useState(false)

  const loadServers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/mcp`)
      const data = await res.json() as { success: boolean; servers: McpServerEntry[] }
      if (data.success) {
        setServers(data.servers)
        setError('')
      }
    } catch {
      setError('加载 MCP 配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadServers()
  }, [loadServers])

  async function handleSave(name: string, config: McpServerConfig) {
    try {
      const res = await fetch(`${API_BASE}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, config }),
      })
      const data = await res.json() as { success: boolean; error?: string }
      if (data.success) {
        setEditorOpen(false)
        setEditTarget(null)
        void loadServers()
      } else {
        setError(data.error || '保存失败')
      }
    } catch {
      setError('保存请求失败')
    }
  }

  async function handleDelete(name: string) {
    try {
      const res = await fetch(`${API_BASE}/mcp/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      })
      const data = await res.json() as { success: boolean; error?: string }
      if (data.success) {
        void loadServers()
      } else {
        setError(data.error || '删除失败')
      }
    } catch {
      setError('删除请求失败')
    }
  }

  function handleEdit(server: McpServerEntry) {
    setEditTarget(server)
    setEditorOpen(true)
  }

  function handleAddNew() {
    setEditTarget(null)
    setEditorOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setPresetPickerOpen(true)}
          className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90"
        >
          从预设添加
        </button>
        <button
          onClick={handleAddNew}
          className="px-3 py-1.5 bg-background border border-border rounded text-sm hover:bg-muted"
        >
          手动添加
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <McpServerList
          servers={servers}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      {error && (
        <p className="mt-2 text-xs text-red-500">{error}</p>
      )}

      <div className="rounded border border-blue-300/60 bg-blue-50 p-3 text-xs text-blue-900">
        MCP 配置即时生效，直接写入 <code className="rounded bg-blue-100 px-1">~/.claude/settings.json</code>。
        使用智谱 API 时，系统会自动注入智谱 MCP 服务器（网页搜索、网页阅读、文档阅读、AI 综合服务），无需手动添加。
      </div>

      <McpServerEditorDialog
        open={editorOpen}
        onClose={() => { setEditorOpen(false); setEditTarget(null) }}
        onSave={handleSave}
        editServer={editTarget}
      />
      <McpPresetPickerDialog
        open={presetPickerOpen}
        onClose={() => setPresetPickerOpen(false)}
        onInstalled={() => void loadServers()}
      />
    </div>
  )
}
