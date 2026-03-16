/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    MCP 服务器编辑对话框                                    ║
 * ║                                                                        ║
 * ║  支持 stdio / http 两种类型配置                                           ║
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
import { McpKeyValueEditor } from './McpKeyValueEditor'
import type { McpServerConfig, McpServerEntry } from './types'

interface McpServerEditorDialogProps {
  open: boolean
  onClose: () => void
  onSave: (name: string, config: McpServerConfig) => void
  editServer?: McpServerEntry | null
}

export function McpServerEditorDialog({
  open,
  onClose,
  onSave,
  editServer,
}: McpServerEditorDialogProps) {
  const [name, setName] = useState('')
  const [serverType, setServerType] = useState<'stdio' | 'http'>('stdio')

  // stdio fields
  const [command, setCommand] = useState('')
  const [argsText, setArgsText] = useState('')
  const [envVars, setEnvVars] = useState<Record<string, string>>({})

  // http fields
  const [url, setUrl] = useState('')
  const [headers, setHeaders] = useState<Record<string, string>>({})

  const [error, setError] = useState('')

  const isEditing = Boolean(editServer)

  useEffect(() => {
    if (!open) return

    if (editServer) {
      setName(editServer.name)
      setServerType(editServer.config.type)

      if (editServer.config.type === 'stdio') {
        setCommand(editServer.config.command)
        setArgsText((editServer.config.args || []).join('\n'))
        setEnvVars(editServer.config.env || {})
        setUrl('')
        setHeaders({})
      } else {
        setUrl(editServer.config.url)
        setHeaders(editServer.config.headers || {})
        setCommand('')
        setArgsText('')
        setEnvVars({})
      }
    } else {
      setName('')
      setServerType('stdio')
      setCommand('')
      setArgsText('')
      setEnvVars({})
      setUrl('')
      setHeaders({})
    }
    setError('')
  }, [open, editServer])

  function handleSave() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('请输入服务器名称')
      return
    }

    if (serverType === 'stdio') {
      if (!command.trim()) {
        setError('请输入命令')
        return
      }
      const args = argsText
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)

      const config: McpServerConfig = {
        type: 'stdio',
        command: command.trim(),
        ...(args.length > 0 ? { args } : {}),
        ...(Object.keys(envVars).length > 0 ? { env: envVars } : {}),
      }
      onSave(trimmedName, config)
    } else {
      if (!url.trim()) {
        setError('请输入 URL')
        return
      }
      const config: McpServerConfig = {
        type: 'http',
        url: url.trim(),
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      }
      onSave(trimmedName, config)
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? '编辑 MCP 服务器' : '添加 MCP 服务器'}</DialogTitle>
          <DialogDescription>
            配置 MCP 服务器连接参数。支持 stdio（命令行）和 http 两种模式。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 名称 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">服务器名称</label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              disabled={isEditing}
              placeholder="例如: my-mcp-server"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
            />
          </div>

          {/* 类型切换 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">服务器类型</label>
            <div className="flex gap-2">
              <button
                onClick={() => setServerType('stdio')}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  serverType === 'stdio'
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                Stdio（命令行）
              </button>
              <button
                onClick={() => setServerType('http')}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  serverType === 'http'
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                HTTP
              </button>
            </div>
          </div>

          {/* Stdio 配置 */}
          {serverType === 'stdio' && (
            <>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">命令</label>
                <input
                  type="text"
                  value={command}
                  onChange={e => { setCommand(e.target.value); setError('') }}
                  placeholder="例如: npx"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  参数 <span className="font-normal text-muted-foreground">（每行一个）</span>
                </label>
                <textarea
                  value={argsText}
                  onChange={e => setArgsText(e.target.value)}
                  placeholder={"-y\n@modelcontextprotocol/server-github"}
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <McpKeyValueEditor
                label="环境变量"
                entries={envVars}
                onChange={setEnvVars}
                sensitive
              />
            </>
          )}

          {/* HTTP 配置 */}
          {serverType === 'http' && (
            <>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">URL</label>
                <input
                  type="text"
                  value={url}
                  onChange={e => { setUrl(e.target.value); setError('') }}
                  placeholder="https://example.com/api/mcp/sse"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <McpKeyValueEditor
                label="请求头"
                entries={headers}
                onChange={setHeaders}
                sensitive
              />
            </>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm hover:bg-muted/80"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
          >
            {isEditing ? '保存修改' : '添加服务器'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
