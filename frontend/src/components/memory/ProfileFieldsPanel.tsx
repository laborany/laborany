/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     ProfileFieldsPanel 组件                              ║
 * ║                                                                          ║
 * ║  功能：展示画像字段（Profile Fields）列表                                 ║
 * ║  设计：点击展开查看字段详情和证据来源                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import { AGENT_API_BASE } from '../../config/api'

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

interface Props {
  onClose: () => void
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function ProfileFieldsPanel({ onClose }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    try {
      const res = await fetch(`${AGENT_API_BASE}/profile`)
      if (!res.ok) return
      const data = await res.json()
      setProfile(data.profile)
    } catch { /* 静默 */ } finally {
      setLoading(false)
    }
  }

  const hasData = profile?.sections.some(s => s.fields.length > 0)

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-medium">画像字段</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <CloseIcon />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : !hasData ? (
        <div className="p-8 text-center">
          <div className="text-muted-foreground">
            <BrainEmptyIcon />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">暂无用户画像数据</p>
          <p className="mt-1 text-xs text-muted-foreground">
            与 Labor 对话后，系统会自动学习你的偏好
          </p>
        </div>
      ) : (
        <div className="max-h-96 overflow-y-auto divide-y divide-border/50">
          {profile?.sections.map(section => (
            <ProfileSectionCard key={section.name} section={section} />
          ))}
        </div>
      )}
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
    <div className="py-1">
      <div className="flex items-center gap-2 px-4 py-2">
        <span className="text-muted-foreground">{sectionIcons[section.name] || <FolderIcon />}</span>
        <span className="text-sm font-medium">{section.name}</span>
        <span className="text-xs text-muted-foreground">({section.fields.length})</span>
      </div>
      <div className="divide-y divide-border/30">
        {section.fields.map(field => (
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
    <div className="px-4 py-2">
      <div
        className="flex cursor-pointer items-start justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{field.key}</span>
            <span className="text-xs text-muted-foreground">
              (来源: {field.evidences.length} 次对话)
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{field.description}</p>
        </div>
        <span className="p-1 text-muted-foreground">
          <svg
            className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </div>
      {expanded && field.evidences.length > 0 && (
        <div className="mt-1.5 rounded bg-muted/50 p-2">
          <div className="text-xs font-medium text-muted-foreground">证据来源:</div>
          <ul className="mt-1 space-y-0.5">
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
 * │                           图标组件                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function CloseIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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

function WorkIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )
}

function CodeIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  )
}
