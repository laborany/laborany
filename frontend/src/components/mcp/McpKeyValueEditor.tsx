/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    MCP 键值对编辑器                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState } from 'react'

export function McpKeyValueEditor({
  label,
  entries,
  onChange,
  sensitive,
}: {
  label: string
  entries: Record<string, string>
  onChange: (entries: Record<string, string>) => void
  sensitive?: boolean
}) {
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [showValues, setShowValues] = useState<Record<string, boolean>>({})

  const pairs = Object.entries(entries)

  function handleAdd() {
    const key = newKey.trim()
    if (!key) return
    onChange({ ...entries, [key]: newValue })
    setNewKey('')
    setNewValue('')
  }

  function handleRemove(key: string) {
    const { [key]: _, ...rest } = entries
    onChange(rest)
  }

  function handleValueChange(key: string, value: string) {
    onChange({ ...entries, [key]: value })
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-foreground">{label}</label>
      {pairs.map(([key, value]) => (
        <div key={key} className="flex items-center gap-2">
          <code className="shrink-0 rounded bg-muted px-2 py-1 text-xs">{key}</code>
          <div className="relative flex-1">
            <input
              type={sensitive && !showValues[key] ? 'password' : 'text'}
              value={value}
              onChange={e => handleValueChange(key, e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {sensitive && (
              <button
                type="button"
                onClick={() => setShowValues(prev => ({ ...prev, [key]: !prev[key] }))}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
              >
                {showValues[key] ? '隐藏' : '显示'}
              </button>
            )}
          </div>
          <button
            onClick={() => handleRemove(key)}
            className="shrink-0 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            删除
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newKey}
          onChange={e => setNewKey(e.target.value)}
          placeholder="键名"
          className="w-32 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <input
          type={sensitive ? 'password' : 'text'}
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          placeholder="值"
          className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <button
          onClick={handleAdd}
          disabled={!newKey.trim()}
          className="shrink-0 rounded px-3 py-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          添加
        </button>
      </div>
    </div>
  )
}
