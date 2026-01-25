/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         首页 - Skills 列表                                ║
 * ║                                                                          ║
 * ║  展示可用的 AI Skills，点击进入执行页面                                     ║
 * ║  设计：借鉴 workany 的现代化卡片布局                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

interface Skill {
  id: string
  name: string
  description: string
  icon?: string
  category?: string
}

export default function HomePage() {
  const { user } = useAuth()
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
      <div className="min-h-screen p-8">
        <div className="max-w-5xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-10 bg-muted rounded-lg w-1/3" />
            <div className="h-6 bg-muted rounded w-1/2" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-44 bg-muted rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        {/* 欢迎区域 */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            你好，{user?.name || '用户'} 👋
          </h1>
          <p className="text-muted-foreground text-lg">
            选择一个 AI 助手开始工作，或者
            <Link to="/skills" className="text-primary hover:underline mx-1">
              浏览更多 Skills
            </Link>
          </p>
        </div>

        {/* 快捷操作 */}
        <div className="mb-8">
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              to="/skills"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              安装新 Skill
            </Link>
            <Link
              to="/history"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              查看历史
            </Link>
          </div>
        </div>

        {/* Skills 网格 */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">已安装的 Skills</h2>
        </div>

        {skills.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">暂无可用的 AI 助手</h3>
            <p className="text-muted-foreground mb-4">前往 Skills 市场安装你需要的助手</p>
            <Link
              to="/skills"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              浏览 Skills
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {skills.map((skill) => (
              <Link
                key={skill.id}
                to={`/execute/${skill.id}`}
                className="group card-hover p-6 flex flex-col"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl flex-shrink-0">
                    {skill.icon || '🤖'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                      {skill.name}
                    </h3>
                    {skill.category && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-secondary text-secondary-foreground rounded-full">
                        {skill.category}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 flex-1">
                  {skill.description}
                </p>
                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">点击开始使用</span>
                  <svg
                    className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
