/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       MemoryArchiveTab 组件                              ║
 * ║                                                                          ║
 * ║  功能：整合长期记忆编辑 + 情节记忆浏览 + 每日记忆文件                       ║
 * ║  设计：使用 CollapsibleSection 实现渐进式披露                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import { AGENT_API_BASE, API_BASE } from '../../config/api'
import { CollapsibleSection } from '../shared/CollapsibleSection'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
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
  total: number
  lastActionAt?: string
  allTime?: {
    accepted: number
    rejected: number
    superseded: number
    total: number
    lastActionAt?: string
  }
}

interface LongTermAuditLog {
  id: string
  at: string
  scope: 'global' | 'skill'
  skillId?: string
  action: 'inserted' | 'updated' | 'superseded' | 'skipped'
  reason: string
  category: string
  statement: string
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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function MemoryArchiveTab() {
  return (
    <div className="space-y-6">
      <LongTermOverviewSection />

      {/* 长期记忆编辑器 */}
      <GlobalMemorySection />

      {/* 每日记忆文件浏览 */}
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
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MetricCard label="已写入" value={stats.accepted} />
              <MetricCard label="已拒绝" value={stats.rejected} />
              <MetricCard label="已替换" value={stats.superseded} />
              <MetricCard label="总决策数" value={stats.total} />
            </div>
          )}

          {stats?.allTime && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MetricCard label="累计写入" value={stats.allTime.accepted} />
              <MetricCard label="累计拒绝" value={stats.allTime.rejected} />
              <MetricCard label="累计替换" value={stats.allTime.superseded} />
              <MetricCard label="累计总数" value={stats.allTime.total} />
            </div>
          )}
          {stats && (
            <div className="text-xs text-muted-foreground">
              最近决策时间: {stats.lastActionAt ? new Date(stats.lastActionAt).toLocaleString() : '暂无审计记录'}
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
                <div className="py-2 text-sm text-muted-foreground">暂无日志</div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="mb-3 border-b border-border/40 pb-2 last:mb-0 last:border-b-0">
                    <div className="mb-1 flex items-center gap-2">
                      <ScopeTag scope={log.scope} />
                      <span className="text-xs text-muted-foreground">{new Date(log.at).toLocaleString()}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{log.action}</span>
                    </div>
                    <div className="text-sm text-foreground">{log.statement}</div>
                    <div className="text-xs text-muted-foreground">{log.category} · {log.reason}</div>
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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       长期记忆编辑器 (MEMORY.md)                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
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
        // 文件不存在是正常的初始状态
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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       每日记忆文件浏览器                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
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
      {/* 作用域选择 */}
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
        {/* 文件列表 */}
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

        {/* 文件内容 */}
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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           辅助组件                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           图标组件                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
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
