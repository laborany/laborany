/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    MCP 服务器列表                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { McpServerEntry } from './types'
import { McpServerListItem } from './McpServerListItem'

export function McpServerList({
  servers,
  onEdit,
  onDelete,
}: {
  servers: McpServerEntry[]
  onEdit: (server: McpServerEntry) => void
  onDelete: (name: string) => void
}) {
  if (servers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-muted-foreground">
            <path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a6 6 0 0 1-6 6a6 6 0 0 1-6-6V8z" />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">暂无 MCP 服务器</p>
        <p className="mt-1 text-xs text-muted-foreground">点击上方按钮从预设添加或手动配置</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {servers.map(server => (
        <McpServerListItem
          key={server.name}
          server={server}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
