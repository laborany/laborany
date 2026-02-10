/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     能力网格 - 首页核心组件                               ║
 * ║                                                                          ║
 * ║  静态 2x4 网格，替代轮播，点击选中回调上层                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Link } from 'react-router-dom'
import { getCapabilityItems } from './capability-data'
import type { ShowcaseItem } from '../chat/ChatState'

const ITEMS = getCapabilityItems()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           组件类型                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface GridProps {
  onSelect: (item: ShowcaseItem) => void
  selectedId?: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           网格主组件                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function CapabilityGrid({ onSelect, selectedId }: GridProps) {
  return (
    <section className="mb-10">
      <GridHeader />
      <div className="grid grid-cols-4 gap-3">
        {ITEMS.map((item) => (
          <GridCard
            key={item.id}
            item={item}
            selected={item.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           标题区                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function GridHeader() {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-foreground">热门能力</h2>
      <Link to="/skills" className="text-sm text-primary hover:underline">
        查看全部
      </Link>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           选中状态样式映射                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const borderStyle = (selected: boolean) =>
  selected ? 'border-blue-500' : 'border-border'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           网格卡片                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function GridCard({ item, selected, onSelect }: {
  item: ShowcaseItem
  selected: boolean
  onSelect: (item: ShowcaseItem) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`text-left rounded-xl border ${borderStyle(selected)} bg-card p-4
        hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{item.icon}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
          {item.category}
        </span>
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">{item.name}</h3>
      <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
    </button>
  )
}
