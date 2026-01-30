/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         技能选择面板                                      ║
 * ║                                                                          ║
 * ║  侧边栏：展示可用技能，支持拖拽到画布添加节点                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect, useCallback } from 'react'
import { API_BASE } from '../../config'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface Skill {
  id: string
  name: string
  description: string
  icon?: string
}

interface SkillPanelProps {
  onAddSkill: (skill: Skill) => void
  skills: Skill[]
  onSkillsLoad: (skills: Skill[]) => void
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           面板组件                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export default function SkillPanel({ onAddSkill, skills, onSkillsLoad }: SkillPanelProps) {
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // 加载 Skills
  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`${API_BASE}/skill/list`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        onSkillsLoad(data.skills || [])
      } catch {
        // 静默处理
      } finally {
        setLoading(false)
      }
    }
    fetchSkills()
  }, [onSkillsLoad])

  // 过滤 Skills
  const filteredSkills = skills.filter(
    s => s.name.toLowerCase().includes(search.toLowerCase()) ||
         s.description.toLowerCase().includes(search.toLowerCase())
  )

  // 拖拽开始
  const handleDragStart = useCallback((e: React.DragEvent, skill: Skill) => {
    e.dataTransfer.setData('application/json', JSON.stringify(skill))
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  return (
    <div className="w-64 h-full bg-card border-r border-border flex flex-col">
      {/* 头部 */}
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-medium text-foreground mb-3">添加步骤</h2>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索技能..."
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {/* Skill 列表 */}
      <div className="flex-1 overflow-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            {search ? '未找到匹配的技能' : '暂无可用技能'}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSkills.map(skill => (
              <div
                key={skill.id}
                draggable
                onDragStart={e => handleDragStart(e, skill)}
                onClick={() => onAddSkill(skill)}
                className="p-3 bg-background border border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-accent/50 transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{skill.icon || '🔧'}</span>
                  <span className="font-medium text-sm text-foreground">{skill.name}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {skill.description}
                </p>
                <div className="mt-2 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  点击或拖拽添加
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 提示 */}
      <div className="p-3 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">
          拖拽技能到画布添加步骤
        </p>
      </div>
    </div>
  )
}
