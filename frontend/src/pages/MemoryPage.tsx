/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Memory 管理页面                                   ║
 * ║                                                                          ║
 * ║  功能：BOSS.md 编辑 + MEMORY.md 编辑 + Memory 文件浏览                     ║
 * ║  设计：三 Tab 布局，简洁直观                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import { AGENT_API_BASE } from '../config/api'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface MemoryFile {
  name: string
  path: string
  scope: 'global' | 'skill'
  displayName: string
  skillId?: string
  skillName?: string
}

interface Skill {
  id: string
  name: string
}

interface ConsolidationCandidate {
  id: string
  scope: 'global' | 'skill'
  skillId?: string
  skillName?: string
  category: string
  content: string
  source: string[]
  confidence: number
}

type TabType = 'boss' | 'global-memory' | 'memory' | 'consolidate'
type MemoryScope = 'global' | 'skill'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export default function MemoryPage() {
  const [activeTab, setActiveTab] = useState<TabType>('boss')

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部标题栏 */}
      <header className="h-14 border-b border-border bg-card flex items-center px-6">
        <h1 className="text-lg font-semibold text-foreground">记忆管理</h1>
      </header>

      {/* Tab 切换 */}
      <div className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-6">
          <nav className="flex gap-6">
            <TabButton
              active={activeTab === 'boss'}
              onClick={() => setActiveTab('boss')}
              label="老板手册"
              icon={<BookIcon />}
            />
            <TabButton
              active={activeTab === 'global-memory'}
              onClick={() => setActiveTab('global-memory')}
              label="全局记忆"
              icon={<BrainIcon />}
            />
            <TabButton
              active={activeTab === 'memory'}
              onClick={() => setActiveTab('memory')}
              label="记忆文件"
              icon={<MemoryIcon />}
            />
            <TabButton
              active={activeTab === 'consolidate'}
              onClick={() => setActiveTab('consolidate')}
              label="记忆归纳"
              icon={<ConsolidateIcon />}
            />
          </nav>
        </div>
      </div>

      {/* Tab 内容 */}
      <div className="max-w-4xl mx-auto p-6">
        {activeTab === 'boss' && <BossEditor />}
        {activeTab === 'global-memory' && <GlobalMemoryEditor />}
        {activeTab === 'memory' && <MemoryBrowser />}
        {activeTab === 'consolidate' && <MemoryConsolidator />}
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Tab 按钮组件                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 py-3 border-b-2 transition-colors ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </button>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           BOSS.md 编辑器                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function BossEditor() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadBoss()
  }, [])

  async function loadBoss() {
    try {
      const res = await fetch(`${AGENT_API_BASE}/boss`)
      const data = await res.json()
      setContent(data.content || '')
    } catch {
      setMessage({ type: 'error', text: '加载 BOSS.md 失败' })
    } finally {
      setLoading(false)
    }
  }

  async function saveBoss() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`${AGENT_API_BASE}/boss`, {
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

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div className="space-y-4">
      {/* 说明 */}
      <div className="bg-muted/50 rounded-lg p-4">
        <p className="text-sm text-muted-foreground">
          BOSS.md 是全局工作手册，所有 Labor 都会遵守这里的规范。
        </p>
      </div>

      {/* 消息提示 */}
      {message && <MessageBox type={message.type} text={message.text} />}

      {/* 编辑器 */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-full h-[500px] px-4 py-3 bg-card border border-border rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
        placeholder="# 老板工作手册&#10;&#10;在这里编写你的工作规范..."
      />

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <button
          onClick={saveBoss}
          disabled={saving}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {saving && <LoadingIcon />}
          保存
        </button>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           全局记忆编辑器 (MEMORY.md)                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function GlobalMemoryEditor() {
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
      const data = await res.json()
      setContent(data.content || '')
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

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div className="space-y-4">
      {/* 说明 */}
      <div className="bg-muted/50 rounded-lg p-4">
        <p className="text-sm text-muted-foreground">
          MEMORY.md 是全局长期记忆，Labor 会在这里记录重要的学习成果和经验。
        </p>
      </div>

      {/* 消息提示 */}
      {message && <MessageBox type={message.type} text={message.text} />}

      {/* 编辑器 */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-full h-[500px] px-4 py-3 bg-card border border-border rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
        placeholder="# 全局记忆&#10;&#10;Labor 会在这里记录重要的学习成果..."
      />

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <button
          onClick={saveGlobalMemory}
          disabled={saving}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {saving && <LoadingIcon />}
          保存
        </button>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Memory 浏览器                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function MemoryBrowser() {
  const [scope, setScope] = useState<MemoryScope>('global')
  const [skills, setSkills] = useState<Skill[]>([])
  const [selectedSkill, setSelectedSkill] = useState<string>('')
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
      const res = await fetch(`${AGENT_API_BASE}/skills`)
      const data = await res.json()
      setSkills(data.skills || [])
    } catch {
      // 忽略
    }
  }

  async function loadFiles() {
    // 如果是 skill 作用域但没有选择技能，不加载
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
    <div className="space-y-4">
      {/* 作用域选择 */}
      <div className="flex items-center gap-4">
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as MemoryScope)}
          className="px-3 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="global">全局记忆</option>
          <option value="skill">技能记忆</option>
        </select>

        {scope === 'skill' && (
          <select
            value={selectedSkill}
            onChange={(e) => setSelectedSkill(e.target.value)}
            className="px-3 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">选择技能...</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>{s.name || s.id}</option>
            ))}
          </select>
        )}
      </div>

      {/* 消息提示 */}
      {message && <MessageBox type={message.type} text={message.text} />}

      <div className="grid grid-cols-3 gap-4">
        {/* 文件列表 */}
        <div className="col-span-1 bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-muted/50 border-b border-border">
            <span className="text-sm font-medium text-foreground">文件列表</span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center"><LoadingSpinner /></div>
            ) : files.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">暂无记忆文件</div>
            ) : (
              files.map((file) => (
                <button
                  key={file.path}
                  onClick={() => loadFileContent(file)}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors ${
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
                <code className="bg-muted px-2 py-0.5 rounded">{selectedFile.displayName}</code>
              </div>
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="w-full h-[350px] px-4 py-3 bg-card border border-border rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <div className="flex justify-end">
                <button
                  onClick={saveFile}
                  disabled={saving}
                  className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving && <LoadingIcon />}
                  保存
                </button>
              </div>
            </>
          ) : (
            <div className="h-[400px] flex items-center justify-center text-muted-foreground text-sm">
              选择左侧文件进行编辑
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           记忆归纳组件                                    │
 * │                                                                          │
 * │  分析每日记忆 → 生成候选 → 用户确认 → 写入长期记忆                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function MemoryConsolidator() {
  const [scope, setScope] = useState<MemoryScope>('global')
  const [skills, setSkills] = useState<Skill[]>([])
  const [selectedSkill, setSelectedSkill] = useState<string>('')
  const [candidates, setCandidates] = useState<ConsolidationCandidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [consolidating, setConsolidating] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadSkills()
  }, [])

  async function loadSkills() {
    try {
      const res = await fetch(`${AGENT_API_BASE}/skills`)
      const data = await res.json()
      setSkills(data.skills || [])
    } catch {
      // 忽略
    }
  }

  async function analyze() {
    if (scope === 'skill' && !selectedSkill) return
    setLoading(true)
    setMessage(null)
    setCandidates([])
    setSelected(new Set())
    try {
      const params = new URLSearchParams({ scope })
      if (scope === 'skill' && selectedSkill) params.set('skillId', selectedSkill)
      const res = await fetch(`${AGENT_API_BASE}/memory/consolidation-candidates?${params}`)
      const data = await res.json()
      setCandidates(data.candidates || [])
      if (data.candidates?.length === 0) {
        setMessage({ type: 'success', text: '暂无可归纳的记忆模式' })
      }
    } catch {
      setMessage({ type: 'error', text: '分析失败' })
    } finally {
      setLoading(false)
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function selectAll() {
    setSelected(new Set(candidates.map(c => c.id)))
  }

  async function consolidate() {
    if (selected.size === 0) return
    setConsolidating(true)
    setMessage(null)
    try {
      const res = await fetch(`${AGENT_API_BASE}/memory/consolidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateIds: Array.from(selected),
          scope,
          skillId: scope === 'skill' ? selectedSkill : undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: `已归纳 ${data.consolidated} 条记忆` })
        setCandidates(prev => prev.filter(c => !selected.has(c.id)))
        setSelected(new Set())
      }
    } catch {
      setMessage({ type: 'error', text: '归纳失败' })
    } finally {
      setConsolidating(false)
    }
  }

  async function reject() {
    if (selected.size === 0) return
    try {
      await fetch(`${AGENT_API_BASE}/memory/reject-candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIds: Array.from(selected) }),
      })
      setCandidates(prev => prev.filter(c => !selected.has(c.id)))
      setSelected(new Set())
    } catch {
      setMessage({ type: 'error', text: '操作失败' })
    }
  }

  return (
    <div className="space-y-4">
      {/* 说明 */}
      <div className="bg-muted/50 rounded-lg p-4">
        <p className="text-sm text-muted-foreground">
          分析最近的每日记忆，提取重复出现的模式，归纳为长期记忆。
        </p>
      </div>

      {/* 作用域选择 + 分析按钮 */}
      <div className="flex items-center gap-4">
        <select
          value={scope}
          onChange={(e) => { setScope(e.target.value as MemoryScope); setCandidates([]) }}
          className="px-3 py-2 bg-card border border-border rounded-lg text-sm"
        >
          <option value="global">全局记忆</option>
          <option value="skill">技能记忆</option>
        </select>

        {scope === 'skill' && (
          <select
            value={selectedSkill}
            onChange={(e) => { setSelectedSkill(e.target.value); setCandidates([]) }}
            className="px-3 py-2 bg-card border border-border rounded-lg text-sm"
          >
            <option value="">选择技能...</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>{s.name || s.id}</option>
            ))}
          </select>
        )}

        <button
          onClick={analyze}
          disabled={loading || (scope === 'skill' && !selectedSkill)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          {loading && <LoadingIcon />}
          分析记忆
        </button>
      </div>

      {/* 消息提示 */}
      {message && <MessageBox type={message.type} text={message.text} />}

      {/* 候选列表 */}
      {candidates.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              发现 {candidates.length} 个可归纳的模式
            </span>
            <button onClick={selectAll} className="text-sm text-primary hover:underline">
              全选
            </button>
          </div>

          <div className="space-y-2">
            {candidates.map((c) => (
              <div
                key={c.id}
                onClick={() => toggleSelect(c.id)}
                className={`p-4 bg-card border rounded-lg cursor-pointer transition-colors ${
                  selected.has(c.id) ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleSelect(c.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{c.category}</span>
                      <span className="text-xs text-muted-foreground">
                        置信度: {Math.round(c.confidence * 100)}%
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{c.content}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      来源: {c.source.slice(0, 3).join(', ')}{c.source.length > 3 ? '...' : ''}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-end gap-3">
            <button
              onClick={reject}
              disabled={selected.size === 0}
              className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-accent disabled:opacity-50"
            >
              忽略选中
            </button>
            <button
              onClick={consolidate}
              disabled={selected.size === 0 || consolidating}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {consolidating && <LoadingIcon />}
              确认归纳 ({selected.size})
            </button>
          </div>
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
      <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
    </div>
  )
}

function LoadingIcon() {
  return (
    <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
  )
}

function MessageBox({ type, text }: { type: 'success' | 'error'; text: string }) {
  return (
    <div className={`p-4 rounded-lg ${
      type === 'success'
        ? 'bg-green-500/10 text-green-600 border border-green-500/20'
        : 'bg-red-500/10 text-red-600 border border-red-500/20'
    }`}>
      {text}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           作用域标签                                      │
 * │                                                                          │
 * │  全局记忆：蓝色标签 | 技能记忆：紫色标签                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ScopeTag({ scope }: { scope: 'global' | 'skill' }) {
  const isGlobal = scope === 'global'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
      isGlobal
        ? 'bg-blue-500/10 text-blue-600'
        : 'bg-purple-500/10 text-purple-600'
    }`}>
      {isGlobal ? '全局' : '技能'}
    </span>
  )
}

function BookIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  )
}

function MemoryIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function BrainIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  )
}

function ConsolidateIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  )
}
