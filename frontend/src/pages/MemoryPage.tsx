/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Memory 管理页面                                   ║
 * ║                                                                          ║
 * ║  功能：BOSS.md 编辑 + Memory 文件浏览                                      ║
 * ║  设计：双 Tab 布局，简洁直观                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import { AGENT_API_BASE } from '../config/api'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface MemoryFile {
  name: string
  path: string
  date?: string
}

interface Skill {
  id: string
  name: string
}

type TabType = 'boss' | 'memory'
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
              active={activeTab === 'memory'}
              onClick={() => setActiveTab('memory')}
              label="记忆文件"
              icon={<MemoryIcon />}
            />
          </nav>
        </div>
      </div>

      {/* Tab 内容 */}
      <div className="max-w-4xl mx-auto p-6">
        {activeTab === 'boss' ? <BossEditor /> : <MemoryBrowser />}
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
                  {file.name}
                </button>
              ))
            )}
          </div>
        </div>

        {/* 文件内容 */}
        <div className="col-span-2 space-y-3">
          {selectedFile ? (
            <>
              <div className="text-sm text-muted-foreground">
                编辑: <code className="bg-muted px-2 py-0.5 rounded">{selectedFile.name}</code>
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
