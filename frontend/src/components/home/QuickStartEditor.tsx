/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      快速开始编辑器                                        ║
 * ║                                                                          ║
 * ║  功能：允许用户自定义首页快速开始场景                                        ║
 * ║  特性：选择/移除 skills、调整顺序、恢复默认                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useQuickStart, QuickStartItem } from '../../hooks/useQuickStart'
import { useWorkers } from '../../hooks/useWorkers'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function QuickStartEditor() {
  const {
    scenarios,
    addScenario,
    removeScenario,
    moveScenario,
    resetToDefault,
    isCustomized,
    maxItems,
  } = useQuickStart()

  const { workers, loading } = useWorkers()

  /* ═══════════════════════════════════════════════════════════════════════════
   * 已选中的 skill IDs
   * ═══════════════════════════════════════════════════════════════════════════ */
  const selectedIds = new Set(scenarios.map(s => s.skillId))

  /* ═══════════════════════════════════════════════════════════════════════════
   * 可选的 skills（排除已选中的）
   * ═══════════════════════════════════════════════════════════════════════════ */
  const availableSkills = workers.filter(w => !selectedIds.has(w.id))

  /* ═══════════════════════════════════════════════════════════════════════════
   * 添加 skill 到快速开始
   * ═══════════════════════════════════════════════════════════════════════════ */
  const handleAdd = (worker: typeof workers[0]) => {
    const item: QuickStartItem = {
      skillId: worker.id,
      icon: worker.icon || '🔧',
      name: worker.name,
      description: worker.description.slice(0, 50),
    }
    addScenario(item)
  }

  return (
    <div className="space-y-4">
      {/* ═══════════════════════════════════════════════════════════════════════
       * 已选中的场景
       * ═══════════════════════════════════════════════════════════════════════ */}
      <div>
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
              key={scenario.skillId}
              scenario={scenario}
              index={index}
              total={scenarios.length}
              onRemove={() => removeScenario(scenario.skillId)}
              onMoveUp={() => moveScenario(scenario.skillId, 'up')}
              onMoveDown={() => moveScenario(scenario.skillId, 'down')}
            />
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
       * 可选的 skills
       * ═══════════════════════════════════════════════════════════════════════ */}
      <div>
        <span className="text-sm text-muted-foreground mb-2 block">
          可添加的技能
        </span>

        {loading ? (
          <div className="text-sm text-muted-foreground">加载中...</div>
        ) : availableSkills.length === 0 ? (
          <div className="text-sm text-muted-foreground">暂无更多技能</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {availableSkills.map(worker => (
              <button
                key={worker.id}
                onClick={() => handleAdd(worker)}
                disabled={scenarios.length >= maxItems}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-muted/50 hover:bg-muted rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{worker.icon || '🔧'}</span>
                <span>{worker.name}</span>
                <span className="text-muted-foreground">+</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           已选中项                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface SelectedItemProps {
  scenario: QuickStartItem
  index: number
  total: number
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

function SelectedItem({
  scenario,
  index,
  total,
  onRemove,
  onMoveUp,
  onMoveDown,
}: SelectedItemProps) {
  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 rounded-lg group">
      {/* 图标和名称 */}
      <span>{scenario.icon}</span>
      <span className="text-sm font-medium">{scenario.name}</span>

      {/* 操作按钮 */}
      <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* 上移 */}
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          className="p-0.5 hover:bg-primary/20 rounded disabled:opacity-30"
          title="上移"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>

        {/* 下移 */}
        <button
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="p-0.5 hover:bg-primary/20 rounded disabled:opacity-30"
          title="下移"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* 移除 */}
        <button
          onClick={onRemove}
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
