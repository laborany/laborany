/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Memory 管理页面                                   ║
 * ║                                                                          ║
 * ║  功能：工作手册 + 用户画像 + 记忆档案                                       ║
 * ║  设计：三 Tab 布局，渐进式披露                                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import { AGENT_API_BASE } from '../config/api'
import { ProfileTab } from '../components/memory/ProfileTab'
import { MemoryArchiveTab } from '../components/memory/MemoryArchiveTab'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
type TabType = 'boss' | 'profile' | 'archive'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export default function MemoryPage() {
  const [activeTab, setActiveTab] = useState<TabType>('boss')

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部标题栏 */}
      <header className="flex h-14 items-center border-b border-border bg-card px-6">
        <h1 className="text-lg font-semibold text-foreground">记忆管理</h1>
      </header>

      {/* Tab 切换 */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-4xl px-6">
          <nav className="flex gap-6">
            <TabButton
              active={activeTab === 'boss'}
              onClick={() => setActiveTab('boss')}
              label="工作手册"
              icon={<BookIcon />}
            />
            <TabButton
              active={activeTab === 'profile'}
              onClick={() => setActiveTab('profile')}
              label="我的画像"
              icon={<BrainIcon />}
            />
            <TabButton
              active={activeTab === 'archive'}
              onClick={() => setActiveTab('archive')}
              label="记忆档案"
              icon={<ArchiveIcon />}
            />
          </nav>
        </div>
      </div>

      {/* Tab 内容 */}
      <div className="mx-auto max-w-4xl p-6">
        {activeTab === 'boss' && <BossEditor />}
        {activeTab === 'profile' && <ProfileTab />}
        {activeTab === 'archive' && <MemoryArchiveTab />}
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
      className={`flex items-center gap-2 border-b-2 py-3 transition-colors ${
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
      if (res.status === 404) {
        // 文件不存在是正常的初始状态
        setContent('')
      } else if (res.ok) {
        const data = await res.json()
        setContent(data.content || '')
      } else {
        setMessage({ type: 'error', text: '加载 BOSS.md 失败' })
      }
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

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted/50 p-4">
        <p className="text-sm text-muted-foreground">
          BOSS.md 是全局工作手册，所有 Labor 都会遵守这里的规范。
        </p>
      </div>

      {message && <MessageBox type={message.type} text={message.text} />}

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="h-[500px] w-full resize-none rounded-lg border border-border bg-card px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        placeholder="# 老板工作手册&#10;&#10;在这里编写你的工作规范..."
      />

      <div className="flex justify-end">
        <button
          onClick={saveBoss}
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
function BookIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  )
}

function BrainIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  )
}

function ArchiveIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  )
}
