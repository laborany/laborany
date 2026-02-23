/* 鈺斺晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晽
 * 鈺?                      MemoryArchiveTab 缁勪欢                              鈺?
 * 鈺?                                                                         鈺?
 * 鈺? 鍔熻兘锛氭暣鍚堥暱鏈熻蹇嗙紪杈?+ 鎯呰妭璁板繂娴忚 + 姣忔棩璁板繂鏂囦欢                       鈺?
 * 鈺? 璁捐锛氫娇鐢?CollapsibleSection 瀹炵幇娓愯繘寮忔姭闇?                            鈺?
 * 鈺氣晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨暆 */

import { useState, useEffect } from 'react'
import { AGENT_API_BASE, API_BASE } from '../../config/api'
import { CollapsibleSection } from '../shared/CollapsibleSection'

/* 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
 * 鈹?                          绫诲瀷瀹氫箟                                        鈹?
 * 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?*/
interface MemoryFile {
  name: string
  path: string
  scope: 'global' | 'skill'
  displayName: string
  updatedAt?: string
  skillId?: string
  skillName?: string
}

interface LongTermStats {
  days: number
  accepted: number
  rejected: number
  superseded: number
  noDecision: number
  total: number
  lastActionAt?: string
  lastNoDecisionAt?: string
  allTime?: {
    accepted: number
    rejected: number
    superseded: number
    noDecision: number
    total: number
    lastActionAt?: string
    lastNoDecisionAt?: string
  }
}

interface LongTermAuditLog {
  id: string
  at: string
  scope: 'global' | 'skill'
  skillId?: string
  action: 'inserted' | 'updated' | 'superseded' | 'skipped' | 'no_decision_summary'
  reason: string
  category: string
  statement: string
  reasonSummary?: string
  reasonCounts?: Record<string, number>
  extractionMethod?: 'cli' | 'regex'
  factCount?: number
  profilePatchCount?: number
  candidateQueued?: number
}

interface Skill {
  id: string
  name: string
}

interface SkillListItem {
  id?: string
  name?: string
  meta?: {
    id?: string
    name?: string
  }
}

type MemoryScope = 'global' | 'skill'

/* 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
 * 鈹?                          涓荤粍浠?                                         鈹?
 * 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?*/
export function MemoryArchiveTab() {
  return (
    <div className="space-y-6">
      <LongTermOverviewSection />

      {/* 闀挎湡璁板繂缂栬緫鍣?*/}
      <GlobalMemorySection />

      {/* 姣忔棩璁板繂鏂囦欢娴忚 */}
      <CollapsibleSection
        title="每日记忆文件"
        defaultExpanded={false}
        icon={<FileIcon />}
      >
        <DailyMemoryBrowser />
      </CollapsibleSection>
    </div>
  )
}

function LongTermOverviewSection() {
  const [stats, setStats] = useState<LongTermStats | null>(null)
  const [logs, setLogs] = useState<LongTermAuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [statsRes, logsRes] = await Promise.all([
        fetch(`${AGENT_API_BASE}/memory/longterm/stats?days=7`),
        fetch(`${AGENT_API_BASE}/memory/longterm/audit?limit=8`),
      ])

      const statsData = await statsRes.json()
      const logsData = await logsRes.json()

      if (!statsRes.ok) {
        throw new Error(statsData?.error || '加载长期记忆统计失败')
      }
      if (!logsRes.ok) {
        throw new Error(logsData?.error || '加载长期记忆审计失败')
      }

      setStats(statsData as LongTermStats)
      setLogs(Array.isArray(logsData?.logs) ? logsData.logs : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载长期记忆信息失败')
      setStats(null)
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <CollapsibleSection
      title="长期记忆状态"
      defaultExpanded={false}
      icon={<MemoryIcon />}
    >
      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="space-y-4 pt-2">
          {error && <MessageBox type="error" text={error} />}
          {stats && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <MetricCard label="已写入" value={stats.accepted} />
              <MetricCard label="已拒绝" value={stats.rejected} />
              <MetricCard label="已替换" value={stats.superseded} />
              <MetricCard label="无决策" value={stats.noDecision} />
              <MetricCard label="总决策数" value={stats.total} />
            </div>
          )}

          {stats?.allTime && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <MetricCard label="累计写入" value={stats.allTime.accepted} />
              <MetricCard label="累计拒绝" value={stats.allTime.rejected} />
              <MetricCard label="累计替换" value={stats.allTime.superseded} />
              <MetricCard label="累计无决策" value={stats.allTime.noDecision} />
              <MetricCard label="累计总数" value={stats.allTime.total} />
            </div>
          )}
          {stats && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>
                最近决策时间: {stats.lastActionAt ? new Date(stats.lastActionAt).toLocaleString() : '暂无审计记录'}
              </div>
              <div>
                最近无决策时间: {stats.lastNoDecisionAt ? new Date(stats.lastNoDecisionAt).toLocaleString() : '暂无'}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-sm font-medium text-foreground">最近决策日志</span>
              <button
                onClick={loadData}
                className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                刷新
              </button>
            </div>
            <div className="max-h-[220px] overflow-y-auto px-3 py-2">
              {logs.length === 0 ? (
                <div className="py-2 text-sm text-muted-foreground">
                  {(stats && (stats.total > 0 || stats.noDecision > 0))
                    ? '暂无审计明细，可稍后重试刷新'
                    : '暂无日志'}
                </div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="mb-3 border-b border-border/40 pb-2 last:mb-0 last:border-b-0">
                    <div className="mb-1 flex items-center gap-2">
                      <ScopeTag scope={log.scope} />
                      <span className="text-xs text-muted-foreground">{new Date(log.at).toLocaleString()}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{formatAuditAction(log.action)}</span>
                    </div>
                    <div className="text-sm text-foreground">{log.statement}</div>
                    <div className="text-xs text-muted-foreground">{log.category} · {formatAuditReason(log)}</div>
                    {log.action === 'no_decision_summary' && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        method={log.extractionMethod || 'unknown'}, facts={log.factCount ?? 0}, patches={log.profilePatchCount ?? 0}, queued={log.candidateQueued ?? 0}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </CollapsibleSection>
  )
}

function formatAuditAction(action: LongTermAuditLog['action']): string {
  switch (action) {
    case 'inserted':
      return '写入'
    case 'updated':
      return '更新'
    case 'superseded':
      return '替换'
    case 'skipped':
      return '跳过'
    case 'no_decision_summary':
      return '未触发(聚合)'
    default:
      return action
  }
}

const REASON_LABELS: Record<string, string> = {
  summary_and_facts_empty: '摘要与事实均为空',
  cli_fallback_regex: 'CLI 抽取失败，已回退正则抽取',
  facts_empty_raw: '原始抽取结果无事实',
  facts_empty_filtered: '事实在过滤后为空',
  summary_empty: '摘要为空',
  profile_patch_empty: '未形成可用画像补丁',
  no_user_qualified_patch: '没有满足条件的用户侧补丁',
  longterm_score_or_evidence_insufficient: '证据强度或评分不足，未触发长期写入',
  no_longterm_decision: '未触发长期记忆决策',
  no_decision_summary: '未触发长期记忆决策（聚合）',
  no_reason: '未提供原因',
}

function mapReasonKey(key: string): string {
  return REASON_LABELS[key] || key
}

function formatReasonSummary(summary: string): string {
  const normalized = summary.trim()
  if (!normalized) return ''
  const parts = normalized
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  if (parts.length === 0) return normalized

  const parsed = parts.map(item => item.match(/^([a-z0-9_]+):(\d+)$/i))
  const allPairs = parsed.every(Boolean)
  if (!allPairs) return normalized

  return parsed
    .map(match => `${mapReasonKey(match![1])}:${match![2]}`)
    .join('；')
}

function formatReasonCounts(reasonCounts?: Record<string, number>): string {
  if (!reasonCounts) return ''
  const entries = Object.entries(reasonCounts)
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)

  if (entries.length === 0) return ''
  return entries.map(([key, value]) => `${mapReasonKey(key)}:${value}`).join('；')
}

function formatAuditReason(log: LongTermAuditLog): string {
  if (log.reasonSummary && log.reasonSummary.trim()) return formatReasonSummary(log.reasonSummary)
  const counted = formatReasonCounts(log.reasonCounts)
  if (counted) return counted
  if (log.reason) return mapReasonKey(log.reason)
  return '未知原因'
}
/* 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
 * 鈹?                      闀挎湡璁板繂缂栬緫鍣?(MEMORY.md)                          鈹?
 * 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?*/
function GlobalMemorySection() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadGlobalMemory()
  }, [])

  async function loadGlobalMemory() {
    try {
      const res = await fetch(`${AGENT_API_BASE}/global-memory`)
      if (res.status === 404) {
        // 鏂囦欢涓嶅瓨鍦ㄦ槸姝ｅ父鐨勫垵濮嬬姸鎬?
        setContent('')
      } else if (res.ok) {
        const data = await res.json()
        setContent(data.content || '')
      } else {
        setMessage({ type: 'error', text: '加载 MEMORY.md 失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '加载 MEMORY.md 失败' })
    } finally {
      setLoading(false)
    }
  }

  async function saveGlobalMemory() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`${AGENT_API_BASE}/global-memory`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: '保存成功' })
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || '保存失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MemoryIcon />
        <h3 className="font-medium">长期记忆 (MEMORY.md)</h3>
      </div>

      <div className="rounded-lg bg-muted/50 p-4">
        <p className="text-sm text-muted-foreground">
          Labor 会在这里记录重要的学习成果和经验，这些记忆会长期保留。
        </p>
      </div>

      {message && <MessageBox type={message.type} text={message.text} />}

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="h-[300px] w-full resize-none rounded-lg border border-border bg-card px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        placeholder="# 全局记忆&#10;&#10;Labor 会在这里记录重要的学习成果..."
      />

      <div className="flex justify-end">
        <button
          onClick={saveGlobalMemory}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving && <LoadingIcon />}
          保存
        </button>
      </div>
    </div>
  )
}

/* 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
 * 鈹?                      姣忔棩璁板繂鏂囦欢娴忚鍣?                                  鈹?
 * 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?*/
function DailyMemoryBrowser() {
  const [scope, setScope] = useState<MemoryScope>('global')
  const [skills, setSkills] = useState<Skill[]>([])
  const [selectedSkill, setSelectedSkill] = useState('')
  const [files, setFiles] = useState<MemoryFile[]>([])
  const [selectedFile, setSelectedFile] = useState<MemoryFile | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadSkills()
  }, [])

  useEffect(() => {
    loadFiles()
  }, [scope, selectedSkill])

  async function loadSkills() {
    try {
      const token = localStorage.getItem('token')
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined
      const res = await fetch(`${API_BASE}/skill/list`, { headers })
      const data = await res.json()
      const mapped = Array.isArray(data.skills)
        ? data.skills
            .map((item: SkillListItem): Skill | null => {
              const id = item.meta?.id || item.id
              if (!id) return null
              const name = item.meta?.name || item.name || id
              return { id, name }
            })
            .filter((item: Skill | null): item is Skill => item !== null)
        : []
      setSkills(mapped)
    } catch {
      setSkills([])
    }
  }

  async function loadFiles() {
    if (scope === 'skill' && !selectedSkill) {
      setFiles([])
      return
    }
    setLoading(true)
    setSelectedFile(null)
    setFileContent('')
    try {
      const url = scope === 'global'
        ? `${AGENT_API_BASE}/memory/global`
        : `${AGENT_API_BASE}/memory/skill/${selectedSkill}`
      const res = await fetch(url)
      const data = await res.json()
      setFiles(data.files || [])
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }

  async function loadFileContent(file: MemoryFile) {
    setSelectedFile(file)
    setMessage(null)
    try {
      const res = await fetch(`${AGENT_API_BASE}/memory/file?path=${encodeURIComponent(file.path)}`)
      const data = await res.json()
      setFileContent(data.content || '')
    } catch {
      setFileContent('')
      setMessage({ type: 'error', text: '加载文件失败' })
    }
  }

  async function saveFile() {
    if (!selectedFile) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`${AGENT_API_BASE}/memory/file`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedFile.path, content: fileContent }),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: '保存成功' })
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || '保存失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 pt-2">
      {/* 浣滅敤鍩熼€夋嫨 */}
      <div className="flex items-center gap-4">
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as MemoryScope)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="global">全局（全部来源）</option>
          <option value="skill">技能记忆</option>
        </select>

        {scope === 'skill' && (
          <select
            value={selectedSkill}
            onChange={(e) => setSelectedSkill(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">选择技能...</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>{s.name || s.id}</option>
            ))}
          </select>
        )}
      </div>

      {message && <MessageBox type={message.type} text={message.text} />}

      <div className="grid grid-cols-3 gap-4">
        {/* 鏂囦欢鍒楄〃 */}
        <div className="col-span-1 overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border bg-muted/50 px-3 py-2">
            <span className="text-sm font-medium text-foreground">文件列表</span>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center"><LoadingSpinner /></div>
            ) : files.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">暂无记忆文件</div>
            ) : (
              files.map((file) => (
                <button
                  key={file.path}
                  onClick={() => loadFileContent(file)}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                    selectedFile?.path === file.path ? 'bg-primary/10 text-primary' : 'text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ScopeTag scope={file.scope} />
                    <span className="truncate">{file.displayName}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* 鏂囦欢鍐呭 */}
        <div className="col-span-2 space-y-3">
          {selectedFile ? (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ScopeTag scope={selectedFile.scope} />
                <span>编辑:</span>
                <code className="rounded bg-muted px-2 py-0.5">{selectedFile.displayName}</code>
              </div>
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="h-[250px] w-full resize-none rounded-lg border border-border bg-card px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <div className="flex justify-end">
                <button
                  onClick={saveFile}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving && <LoadingIcon />}
                  保存
                </button>
              </div>
            </>
          ) : (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
              选择左侧文件进行编辑
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
 * 鈹?                          杈呭姪缁勪欢                                        鈹?
 * 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?*/
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-4">
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

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
    </div>
  )
}

function ScopeTag({ scope }: { scope: 'global' | 'skill' }) {
  const isGlobal = scope === 'global'
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
      isGlobal ? 'bg-blue-500/10 text-blue-600' : 'bg-purple-500/10 text-purple-600'
    }`}>
      {isGlobal ? '全局' : '技能'}
    </span>
  )
}

/* 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
 * 鈹?                          鍥炬爣缁勪欢                                        鈹?
 * 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?*/
function FileIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function MemoryIcon() {
  return (
    <svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  )
}
