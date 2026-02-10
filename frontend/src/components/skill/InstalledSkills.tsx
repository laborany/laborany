/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      已安装技能列表                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Link } from 'react-router-dom'
import type { Skill } from '../../types'
import { LaborAnyLogo } from '../ui/LaborAnyLogo'

interface InstalledSkillsProps {
  skills: Skill[]
  onConfigure: (id: string) => void
  onOptimize: (id: string) => void
  onUninstall: (id: string) => void
}

export function InstalledSkills({
  skills,
  onConfigure,
  onOptimize,
  onUninstall,
}: InstalledSkillsProps) {
  if (skills.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">还没有安装任何技能</p>
        <p className="text-sm text-muted-foreground/70">
          去官方技能库安装，或创建自定义技能
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {skills.map((skill) => (
        <div key={skill.id} className="card-hover p-6">
          <div className="flex items-start gap-4">
            <span className="text-3xl">{skill.icon || <LaborAnyLogo size={32} />}</span>
            <div className="flex-1">
              <h3 className="font-semibold text-lg text-foreground">
                {skill.name}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {skill.description}
              </p>
              {skill.category && (
                <span className="inline-block mt-2 px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded">
                  {skill.category}
                </span>
              )}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Link
              to={`/execute/${skill.id}`}
              className="btn-primary flex-1 text-center py-2 text-sm"
            >
              使用
            </Link>
            <button
              onClick={() => onOptimize(skill.id)}
              className="px-3 py-2 text-sm text-primary hover:text-primary/80 border border-primary/20 rounded-lg transition-colors"
              title="AI 优化"
            >
              优化
            </button>
            <button
              onClick={() => onConfigure(skill.id)}
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
            >
              配置
            </button>
            <button
              onClick={() => onUninstall(skill.id)}
              className="px-3 py-2 text-sm text-destructive hover:text-destructive/80 border border-destructive/20 rounded-lg transition-colors"
            >
              卸载
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
