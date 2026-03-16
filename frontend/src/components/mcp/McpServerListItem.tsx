/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    MCP 服务器列表项                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState } from 'react'
import type { McpServerEntry } from './types'
import { McpServerTestButton } from './McpServerTestButton'

export function McpServerListItem({
  server,
  onEdit,
  onDelete,
}: {
  server: McpServerEntry
  onEdit: (server: McpServerEntry) => void
  onDelete: (name: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const typeLabel = server.config.type === 'http' ? 'HTTP' : 'STDIO'
  const typeBadgeClass = server.config.type === 'http'
    ? 'bg-blue-100 text-blue-800'
    : 'bg-emerald-100 text-emerald-800'

  const detail = server.config.type === 'http'
    ? server.config.url
    : `${server.config.command} ${(server.config.args || []).join(' ')}`

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:bg-muted/30">
      {/* 图标 */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {server.config.type === 'http' ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" />
          </svg>
        )}
      </div>

      {/* 信息 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{server.name}</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${typeBadgeClass}`}>
            {typeLabel}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground" title={detail}>
          {detail}
        </p>
      </div>

      {/* 操作 */}
      <div className="flex items-center gap-1.5 shrink-0">
        <McpServerTestButton serverName={server.name} />
        <button
          onClick={() => onEdit(server)}
          className="rounded px-2 py-1 text-xs text-foreground hover:bg-muted border border-border"
        >
          编辑
        </button>
        {confirmDelete ? (
          <span className="inline-flex items-center gap-1">
            <span className="text-xs text-red-600">确认?</span>
            <button
              onClick={() => { onDelete(server.name); setConfirmDelete(false) }}
              className="rounded px-2 py-1 text-xs text-white bg-red-600 hover:bg-red-700"
            >
              删除
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted border border-border"
            >
              取消
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 border border-red-200"
          >
            删除
          </button>
        )}
      </div>
    </div>
  )
}
