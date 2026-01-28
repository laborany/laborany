/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      场景快捷入口卡片                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Link } from 'react-router-dom'

/** 场景定义 */
interface Scenario {
  id: string
  icon: string
  name: string
  description: string
  skillId?: string
}

/** 预设场景列表 */
const SCENARIOS: Scenario[] = [
  { id: 'expense', icon: '💰', name: '报销助理', description: '智能处理报销单据', skillId: 'expense-assistant' },
  { id: 'monitor', icon: '📈', name: '监控员', description: '实时监控数据变化', skillId: 'data-monitor' },
  { id: 'transfer', icon: '📋', name: '搬运工', description: '自动化数据迁移', skillId: 'data-transfer' },
  { id: 'social', icon: '📱', name: '运营分身', description: '社交媒体自动化', skillId: 'social-operator' },
]

export function ScenarioCards() {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-foreground mb-4">快速开始</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {SCENARIOS.map((scenario) => (
          <ScenarioCard key={scenario.id} scenario={scenario} />
        ))}
      </div>
    </div>
  )
}

function ScenarioCard({ scenario }: { scenario: Scenario }) {
  const href = scenario.skillId ? `/execute/${scenario.skillId}` : '/skills'

  return (
    <Link
      to={href}
      className="flex-shrink-0 w-32 p-4 rounded-xl bg-card border border-border hover:border-primary/50 hover:shadow-md transition-all text-center group"
    >
      <div className="text-3xl mb-2">{scenario.icon}</div>
      <div className="font-medium text-foreground text-sm group-hover:text-primary transition-colors">
        {scenario.name}
      </div>
      <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
        {scenario.description}
      </div>
    </Link>
  )
}
