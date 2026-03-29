/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      场景快捷入口卡片                                      ║
 * ║                                                                          ║
 * ║  功能：首页快速开始场景卡片，支持选择引用与自定义配置                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuickStartContext, type QuickStartItem } from '../../contexts/QuickStartContext'
import { getEmployeeDirectoryProfileById } from '../../lib/employeeDirectory'
import { QuickStartEditor } from './QuickStartEditor'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface ScenarioCardsProps {
  selectedId?: string
  onSelect?: (item: QuickStartItem) => void
  onSelectedCardPositionChange?: (position: { centerX: number } | null) => void
}

export function ScenarioCards({ selectedId, onSelect, onSelectedCardPositionChange }: ScenarioCardsProps) {
  const { scenarios, isCustomized } = useQuickStartContext()
  const [isEditing, setIsEditing] = useState(false)
  const rowRef = useRef<HTMLDivElement | null>(null)
  const selectedCardRef = useRef<HTMLButtonElement | null>(null)

  const reportSelectedCardPosition = useCallback(() => {
    if (!onSelectedCardPositionChange) return
    const row = rowRef.current
    const selectedCard = selectedCardRef.current
    if (!row || !selectedCard) {
      onSelectedCardPositionChange(null)
      return
    }

    const rowRect = row.getBoundingClientRect()
    const cardRect = selectedCard.getBoundingClientRect()
    onSelectedCardPositionChange({
      centerX: cardRect.left - rowRect.left + cardRect.width / 2,
    })
  }, [onSelectedCardPositionChange])

  useEffect(() => {
    if (isEditing) {
      onSelectedCardPositionChange?.(null)
      return
    }

    const rafId = window.requestAnimationFrame(reportSelectedCardPosition)
    window.addEventListener('resize', reportSelectedCardPosition)
    return () => {
      window.cancelAnimationFrame(rafId)
      window.removeEventListener('resize', reportSelectedCardPosition)
    }
  }, [isEditing, selectedId, scenarios.length, reportSelectedCardPosition, onSelectedCardPositionChange])

  return (
    <div>
      {/* ═══════════════════════════════════════════════════════════════════════
       * 标题栏
       * ═══════════════════════════════════════════════════════════════════════ */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">常安排的工作</h2>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {isEditing ? '完成' : '调整'}
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
        <div ref={rowRef} className="flex gap-3 overflow-x-auto px-1 pb-3 pt-1">
          {scenarios.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              selected={scenario.id === selectedId}
              onSelect={onSelect}
              buttonRef={scenario.id === selectedId ? (node) => { selectedCardRef.current = node } : undefined}
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
  buttonRef,
}: {
  scenario: QuickStartItem
  selected: boolean
  onSelect?: (item: QuickStartItem) => void
  buttonRef?: (node: HTMLButtonElement | null) => void
}) {
  const employee = getEmployeeDirectoryProfileById(
    scenario.targetId,
    scenario.name,
    scenario.description,
  )

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => onSelect?.(scenario)}
      className={
        `flex-shrink-0 w-36 rounded-2xl border p-4 text-center transition-all group ` +
        (selected
          ? 'border-primary bg-background shadow-[0_14px_32px_rgba(59,130,246,0.16)] ring-1 ring-primary/20'
          : 'border-border bg-card hover:border-primary/50 hover:shadow-md')
      }
      aria-pressed={selected}
    >
      <div className="text-3xl mb-2">{scenario.icon}</div>
      <div className="font-medium text-foreground text-sm group-hover:text-primary transition-colors">
        {employee.displayName}
      </div>
      <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
        {employee.roleTitle}
      </div>
    </button>
  )
}
