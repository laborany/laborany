import type { ConfigGroupId, ConfigTemplate, TemplateGroup } from './types'
import { SettingsCard } from './SettingsCard'
import { AddConfigItem } from './AddConfigItem'
import { renderFields } from './FieldRow'

export function SystemSection({
  groups,
  groupedKeys,
  advancedKeys,
  allKeys,
  template,
  editValues,
  showValues,
  showAdvanced,
  setShowAdvanced,
  toggleShowValue,
  handleChange,
  isFieldVisible,
  onAddConfigItem,
}: {
  groups: TemplateGroup[]
  groupedKeys: Record<ConfigGroupId, string[]>
  advancedKeys: string[]
  allKeys: Set<string>
  template: Record<string, ConfigTemplate>
  editValues: Record<string, string>
  showValues: Record<string, boolean>
  showAdvanced: boolean
  setShowAdvanced: (v: boolean) => void
  toggleShowValue: (key: string) => void
  handleChange: (key: string, value: string) => void
  isFieldVisible: (key: string) => boolean
  onAddConfigItem: (key: string) => void
}) {
  const fieldOpts = { template, editValues, showValues, onToggleShow: toggleShowValue, onChange: handleChange, isFieldVisible }

  return (
    <div className="space-y-6">
      <SettingsCard
        title={groups.find(g => g.id === 'system')?.title || '系统参数'}
        description={groups.find(g => g.id === 'system')?.description || '系统级配置'}
      >
        {renderFields(groupedKeys.system, fieldOpts)}
      </SettingsCard>

      <SettingsCard
        title={groups.find(g => g.id === 'advanced')?.title || '高级配置'}
        description={groups.find(g => g.id === 'advanced')?.description || '自定义环境变量'}
        action={
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="px-3 py-1.5 bg-background border border-border rounded text-sm hover:bg-muted"
          >
            {showAdvanced ? '收起' : '展开'}
          </button>
        }
      >
        {showAdvanced ? (
          <div className="space-y-4">
            {renderFields(advancedKeys, fieldOpts)}
            <div className="pt-2 border-t border-border">
              <AddConfigItem
                onAdd={onAddConfigItem}
                existingKeys={allKeys}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            高级配置默认折叠，避免干扰常用设置。展开后可编辑所有未分组变量并新增自定义项。
          </p>
        )}
      </SettingsCard>
    </div>
  )
}
