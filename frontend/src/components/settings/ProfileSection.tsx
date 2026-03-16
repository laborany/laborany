import { SettingsCard } from './SettingsCard'

export function ProfileSection({
  profileName,
  setProfileName,
}: {
  profileName: string
  setProfileName: (v: string) => void
}) {
  return (
    <SettingsCard title="个人信息" description="用于本地模式显示昵称，不需要邮箱注册。">
      <label className="block text-sm font-medium text-foreground mb-1">本地名称</label>
      <input
        type="text"
        value={profileName}
        onChange={event => setProfileName(event.target.value)}
        placeholder="例如: Nathan"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
    </SettingsCard>
  )
}
