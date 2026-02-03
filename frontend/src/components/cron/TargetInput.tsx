/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     执行目标输入组件                                       ║
 * ║                                                                          ║
 * ║  选择 Skill 或 Workflow 作为执行目标                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import type { ExecutionTarget, TargetType } from '../../hooks/useCron'
import { API_BASE, AGENT_API_BASE } from '../../config'

interface Props {
  value: ExecutionTarget
  onChange: (target: ExecutionTarget) => void
}

interface SkillMeta {
  id: string
  name: string
  description?: string
  icon?: string
}

interface WorkflowMeta {
  id: string
  name: string
  description?: string
}

export function TargetInput({ value, onChange }: Props) {
  const [type, setType] = useState<TargetType>(value.type)
  const [skills, setSkills] = useState<SkillMeta[]>([])
  const [workflows, setWorkflows] = useState<WorkflowMeta[]>([])
  const [loading, setLoading] = useState(true)

  // 加载 Skills 和 Workflows 列表
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const token = localStorage.getItem('token')
        // Skills 从主 API 获取（包含用户创建的 skills）
        // Workflows 从 Agent API 获取
        const [skillsRes, workflowsRes] = await Promise.all([
          fetch(`${API_BASE}/skill/list`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${AGENT_API_BASE}/workflows`)
        ])

        if (skillsRes.ok) {
          const data = await skillsRes.json()
          setSkills(data.skills || [])
        }

        if (workflowsRes.ok) {
          const data = await workflowsRes.json()
          setWorkflows(data.workflows || [])
        }
      } catch (err) {
        console.error('加载目标列表失败:', err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  function handleTypeChange(newType: TargetType) {
    setType(newType)
    onChange({ type: newType, id: '', query: value.query })
  }

  function handleIdChange(id: string) {
    onChange({ ...value, id })
  }

  function handleQueryChange(query: string) {
    onChange({ ...value, query })
  }

  const items = type === 'skill' ? skills : workflows

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-foreground">
        执行目标 <span className="text-red-500">*</span>
      </label>

      {/* 类型选择 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleTypeChange('skill')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            type === 'skill'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-accent'
          }`}
        >
          🧪 Skill
        </button>
        <button
          type="button"
          onClick={() => handleTypeChange('workflow')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            type === 'workflow'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-accent'
          }`}
        >
          📊 Workflow
        </button>
      </div>

      {/* 目标选择 */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
          加载中...
        </div>
      ) : (
        <select
          value={value.id}
          onChange={(e) => handleIdChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">选择{type === 'skill' ? 'Skill' : 'Workflow'}...</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      )}

      {/* 执行内容 */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          执行内容 <span className="text-red-500">*</span>
        </label>
        <textarea
          value={value.query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder={type === 'skill' ? '输入要执行的任务描述...' : '输入工作流输入参数（JSON 格式）...'}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {type === 'skill'
            ? '描述你希望 AI 执行的任务'
            : '工作流的输入参数，JSON 格式'}
        </p>
      </div>
    </div>
  )
}
