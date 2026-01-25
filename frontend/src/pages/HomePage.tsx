/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         首页 - Skills 列表                                ║
 * ║                                                                          ║
 * ║  展示可用的 AI Skills，点击进入执行页面                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

interface Skill {
  id: string
  name: string
  description: string
  icon?: string
  category?: string
}

export default function HomePage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSkills()
  }, [])

  async function fetchSkills() {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/skill/list', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setSkills(data.skills || [])
    } catch {
      // 使用默认 Skill
      setSkills([
        {
          id: 'financial-report',
          name: '金融研报助手',
          description: '分析财报数据，生成专业的金融研究报告',
          icon: '📊',
          category: '金融',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 bg-gray-200 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">AI 助手</h2>
        <div className="flex items-center gap-4">
          <Link
            to="/skills"
            className="text-sm text-primary-600 hover:underline"
          >
            管理 Skills
          </Link>
          <Link
            to="/history"
            className="text-sm text-primary-600 hover:underline"
          >
            查看历史
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {skills.map((skill) => (
          <Link
            key={skill.id}
            to={`/execute/${skill.id}`}
            className="block p-6 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4">
              <span className="text-3xl">{skill.icon || '🤖'}</span>
              <div>
                <h3 className="font-semibold text-lg">{skill.name}</h3>
                <p className="text-sm text-gray-600 mt-1">{skill.description}</p>
                {skill.category && (
                  <span className="inline-block mt-2 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                    {skill.category}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {skills.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          暂无可用的 AI 助手
        </div>
      )}
    </div>
  )
}
