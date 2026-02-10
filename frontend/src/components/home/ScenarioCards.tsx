/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      场景快捷入口卡片                                      ║
 * ║                                                                          ║
 * ║  功能：首页快速开始场景卡片，支持选择引用与自定义配置                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState } from 'react'
import { useQuickStartContext, type QuickStartItem } from '../../contexts/QuickStartContext'
import { QuickStartEditor } from './QuickStartEditor'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface ScenarioCardsProps {
  selectedId?: string
  onSelect?: (item: QuickStartItem) => void
}

export function ScenarioCards({ selectedId, onSelect }: ScenarioCardsProps) {
  const { scenarios, isCustomized } = useQuickStartContext()
  const [isEditing, setIsEditing] = useState(false)

  return (
    <div className="mb-8">
      {/* ═══════════════════════════════════════════════════════════════════════
       * 标题栏
       * ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">快速开始</h2>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {isEditing ? '完成' : '自定义'}
          {isCustomized && !isEditing && (
            <span className="ml-1 text-xs text-primary">•</span>
          )}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
       * 编辑模式 / 展示模式
       * ═══════════════════════════════════════════════════════════════════════ */}
      {isEditing ? (
        <QuickStartEditor />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {scenarios.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              selected={scenario.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           场景卡片                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ScenarioCard({
  scenario,
  selected,
  onSelect,
}: {
  scenario: QuickStartItem
  selected: boolean
  onSelect?: (item: QuickStartItem) => void
}) {
  const typeLabel = scenario.targetType === 'workflow' ? '任务流' : '技能'

  return (
    <button
      type="button"
      onClick={() => onSelect?.(scenario)}
      className={
        `flex-shrink-0 w-32 p-4 rounded-xl bg-card border hover:shadow-md transition-all text-center group ` +
        (selected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50')
      }
      aria-pressed={selected}
    >
      <div className="text-3xl mb-2">{scenario.icon}</div>
      <div className="font-medium text-foreground text-sm group-hover:text-primary transition-colors">
        {scenario.name}
      </div>
      <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
        {scenario.description}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">{typeLabel}</div>
    </button>
  )
}
