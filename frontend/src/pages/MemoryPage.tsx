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
type PreferenceSource = 'manual' | 'auto' | 'none'
type ReplyLanguageValue = '' | 'zh' | 'en'
type ReplyStyleValue = '' | 'brief' | 'detailed'

interface AddressingSettingsData {
  preferredName: string
  fallbackMode: 'boss'
  source: PreferenceSource
  updatedAt: string | null
}

interface CommunicationPreferenceFieldData<T extends string> {
  value: T | ''
  source: PreferenceSource
  updatedAt: string | null
}

interface CommunicationPreferenceSettingsData {
  replyLanguage: CommunicationPreferenceFieldData<'zh' | 'en'>
  replyStyle: CommunicationPreferenceFieldData<'brief' | 'detailed'>
}

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

      <div className="flex">
        <aside className="sticky top-14 h-[calc(100vh-3.5rem)] w-52 shrink-0 overflow-y-auto border-r border-border bg-background">
          <div className="px-3 pt-4 pb-2">
            <span className="text-xs font-semibold tracking-wider text-muted-foreground">记忆</span>
          </div>
          <nav className="space-y-0.5 p-2">
            <TabButton
              active={activeTab === 'boss'}
              onClick={() => setActiveTab('boss')}
              label="工作手册"
              icon={<BookIcon />}
              testId="memory-tab-boss"
            />
            <TabButton
              active={activeTab === 'profile'}
              onClick={() => setActiveTab('profile')}
              label="我的画像"
              icon={<BrainIcon />}
              testId="memory-tab-profile"
            />
            <TabButton
              active={activeTab === 'archive'}
              onClick={() => setActiveTab('archive')}
              label="记忆档案"
              icon={<ArchiveIcon />}
              testId="memory-tab-archive"
            />
          </nav>
        </aside>

        <div className="min-w-0 flex-1 p-6">
          <div className="max-w-4xl space-y-6">
            {activeTab === 'boss' && <BossEditor />}
            {activeTab === 'profile' && <ProfileTab />}
            {activeTab === 'archive' && <MemoryArchiveTab />}
          </div>
        </div>
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
  testId,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon: React.ReactNode
  testId?: string
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  )
}

function getSourceLabel(source: PreferenceSource): string {
  if (source === 'manual') return '手动设置'
  if (source === 'auto') return '对话自动学习'
  return '默认'
}

function formatMetaLine(source: PreferenceSource, updatedAt: string | null): string {
  if (!updatedAt) return `当前来源：${getSourceLabel(source)}`
  return `当前来源：${getSourceLabel(source)} · 更新时间：${new Date(updatedAt).toLocaleString()}`
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                         默认称呼设置                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function AddressingSettingsCard() {
  const [preferredName, setPreferredName] = useState('')
  const [meta, setMeta] = useState<AddressingSettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    void loadAddressing()
  }, [])

  async function loadAddressing() {
    try {
      const res = await fetch(`${AGENT_API_BASE}/addressing`)
      if (!res.ok) {
        setMessage({ type: 'error', text: '加载默认称呼失败' })
        return
      }

      const data = await res.json() as AddressingSettingsData
      setMeta(data)
      setPreferredName(data.preferredName || '')
    } catch {
      setMessage({ type: 'error', text: '加载默认称呼失败' })
    } finally {
      setLoading(false)
    }
  }

  async function saveAddressing() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`${AGENT_API_BASE}/addressing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredName }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '保存默认称呼失败' })
        return
      }

      setMeta(data)
      setPreferredName(data.preferredName || '')
      setMessage({ type: 'success', text: '后续对话会优先使用这个称呼' })
    } catch {
      setMessage({ type: 'error', text: '保存默认称呼失败' })
    } finally {
      setSaving(false)
    }
  }

  async function resetAddressing() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`${AGENT_API_BASE}/addressing`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '恢复默认称呼失败' })
        return
      }

      setMeta(data)
      setPreferredName('')
      setMessage({ type: 'success', text: '已恢复默认称呼“老板”' })
    } catch {
      setMessage({ type: 'error', text: '恢复默认称呼失败' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div data-testid="addressing-settings-card" className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">默认称呼</h2>
        <p className="text-sm text-muted-foreground">
          设置后，后续对话会优先按这个名字称呼你；如果还没设置，默认回退为“老板”。
        </p>
        <p className="text-xs text-muted-foreground">
          你也可以在对话里直接说“请叫我 Nathan”或“我叫 Nathan”，系统会自动学习。
        </p>
      </div>

      {message && <MessageBox type={message.type} text={message.text} />}

      <div className="space-y-2">
        <label htmlFor="preferred-name" className="text-sm font-medium text-foreground">
          默认怎么称呼我
        </label>
        <input
          id="preferred-name"
          value={preferredName}
          onChange={(e) => setPreferredName(e.target.value)}
          placeholder="例如：Nathan"
          data-testid="preferred-name-input"
          className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {meta?.updatedAt && (
        <p className="text-xs text-muted-foreground">
          {formatMetaLine(meta.source, meta.updatedAt)}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <button
          onClick={resetAddressing}
          disabled={saving}
          data-testid="addressing-reset-button"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          恢复默认
        </button>
        <button
          onClick={saveAddressing}
          disabled={saving}
          data-testid="addressing-save-button"
          className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving && <LoadingIcon />}
          保存称呼
        </button>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                         默认回复偏好设置                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function CommunicationPreferenceSettingsCard() {
  const [replyLanguage, setReplyLanguage] = useState<ReplyLanguageValue>('')
  const [replyStyle, setReplyStyle] = useState<ReplyStyleValue>('')
  const [meta, setMeta] = useState<CommunicationPreferenceSettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    void loadPreferences()
  }, [])

  async function loadPreferences() {
    try {
      const res = await fetch(`${AGENT_API_BASE}/communication-preferences`)
      if (!res.ok) {
        setMessage({ type: 'error', text: '加载默认回复偏好失败' })
        return
      }

      const data = await res.json() as CommunicationPreferenceSettingsData
      setMeta(data)
      setReplyLanguage(data.replyLanguage?.value || '')
      setReplyStyle(data.replyStyle?.value || '')
    } catch {
      setMessage({ type: 'error', text: '加载默认回复偏好失败' })
    } finally {
      setLoading(false)
    }
  }

  async function savePreferences() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`${AGENT_API_BASE}/communication-preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyLanguage, replyStyle }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '保存默认回复偏好失败' })
        return
      }

      setMeta(data)
      setReplyLanguage(data.replyLanguage?.value || '')
      setReplyStyle(data.replyStyle?.value || '')
      setMessage({ type: 'success', text: '后续对话会优先按这个默认回复偏好处理' })
    } catch {
      setMessage({ type: 'error', text: '保存默认回复偏好失败' })
    } finally {
      setSaving(false)
    }
  }

  async function resetPreferences() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`${AGENT_API_BASE}/communication-preferences`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '恢复默认回复偏好失败' })
        return
      }

      setMeta(data)
      setReplyLanguage('')
      setReplyStyle('')
      setMessage({ type: 'success', text: '已恢复默认回复偏好' })
    } catch {
      setMessage({ type: 'error', text: '恢复默认回复偏好失败' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div data-testid="communication-preferences-card" className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">默认回复偏好</h2>
        <p className="text-sm text-muted-foreground">
          这里设置的是全局默认值：没特殊说明时，LaborAny 会优先按这里的语言和风格回复你。
        </p>
        <p className="text-xs text-muted-foreground">
          你也可以在对话里直接说“以后都用中文回复我”或“后续尽量简洁一点”，系统会自动同步更新。
        </p>
      </div>

      {message && <MessageBox type={message.type} text={message.text} />}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="reply-language" className="text-sm font-medium text-foreground">
            默认回复语言
          </label>
          <select
            id="reply-language"
            value={replyLanguage}
            onChange={(e) => setReplyLanguage(e.target.value as ReplyLanguageValue)}
            data-testid="reply-language-select"
            className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">默认跟随任务上下文</option>
            <option value="zh">优先中文</option>
            <option value="en">优先英文</option>
          </select>
          <p className="text-xs text-muted-foreground">
            {formatMetaLine(meta?.replyLanguage.source || 'none', meta?.replyLanguage.updatedAt || null)}
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="reply-style" className="text-sm font-medium text-foreground">
            默认回复风格
          </label>
          <select
            id="reply-style"
            value={replyStyle}
            onChange={(e) => setReplyStyle(e.target.value as ReplyStyleValue)}
            data-testid="reply-style-select"
            className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">默认按任务需要展开</option>
            <option value="brief">尽量简洁</option>
            <option value="detailed">尽量详细</option>
          </select>
          <p className="text-xs text-muted-foreground">
            {formatMetaLine(meta?.replyStyle.source || 'none', meta?.replyStyle.updatedAt || null)}
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={resetPreferences}
          disabled={saving}
          data-testid="communication-preferences-reset-button"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          恢复默认
        </button>
        <button
          onClick={savePreferences}
          disabled={saving}
          data-testid="communication-preferences-save-button"
          className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving && <LoadingIcon />}
          保存偏好
        </button>
      </div>
    </div>
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
      <AddressingSettingsCard />
      <CommunicationPreferenceSettingsCard />

      <div className="rounded-lg bg-muted/50 p-4">
        <p className="text-sm text-muted-foreground">
          BOSS.md 是全局工作手册，所有 Labor 都会遵守这里的规范；具体称呼和默认回复方式优先参考上面的设置。
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
