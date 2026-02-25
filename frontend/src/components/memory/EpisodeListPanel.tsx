/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     EpisodeListPanel 组件                                ║
 * ║                                                                          ║
 * ║  功能：展示情节记忆（Episode）列表                                        ║
 * ║  设计：点击展开查看关键事实和关联 cell                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import { AGENT_API_BASE } from '../../config/api'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface KeyFact {
  fact: string
  source: string
}

interface EpisodeItem {
  id: string
  subject: string
  summary: string
  cellCount: number
  keyFacts: KeyFact[]
  createdAt: string
}

interface Props {
  onClose: () => void
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function EpisodeListPanel({ onClose }: Props) {
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    loadEpisodes()
  }, [])

  async function loadEpisodes() {
    try {
      const res = await fetch(`${AGENT_API_BASE}/memory/episodes`)
      if (!res.ok) return
      const data = await res.json()
      setEpisodes(data.episodes || [])
    } catch { /* 静默 */ } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-medium">情节记忆</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <CloseIcon />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : episodes.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">暂无情节记忆</div>
      ) : (
        <div className="max-h-96 overflow-y-auto divide-y divide-border/50">
          {episodes.map(ep => (
            <EpisodeRow
              key={ep.id}
              episode={ep}
              expanded={expandedId === ep.id}
              onToggle={() => setExpandedId(expandedId === ep.id ? null : ep.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           单条情节行                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function EpisodeRow({ episode, expanded, onToggle }: {
  episode: EpisodeItem; expanded: boolean; onToggle: () => void
}) {
  const date = new Date(episode.createdAt.endsWith('Z') ? episode.createdAt : episode.createdAt + 'Z').toLocaleDateString('zh-CN')

  return (
    <div className="px-4 py-3">
      <div className="flex cursor-pointer items-center gap-2" onClick={onToggle}>
        <span className="flex-1">
          <span className="text-sm font-medium">{episode.subject || '未命名情节'}</span>
          <span className="ml-2 text-xs text-muted-foreground">{date}</span>
        </span>
        <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-xs text-green-500">
          {episode.cellCount} 条记忆
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{episode.summary}</p>
      {expanded && episode.keyFacts.length > 0 && (
        <div className="mt-2 rounded bg-muted/50 p-3 text-xs space-y-1">
          <div className="font-medium text-muted-foreground">关键事实:</div>
          {episode.keyFacts.map((kf, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-muted-foreground">•</span>
              <span>{kf.fact}</span>
              <span className="text-muted-foreground">({kf.source})</span>
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
