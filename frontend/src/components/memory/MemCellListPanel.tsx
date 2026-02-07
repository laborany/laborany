/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     MemCellListPanel 组件                                ║
 * ║                                                                          ║
 * ║  功能：展示最近的原子记忆（MemCell）列表                                  ║
 * ║  设计：按日期分组，点击展开查看详情                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import { AGENT_API_BASE } from '../../config/api'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface CellFact {
  type: string
  content: string
  confidence: number
}

interface CellItem {
  id: string
  timestamp: string
  skillId: string
  summary: string
  factCount: number
  facts: CellFact[]
}

interface Props {
  onClose: () => void
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function MemCellListPanel({ onClose }: Props) {
  const [cells, setCells] = useState<CellItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    loadCells()
  }, [])

  async function loadCells() {
    try {
      const res = await fetch(`${AGENT_API_BASE}/memory/cells?days=7`)
      if (!res.ok) return
      const data = await res.json()
      setCells(data.cells || [])
    } catch { /* 静默 */ } finally {
      setLoading(false)
    }
  }

  /* ── 按日期分组 ── */
  const grouped = cells.reduce<Record<string, CellItem[]>>((acc, cell) => {
    const date = new Date(cell.timestamp).toLocaleDateString('zh-CN')
    ;(acc[date] ||= []).push(cell)
    return acc
  }, {})

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-medium">原子记忆（最近 7 天）</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <CloseIcon />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : cells.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">暂无原子记忆</div>
      ) : (
        <div className="max-h-96 overflow-y-auto divide-y divide-border/50">
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <div className="sticky top-0 bg-muted/50 px-4 py-1.5 text-xs font-medium text-muted-foreground">
                {date}
              </div>
              {items.map(cell => (
                <CellRow
                  key={cell.id}
                  cell={cell}
                  expanded={expandedId === cell.id}
                  onToggle={() => setExpandedId(expandedId === cell.id ? null : cell.id)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           单条记忆行                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function CellRow({ cell, expanded, onToggle }: { cell: CellItem; expanded: boolean; onToggle: () => void }) {
  const time = new Date(cell.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="px-4 py-2">
      <div className="flex cursor-pointer items-center gap-2" onClick={onToggle}>
        <span className="text-xs text-muted-foreground">{time}</span>
        <span className="flex-1 truncate text-sm">{cell.summary}</span>
        <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-500">
          {cell.factCount} 事实
        </span>
      </div>
      {expanded && (
        <div className="mt-2 rounded bg-muted/50 p-3 text-xs space-y-1">
          <div className="text-muted-foreground">技能: {cell.skillId}</div>
          {cell.facts.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="rounded bg-primary/10 px-1 text-primary">{f.type}</span>
              <span>{f.content}</span>
              <span className="text-muted-foreground">({(f.confidence * 100).toFixed(0)}%)</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           图标                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function CloseIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
