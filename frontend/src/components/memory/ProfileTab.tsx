/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         ProfileTab 组件                                  ║
 * ║                                                                          ║
 * ║  功能：展示和编辑用户画像（Profile）                                       ║
 * ║  设计：记忆统计 + 分组展示 + 字段编辑 + 高级选项                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import { AGENT_API_BASE } from '../../config/api'
import { CollapsibleSection } from '../shared/CollapsibleSection'
import { MemCellListPanel } from './MemCellListPanel'
import { EpisodeListPanel } from './EpisodeListPanel'
import { ProfileFieldsPanel } from './ProfileFieldsPanel'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface MemoryStats {
  cellCount: number
  episodeCount: number
  profileFieldCount: number
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function ProfileTab() {
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [clustering, setClustering] = useState(false)
  const [expandedPanel, setExpandedPanel] = useState<'cells' | 'episodes' | 'profile' | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const res = await fetch(`${AGENT_API_BASE}/memory/stats`)

      if (!res.ok) {
        setMessage({ type: 'error', text: '加载记忆统计失败' })
        return
      }

      const statsData = await res.json()

      setStats({
        cellCount: statsData.cells || 0,
        episodeCount: statsData.episodes || 0,
        profileFieldCount: statsData.profileFields || 0,
      })
    } catch {
      setMessage({ type: 'error', text: '加载记忆统计失败' })
    } finally {
      setLoading(false)
    }
  }

  async function triggerClustering() {
    setClustering(true)
    setMessage(null)
    try {
      const res = await fetch(`${AGENT_API_BASE}/memory/cluster-episodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 7 }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: `已生成 ${data.count} 个情节记忆` })
        loadData()
      }
    } catch {
      setMessage({ type: 'error', text: 'Episode 聚类失败' })
    } finally {
      setClustering(false)
    }
  }

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div className="space-y-6">
      {/* 记忆概览统计卡片（可点击展开） */}
      <StatsCards stats={stats} onCardClick={setExpandedPanel} activePanel={expandedPanel} />

      {/* 展开的详情面板 */}
      {expandedPanel === 'cells' && (
        <MemCellListPanel onClose={() => setExpandedPanel(null)} />
      )}
      {expandedPanel === 'episodes' && (
        <EpisodeListPanel onClose={() => setExpandedPanel(null)} />
      )}
      {expandedPanel === 'profile' && (
        <ProfileFieldsPanel onClose={() => setExpandedPanel(null)} />
      )}

      {/* 消息提示 */}
      {message && <MessageBox type={message.type} text={message.text} />}

      {/* 高级选项 */}
      <CollapsibleSection title="高级选项" defaultExpanded={false} icon={<SettingsIcon />}>
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            onClick={triggerClustering}
            disabled={clustering}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            {clustering ? <LoadingIcon /> : <ClusterIcon />}
            触发 Episode 聚类
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent">
            <ExportIcon />
            导出画像
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-500 hover:bg-red-500/10">
            <TrashIcon />
            重置画像
          </button>
        </div>
      </CollapsibleSection>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           统计卡片组件                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function StatsCards({ stats, onCardClick, activePanel }: {
  stats: MemoryStats | null
  onCardClick: (panel: 'cells' | 'episodes' | 'profile' | null) => void
  activePanel: 'cells' | 'episodes' | 'profile' | null
}) {
  const items = [
    { label: '原子记忆', value: stats?.cellCount ?? 0, color: 'text-blue-500', panel: 'cells' as const },
    { label: '情节记忆', value: stats?.episodeCount ?? 0, color: 'text-green-500', panel: 'episodes' as const },
    { label: '画像字段', value: stats?.profileFieldCount ?? 0, color: 'text-purple-500', panel: 'profile' as const },
  ]

  return (
    <div className="grid grid-cols-3 gap-4">
      {items.map((item) => (
        <div
          key={item.label}
          onClick={() => onCardClick(activePanel === item.panel ? null : item.panel)}
          className={`rounded-lg border bg-card p-4 text-center transition-colors cursor-pointer hover:bg-accent ${
            activePanel === item.panel ? 'border-primary' : 'border-border'
          }`}
        >
          <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
          <div className="mt-1 text-sm text-muted-foreground">{item.label}</div>
        </div>
      ))}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           辅助组件                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

function LoadingIcon() {
  return <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
}

function MessageBox({ type, text }: { type: 'success' | 'error'; text: string }) {
  const styles = type === 'success'
    ? 'bg-green-500/10 text-green-600 border-green-500/20'
    : 'bg-red-500/10 text-red-600 border-red-500/20'
  return <div className={`rounded-lg border p-4 ${styles}`}>{text}</div>
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           图标组件                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function SettingsIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function ClusterIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}

function ExportIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}
