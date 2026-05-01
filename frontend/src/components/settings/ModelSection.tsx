import type { ModelCapability, ModelProfile } from '../../contexts/ModelProfileContext'
import type { BannerType, TemplateGroup } from './types'
import { SettingsCard } from './SettingsCard'
import { ModelWidgetSupportSummary } from '../shared/ModelWidgetSupportSummary'

const CAPABILITY_OPTIONS: Array<{ value: ModelCapability; label: string }> = [
  { value: 'text_chat', label: '文本对话' },
  { value: 'vision_understanding', label: '视觉理解' },
  { value: 'image_generation', label: '图片生成' },
  { value: 'video_generation', label: '视频生成' },
]

export function ModelSection({
  groups,
  editProfiles,
  activeProfileId,
  profilesMessage,
  savingProfiles,
  promotingProfileId,
  showProfileKeys,
  setShowProfileKeys,
  testingProfileId,
  profileTestResults,
  addProfile,
  removeProfile,
  moveProfile,
  updateProfile,
  toggleProfileCapability,
  setProfileAsCurrentDefault,
  testProfileConnection,
  saveModelProfiles,
}: {
  groups: TemplateGroup[]
  editProfiles: ModelProfile[]
  activeProfileId: string | null
  profilesMessage: { type: BannerType; text: string } | null
  savingProfiles: boolean
  promotingProfileId: string | null
  showProfileKeys: Record<string, boolean>
  setShowProfileKeys: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  testingProfileId: string | null
  profileTestResults: Record<string, { success: boolean; message: string }>
  addProfile: () => void
  removeProfile: (id: string) => void
  moveProfile: (id: string, dir: -1 | 1) => void
  updateProfile: (id: string, field: keyof ModelProfile, value: string) => void
  toggleProfileCapability: (id: string, capability: ModelCapability) => void
  setProfileAsCurrentDefault: (id: string) => void | Promise<void>
  testProfileConnection: (profile: ModelProfile) => void
  saveModelProfiles: () => void
}) {
  return (
    <SettingsCard
      title={groups.find(g => g.id === 'model')?.title || '模型服务'}
      description="管理多个模型配置，支持不同 API Key、Base URL 和模型名称。profiles[0] 为默认配置。"
      action={
        <button onClick={addProfile} className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90">
          + 新增配置
        </button>
      }
    >
      {profilesMessage && (
        <div className={`rounded-lg border p-3 text-sm ${
          profilesMessage.type === 'success'
            ? 'bg-green-500/10 text-green-700 border-green-500/20'
            : profilesMessage.type === 'warning'
              ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
              : 'bg-red-500/10 text-red-700 border-red-500/20'
        }`}>
          {profilesMessage.text}
        </div>
      )}

      <div className="space-y-4">
        {editProfiles.map((profile, idx) => (
          <div
            key={profile.id}
            data-testid={`model-profile-card-${profile.id}`}
            className="rounded-lg border border-border p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{profile.name || `配置 ${idx + 1}`}</span>
                {idx === 0 && (
                  <span
                    data-testid={`profile-default-badge-${profile.id}`}
                    className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                  >
                    默认
                  </span>
                )}
                {profile.id === activeProfileId && (
                  <span
                    data-testid={`profile-active-badge-${profile.id}`}
                    className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                  >
                    当前使用
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {(idx !== 0 || profile.id !== activeProfileId) && (
                  <button
                    type="button"
                    data-testid={`profile-promote-${profile.id}`}
                    onClick={() => void setProfileAsCurrentDefault(profile.id)}
                    disabled={savingProfiles || promotingProfileId === profile.id}
                    className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    title="将此配置切换为当前使用，并保存为默认配置"
                  >
                    {promotingProfileId === profile.id ? '切换中...' : '设为当前默认'}
                  </button>
                )}
                <button onClick={() => moveProfile(profile.id, -1)} disabled={idx === 0 || savingProfiles} className="p-1 rounded hover:bg-accent text-muted-foreground disabled:opacity-30" title="上移（提升优先级）">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                </button>
                <button onClick={() => moveProfile(profile.id, 1)} disabled={idx === editProfiles.length - 1 || savingProfiles} className="p-1 rounded hover:bg-accent text-muted-foreground disabled:opacity-30" title="下移">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                <button onClick={() => testProfileConnection(profile)} disabled={testingProfileId === profile.id || savingProfiles} className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                  {testingProfileId === profile.id ? '测试中...' : '测试'}
                </button>
                <button onClick={() => removeProfile(profile.id)} disabled={editProfiles.length <= 1 || savingProfiles} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-30" title="删除（至少保留一个）">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>

            <ModelWidgetSupportSummary profile={profile} showDescription />

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">名称 *</label>
                <input type="text" value={profile.name} onChange={e => updateProfile(profile.id, 'name', e.target.value)} placeholder="例如: Default" className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">接口格式</label>
                <select value={profile.interfaceType} onChange={e => updateProfile(profile.id, 'interfaceType', e.target.value)} className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="anthropic">Anthropic</option>
                  <option value="openai_compatible">OpenAI-compatible</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">模型名称</label>
                <input type="text" value={profile.model || ''} onChange={e => updateProfile(profile.id, 'model', e.target.value)} placeholder={profile.interfaceType === 'openai_compatible' ? 'gpt-4o-mini' : 'claude-sonnet-4-20250514'} className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">模型能力</label>
              <div className="flex flex-wrap gap-2">
                {CAPABILITY_OPTIONS.map((option) => {
                  const checked = profile.capabilities.includes(option.value)
                  return (
                    <label key={option.value} className="inline-flex items-center gap-2 rounded border border-border px-2.5 py-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProfileCapability(profile.id, option.value)}
                        className="rounded border-border"
                      />
                      <span>{option.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                API Key {idx === 0 && <span className="text-red-500">*</span>}
              </label>
              <div className="relative">
                <input type={showProfileKeys[profile.id] ? 'text' : 'password'} value={profile.apiKey} onChange={e => updateProfile(profile.id, 'apiKey', e.target.value)} placeholder={profile.interfaceType === 'openai_compatible' ? 'sk-...' : 'sk-ant-api03-...'} className="w-full rounded border border-border bg-background px-2 py-1.5 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <button type="button" onClick={() => setShowProfileKeys(prev => ({ ...prev, [profile.id]: !prev[profile.id] }))} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground">
                  {showProfileKeys[profile.id] ? '隐藏' : '显示'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Base URL（可选）</label>
              <input type="text" value={profile.baseUrl || ''} onChange={e => updateProfile(profile.id, 'baseUrl', e.target.value)} placeholder={profile.interfaceType === 'openai_compatible' ? 'https://api.openai.com/v1' : 'https://api.anthropic.com'} className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>

            {profileTestResults[profile.id] && (
              <p className={`text-xs ${profileTestResults[profile.id].success ? 'text-green-700' : 'text-red-700'}`}>
                {profileTestResults[profile.id].message}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-2">
        <button onClick={saveModelProfiles} disabled={savingProfiles} className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          {savingProfiles ? '保存中...' : '保存模型配置'}
        </button>
      </div>
    </SettingsCard>
  )
}
