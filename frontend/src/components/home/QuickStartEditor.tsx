/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      首页案例编辑器                                      ║
 * ║                                                                          ║
 * ║  功能：自定义首页案例映射（名称/图标/描述/目标类型/目标）                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useEffect, useMemo, useState } from 'react'
import {
  useQuickStartContext,
  type HomeCaseItem,
  type QuickStartItem,
} from '../../contexts/QuickStartContext'
import { useWorkers } from '../../hooks/useWorkers'
import { useWorkflowList } from '../../hooks/useWorkflow'

type CapabilityOption = {
  targetType: 'skill' | 'workflow'
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
  const { workers, loading: skillsLoading } = useWorkers()
  const { workflows, loading: workflowsLoading, fetchWorkflows } = useWorkflowList()
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)

  useEffect(() => {
    fetchWorkflows()
  }, [fetchWorkflows])

  const capabilityOptions = useMemo<CapabilityOption[]>(() => {
    const skillOptions: CapabilityOption[] = workers.map(worker => ({
      targetType: 'skill',
      targetId: worker.id,
      name: worker.name,
      icon: worker.icon || '🔧',
      description: worker.description || '',
    }))

    const workflowOptions: CapabilityOption[] = workflows.map(workflow => ({
      targetType: 'workflow',
      targetId: workflow.id,
      name: workflow.name,
      icon: workflow.icon || '🔄',
      description: workflow.description || '',
    }))

    return [...skillOptions, ...workflowOptions]
  }, [workers, workflows])

  const selectedTargets = new Set(scenarios.map(item => `${item.targetType}:${item.targetId}`))
  const availableOptions = capabilityOptions.filter(
    option => !selectedTargets.has(`${option.targetType}:${option.targetId}`),
  )

  const selectedScenario = scenarios.find(s => s.id === selectedCaseId) || null

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
          onChange={(patch) => updateScenario(selectedScenario.id, patch)}
        />
      )}

      <section>
        <span className="text-sm text-muted-foreground mb-2 block">可添加的能力</span>

        {(skillsLoading || workflowsLoading) ? (
          <div className="text-sm text-muted-foreground">加载中...</div>
        ) : availableOptions.length === 0 ? (
          <div className="text-sm text-muted-foreground">暂无更多可添加项</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {availableOptions.map(option => (
              <button
                key={`${option.targetType}:${option.targetId}`}
                onClick={() => handleAdd(option)}
                disabled={scenarios.length >= maxItems}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-muted/50 hover:bg-muted rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{option.icon}</span>
                <span>{option.name}</span>
                <span className="text-xs text-muted-foreground">{option.targetType === 'workflow' ? '任务流' : '技能'}</span>
                <span className="text-muted-foreground">+</span>
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
  scenario: HomeCaseItem
  options: CapabilityOption[]
  onChange: (patch: Partial<HomeCaseItem>) => void
}) {
  const filtered = options.filter(option => option.targetType === scenario.targetType)
  const activeHasOption = filtered.some(option => option.targetId === scenario.targetId)

  const handleTargetTypeChange = (nextType: 'skill' | 'workflow') => {
    const nextOptions = options.filter(option => option.targetType === nextType)
    const nextTargetId = nextOptions[0]?.targetId || ''
    onChange({
      targetType: nextType,
      ...(nextTargetId ? { targetId: nextTargetId } : {}),
    })
  }

  return (
    <section className="rounded-lg border border-border p-3 space-y-3">
      <div className="text-sm font-medium text-foreground">编辑案例</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs text-muted-foreground space-y-1">
          <span>显示名称</span>
          <input
            type="text"
            value={scenario.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="w-full px-2 py-1.5 rounded border border-border bg-card text-foreground"
          />
        </label>

        <label className="text-xs text-muted-foreground space-y-1">
          <span>图标</span>
          <input
            type="text"
            value={scenario.icon}
            onChange={(e) => onChange({ icon: e.target.value })}
            className="w-full px-2 py-1.5 rounded border border-border bg-card text-foreground"
          />
        </label>

        <label className="text-xs text-muted-foreground space-y-1">
          <span>类型</span>
          <select
            value={scenario.targetType}
            onChange={(e) => handleTargetTypeChange(e.target.value as 'skill' | 'workflow')}
            className="w-full px-2 py-1.5 rounded border border-border bg-card text-foreground"
          >
            <option value="skill">技能</option>
            <option value="workflow">任务流</option>
          </select>
        </label>

        <label className="text-xs text-muted-foreground space-y-1">
          <span>目标</span>
          <select
            value={activeHasOption ? scenario.targetId : ''}
            onChange={(e) => onChange({ targetId: e.target.value })}
            className="w-full px-2 py-1.5 rounded border border-border bg-card text-foreground"
          >
            {!activeHasOption && (
              <option value="" disabled>
                请选择目标
              </option>
            )}
            {filtered.map(option => (
              <option key={`${option.targetType}:${option.targetId}`} value={option.targetId}>
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
            onChange={(e) => onChange({ description: e.target.value })}
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
      <span className="text-[10px] text-muted-foreground ml-1">
        {scenario.targetType === 'workflow' ? '任务流' : '技能'}
      </span>
      </button>
      <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMoveUp() }}
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
          onClick={(e) => { e.stopPropagation(); onMoveDown() }}
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
          onClick={(e) => { e.stopPropagation(); onRemove() }}
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
