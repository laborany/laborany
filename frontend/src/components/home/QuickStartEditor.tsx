import { useMemo, useState } from 'react'
import {
  useQuickStartContext,
  type HomeCaseItem,
  type QuickStartItem,
} from '../../contexts/QuickStartContext'
import { useWorkers } from '../../hooks/useWorkers'
import type { CapabilityTargetType } from '../../types'

type CapabilityOption = {
  targetType: CapabilityTargetType
  targetId: string
  name: string
  icon: string
  description: string
}

function makeDraftFromOption(option: CapabilityOption): QuickStartItem {
  return {
    id: `draft-${option.targetType}-${option.targetId}`,
    targetType: option.targetType,
    targetId: option.targetId,
    icon: option.icon || '🔧',
    name: option.name,
    description: option.description,
  }
}

export function QuickStartEditor() {
  const {
    scenarios,
    addScenario,
    updateScenario,
    removeScenario,
    moveScenario,
    resetToDefault,
    isCustomized,
    maxItems,
  } = useQuickStartContext()
  const { workers, loading } = useWorkers()
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)

  const capabilityOptions = useMemo<CapabilityOption[]>(() => {
    return workers.map(worker => ({
      targetType: 'skill',
      targetId: worker.id,
      name: worker.name,
      icon: worker.icon || '🔧',
      description: worker.description || '',
    }))
  }, [workers])

  const selectedTargets = new Set(scenarios.map(item => `${item.targetType}:${item.targetId}`))
  const availableOptions = capabilityOptions.filter(
    option => !selectedTargets.has(`${option.targetType}:${option.targetId}`),
  )

  const selectedScenario = scenarios.find(scenario => scenario.id === selectedCaseId) || null

  const handleAdd = (option: CapabilityOption) => {
    if (scenarios.length >= maxItems) return
    addScenario(makeDraftFromOption(option))
  }

  return (
    <div className="space-y-4">
      <section>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">
            已选择 ({scenarios.length}/{maxItems})
          </span>
          {isCustomized && (
            <button
              onClick={resetToDefault}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              恢复默认
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {scenarios.map((scenario, index) => (
            <SelectedItem
              key={scenario.id}
              scenario={scenario}
              index={index}
              total={scenarios.length}
              selected={scenario.id === selectedCaseId}
              onSelect={() => setSelectedCaseId(scenario.id)}
              onRemove={() => {
                removeScenario(scenario.id)
                if (selectedCaseId === scenario.id) {
                  setSelectedCaseId(null)
                }
              }}
              onMoveUp={() => moveScenario(scenario.id, 'up')}
              onMoveDown={() => moveScenario(scenario.id, 'down')}
            />
          ))}
        </div>
      </section>

      {selectedScenario && (
        <ScenarioForm
          scenario={selectedScenario}
          options={capabilityOptions}
          onChange={patch => updateScenario(selectedScenario.id, patch)}
        />
      )}

      <section>
        <span className="text-sm text-muted-foreground mb-2 block">可添加的技能</span>

        {loading ? (
          <div className="text-sm text-muted-foreground">加载中...</div>
        ) : availableOptions.length === 0 ? (
          <div className="text-sm text-muted-foreground">暂无更多可添加项</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {availableOptions.map(option => (
              <button
                key={`${option.targetType}:${option.targetId}`}
                onClick={() => handleAdd(option)}
                className="px-2 py-1 rounded border border-border hover:border-primary/60 hover:bg-primary/5 text-left"
              >
                <div className="text-xs font-medium text-foreground">
                  {option.icon} {option.name}
                </div>
                {!!option.description && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">{option.description}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function ScenarioForm({
  scenario,
  options,
  onChange,
}: {
  scenario: QuickStartItem
  options: CapabilityOption[]
  onChange: (patch: Partial<HomeCaseItem>) => void
}) {
  const activeHasOption = options.some(option => option.targetId === scenario.targetId)

  return (
    <section className="p-3 border border-border rounded-lg bg-muted/20 space-y-3">
      <div className="text-sm font-medium text-foreground">编辑案例</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs text-muted-foreground space-y-1">
          <span>显示名称</span>
          <input
            type="text"
            value={scenario.name}
            onChange={event => onChange({ name: event.target.value })}
            className="w-full px-2 py-1.5 rounded border border-border bg-card text-foreground"
          />
        </label>

        <label className="text-xs text-muted-foreground space-y-1">
          <span>图标</span>
          <input
            type="text"
            value={scenario.icon}
            onChange={event => onChange({ icon: event.target.value })}
            className="w-full px-2 py-1.5 rounded border border-border bg-card text-foreground"
          />
        </label>

        <label className="text-xs text-muted-foreground space-y-1">
          <span>目标技能</span>
          <select
            value={activeHasOption ? scenario.targetId : ''}
            onChange={event => onChange({ targetId: event.target.value })}
            className="w-full px-2 py-1.5 rounded border border-border bg-card text-foreground"
          >
            {!activeHasOption && (
              <option value="" disabled>
                请选择目标技能
              </option>
            )}
            {options.map(option => (
              <option key={option.targetId} value={option.targetId}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <label className="md:col-span-2 text-xs text-muted-foreground space-y-1">
          <span>描述</span>
          <input
            type="text"
            value={scenario.description}
            onChange={event => onChange({ description: event.target.value })}
            className="w-full px-2 py-1.5 rounded border border-border bg-card text-foreground"
          />
        </label>
      </div>
    </section>
  )
}

interface SelectedItemProps {
  scenario: QuickStartItem
  index: number
  total: number
  selected: boolean
  onSelect: () => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

function SelectedItem({
  scenario,
  index,
  total,
  selected,
  onSelect,
  onRemove,
  onMoveUp,
  onMoveDown,
}: SelectedItemProps) {
  return (
    <div
      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg group border ${
        selected ? 'bg-primary/10 border-primary/40' : 'bg-muted/50 border-border'
      }`}
    >
      <button type="button" onClick={onSelect} className="flex items-center gap-1">
        <span>{scenario.icon}</span>
        <span className="text-sm font-medium">{scenario.name}</span>
        <span className="text-[10px] text-muted-foreground ml-1">技能</span>
      </button>
      <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={event => {
            event.stopPropagation()
            onMoveUp()
          }}
          disabled={index === 0}
          className="p-0.5 hover:bg-primary/20 rounded disabled:opacity-30"
          title="上移"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>

        <button
          type="button"
          onClick={event => {
            event.stopPropagation()
            onMoveDown()
          }}
          disabled={index === total - 1}
          className="p-0.5 hover:bg-primary/20 rounded disabled:opacity-30"
          title="下移"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <button
          type="button"
          onClick={event => {
            event.stopPropagation()
            onRemove()
          }}
          className="p-0.5 hover:bg-destructive/20 hover:text-destructive rounded"
          title="移除"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
