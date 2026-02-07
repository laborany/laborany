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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface ProfileField {
  key: string
  value: string
  description: string
  evidences: string[]
}

interface ProfileSection {
  name: string
  fields: ProfileField[]
}

interface Profile {
  version: number
  updatedAt: Date
  sections: ProfileSection[]
}

interface MemoryStats {
  cellCount: number
  episodeCount: number
  profileFieldCount: number
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function ProfileTab() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [clustering, setClustering] = useState(false)
  const [expandedPanel, setExpandedPanel] = useState<'cells' | 'episodes' | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [profileRes, statsRes] = await Promise.all([
        fetch(`${AGENT_API_BASE}/profile`),
        fetch(`${AGENT_API_BASE}/memory/stats`),
      ])

      if (!profileRes.ok || !statsRes.ok) {
        setMessage({ type: 'error', text: '加载用户画像失败' })
        return
      }

      const profileData = await profileRes.json()
      const statsData = await statsRes.json()

      setProfile(profileData.profile)
      setStats({
        cellCount: statsData.cells || 0,
        episodeCount: statsData.episodes || 0,
        profileFieldCount: statsData.profileFields || 0,
      })
    } catch {
      setMessage({ type: 'error', text: '加载用户画像失败' })
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

      {/* 消息提示 */}
      {message && <MessageBox type={message.type} text={message.text} />}

      {/* Profile 分组展示 */}
      {profile?.sections.map((section) => (
        <ProfileSectionCard key={section.name} section={section} />
      ))}

      {/* 空状态提示 */}
      {profile && profile.sections.every(s => s.fields.length === 0) && (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
          <div className="text-muted-foreground">
            <BrainEmptyIcon />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            暂无用户画像数据
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            与 Labor 对话后，系统会自动学习你的偏好
          </p>
        </div>
      )}

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
  onCardClick: (panel: 'cells' | 'episodes' | null) => void
  activePanel: 'cells' | 'episodes' | null
}) {
  const items = [
    { label: '原子记忆', value: stats?.cellCount ?? 0, color: 'text-blue-500', panel: 'cells' as const },
    { label: '情节记忆', value: stats?.episodeCount ?? 0, color: 'text-green-500', panel: 'episodes' as const },
    { label: '画像字段', value: stats?.profileFieldCount ?? 0, color: 'text-purple-500', panel: null },
  ]

  return (
    <div className="grid grid-cols-3 gap-4">
      {items.map((item) => (
        <div
          key={item.label}
          onClick={() => item.panel && onCardClick(activePanel === item.panel ? null : item.panel)}
          className={`rounded-lg border bg-card p-4 text-center transition-colors ${
            item.panel ? 'cursor-pointer hover:bg-accent' : ''
          } ${activePanel === item.panel ? 'border-primary' : 'border-border'}`}
        >
          <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
          <div className="mt-1 text-sm text-muted-foreground">{item.label}</div>
        </div>
      ))}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Profile 分组卡片                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ProfileSectionCard({ section }: { section: ProfileSection }) {
  const sectionIcons: Record<string, React.ReactNode> = {
    '工作偏好': <WorkIcon />,
    '沟通风格': <ChatIcon />,
    '技术栈': <CodeIcon />,
    '个人信息': <UserIcon />,
  }

  if (section.fields.length === 0) return null

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{sectionIcons[section.name] || <FolderIcon />}</span>
          <span className="font-medium">{section.name}</span>
        </div>
        <button className="text-sm text-primary hover:underline">编辑</button>
      </div>
      <div className="divide-y divide-border/50">
        {section.fields.map((field) => (
          <ProfileFieldRow key={field.key} field={field} />
        ))}
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Profile 字段行                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ProfileFieldRow({ field }: { field: ProfileField }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="px-4 py-3">
      <div
        className="flex cursor-pointer items-start justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{field.key}</span>
            <span className="text-xs text-muted-foreground">
              (来源: {field.evidences.length} 次对话)
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{field.description}</p>
        </div>
        <span className="p-1 text-muted-foreground">
          <svg
            className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </div>
      {expanded && field.evidences.length > 0 && (
        <div className="mt-2 rounded bg-muted/50 p-2">
          <div className="text-xs font-medium text-muted-foreground">证据来源:</div>
          <ul className="mt-1 space-y-1">
            {field.evidences.map((e, i) => (
              <li key={i} className="text-xs text-muted-foreground">• {e}</li>
            ))}
          </ul>
        </div>
      )}
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

function WorkIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )
}

function CodeIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  )
}

function BrainEmptyIcon() {
  return (
    <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  )
}
