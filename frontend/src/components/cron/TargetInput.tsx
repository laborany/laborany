import { useEffect, useState } from 'react'
import type { ExecutionTarget } from '../../hooks/useCron'
import { API_BASE } from '../../config'

interface Props {
  value: ExecutionTarget
  onChange: (target: ExecutionTarget) => void
}

interface SkillMeta {
  id: string
  name: string
}

export function TargetInput({ value, onChange }: Props) {
  const [skills, setSkills] = useState<SkillMeta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const token = localStorage.getItem('token')
        const skillsRes = await fetch(`${API_BASE}/skill/list`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (skillsRes.ok) {
          const data = await skillsRes.json()
          setSkills(data.skills || [])
        }
      } catch (err) {
        console.error('加载目标列表失败:', err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  function handleIdChange(id: string) {
    onChange({ ...value, type: 'skill', id })
  }

  function handleQueryChange(query: string) {
    onChange({ ...value, type: 'skill', query })
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-foreground">
        执行目标 <span className="text-red-500">*</span>
      </label>

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
          <option value="">选择 Skill...</option>
          {skills.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      )}

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          执行内容 <span className="text-red-500">*</span>
        </label>
        <textarea
          value={value.query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="输入要执行的任务描述..."
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          描述你希望 AI 执行的任务
        </p>
      </div>
    </div>
  )
}
