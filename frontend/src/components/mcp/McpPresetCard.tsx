/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    MCP 预设卡片                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { McpPreset } from './types'

const CATEGORY_LABELS: Record<string, string> = {
  search: '搜索',
  coding: '开发',
  data: '数据',
  ai: 'AI',
  productivity: '效率',
}

const CATEGORY_COLORS: Record<string, string> = {
  search: 'bg-orange-100 text-orange-800',
  coding: 'bg-violet-100 text-violet-800',
  data: 'bg-cyan-100 text-cyan-800',
  ai: 'bg-pink-100 text-pink-800',
  productivity: 'bg-lime-100 text-lime-800',
}

export function McpPresetCard({
  preset,
  onInstall,
}: {
  preset: McpPreset
  onInstall: (preset: McpPreset) => void
}) {
  const catLabel = CATEGORY_LABELS[preset.category] || preset.category
  const catColor = CATEGORY_COLORS[preset.category] || 'bg-gray-100 text-gray-800'

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{preset.name}</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${catColor}`}>
            {catLabel}
          </span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {preset.configTemplate.type.toUpperCase()}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{preset.description}</p>
      </div>
      <button
        onClick={() => onInstall(preset)}
        disabled={preset.installed}
        className={`shrink-0 rounded px-3 py-1.5 text-xs font-medium ${
          preset.installed
            ? 'bg-green-100 text-green-700 cursor-default'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'
        }`}
      >
        {preset.installed ? '已安装' : '安装'}
      </button>
    </div>
  )
}
