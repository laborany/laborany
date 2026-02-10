/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      技能与工作流管理页面                                ║
 * ║                                                                          ║
 * ║  职责：统一展示技能 + 工作流，支持搜索、配置、创建                         ║
 * ║  设计：三 Tab 架构 —— 我的能力 | 官方市场 | 创建                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import type { Skill, OfficialSkill } from '../types'
import { parseErrorMessage, API_BASE } from '../config'
import { LaborAnyLogo } from '../components/ui/LaborAnyLogo'
import { TabButton } from '../components/shared/TabButton'
import { LoadingState } from '../components/shared/LoadingState'
import { OfficialMarket } from '../components/skill/OfficialMarket'
import { SkillConfigPanel } from '../components/skill/SkillConfigPanel'
import { OptimizeSkillChat } from '../components/create/OptimizeSkillChat'
import { useWorkflowList } from '../hooks/useWorkflow'
import type { Workflow } from '../hooks/useWorkflow'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型与常量                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
type TabType = 'mine' | 'official' | 'create'
type SubTab = 'skills' | 'workflows'

/* 分类标签渐变色映射 */
const CATEGORY_COLORS: Record<string, string> = {
  '写作':   'from-blue-500/20 to-blue-600/10 text-blue-700 dark:text-blue-300',
  '分析':   'from-green-500/20 to-green-600/10 text-green-700 dark:text-green-300',
  '开发':   'from-purple-500/20 to-purple-600/10 text-purple-700 dark:text-purple-300',
  '设计':   'from-pink-500/20 to-pink-600/10 text-pink-700 dark:text-pink-300',
  '效率':   'from-amber-500/20 to-amber-600/10 text-amber-700 dark:text-amber-300',
  default: 'from-gray-500/20 to-gray-600/10 text-gray-700 dark:text-gray-300',
}

function categoryColor(cat?: string) {
  return CATEGORY_COLORS[cat || ''] || CATEGORY_COLORS.default
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           搜索栏                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="搜索技能或工作流..."
        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           技能卡片                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function SkillCard({
  skill, onConfigure, onOptimize, onUninstall,
}: {
  skill: Skill
  onConfigure: (id: string) => void
  onOptimize: (id: string) => void
  onUninstall: (id: string) => void
}) {
  const navigate = useNavigate()

  return (
    <div
      onClick={() => navigate(`/execute/${skill.id}`)}
      className="group relative bg-card border border-border rounded-xl p-5 cursor-pointer hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all"
    >
      {/* 头部：图标 + 名称 */}
      <div className="flex items-start gap-3 mb-3">
        <span className="text-3xl shrink-0">{skill.icon || <LaborAnyLogo size={32} />}</span>
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground truncate">{skill.name}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{skill.description}</p>
        </div>
      </div>

      {/* 分类标签 */}
      {skill.category && (
        <span className={`inline-block px-2.5 py-0.5 text-xs font-medium rounded-full bg-gradient-to-r ${categoryColor(skill.category)}`}>
          {skill.category}
        </span>
      )}

      {/* 操作按钮 - 悬停显示 */}
      <div
        onClick={e => e.stopPropagation()}
        className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <button onClick={() => onOptimize(skill.id)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-primary" title="AI 优化">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        </button>
        <button onClick={() => onConfigure(skill.id)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground" title="配置">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </button>
        <button onClick={() => onUninstall(skill.id)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-destructive" title="卸载">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           工作流卡片                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function WorkflowMiniCard({ workflow }: { workflow: Workflow }) {
  const navigate = useNavigate()

  return (
    <div
      onClick={() => navigate(`/workflow-run/${workflow.id}`)}
      className="group bg-card border border-border rounded-xl p-5 cursor-pointer hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all"
    >
      <div className="flex items-start gap-3 mb-3">
        <span className="text-3xl shrink-0">{workflow.icon || '🔄'}</span>
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground truncate">{workflow.name}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
            {workflow.description || `${workflow.steps.length} 个步骤`}
          </p>
        </div>
      </div>

      {/* 步骤预览 */}
      <div className="flex items-center gap-1 flex-wrap">
        {workflow.steps.slice(0, 3).map((step, i) => (
          <span key={i} className="px-2 py-0.5 bg-accent rounded text-xs text-muted-foreground truncate max-w-[100px]">
            {step.name}
          </span>
        ))}
        {workflow.steps.length > 3 && (
          <span className="text-xs text-muted-foreground">+{workflow.steps.length - 3}</span>
        )}
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           空状态                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function EmptyState({ type }: { type: 'skills' | 'workflows' }) {
  const isSkill = type === 'skills'
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-4xl mb-4">{isSkill ? <LaborAnyLogo size={48} /> : '🔄'}</span>
      <p className="text-muted-foreground mb-4">
        {isSkill ? '还没有安装任何技能' : '还没有创建任何工作流'}
      </p>
      <Link
        to={isSkill ? '/create' : '/workflows/new'}
        className="btn-primary px-6 py-2.5 text-sm font-medium rounded-lg"
      >
        {isSkill ? '创建新技能' : '创建新工作流'}
      </Link>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           创建入口面板                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function CreatePanel() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-8">
      <Link to="/create" className="group block p-8 rounded-xl border border-border hover:border-primary/50 hover:shadow-lg transition-all text-center">
        <span className="text-4xl block mb-3"><LaborAnyLogo size={48} /></span>
        <h3 className="text-lg font-semibold text-foreground mb-2">创建新技能</h3>
        <p className="text-sm text-muted-foreground">通过对话描述你的需求，AI 帮你创建专属数字员工</p>
      </Link>
      <Link to="/workflows/new" className="group block p-8 rounded-xl border border-border hover:border-primary/50 hover:shadow-lg transition-all text-center">
        <span className="text-4xl block mb-3">🔄</span>
        <h3 className="text-lg font-semibold text-foreground mb-2">创建新工作流</h3>
        <p className="text-sm text-muted-foreground">将多个技能串联，构建自动化流水线</p>
      </Link>
    </div>
  )
}

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      主组件 - 技能与工作流管理                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */
export default function SkillsPage() {
  const [searchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as TabType) || 'mine'

  /* ── 技能状态 ── */
  const [skills, setSkills] = useState<Skill[]>([])
  const [officialSkills, setOfficialSkills] = useState<OfficialSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)
  const [subTab, setSubTab] = useState<SubTab>('skills')
  const [search, setSearch] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [optimizingSkill, setOptimizingSkill] = useState<string | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const [customUrl, setCustomUrl] = useState('')
  const [installError, setInstallError] = useState<string | null>(null)

  /* ── 工作流状态 ── */
  const { workflows, loading: wfLoading, fetchWorkflows } = useWorkflowList()

  useEffect(() => { fetchSkills() }, [])
  useEffect(() => { fetchWorkflows() }, [fetchWorkflows])
  useEffect(() => {
    if (activeTab === 'official' && officialSkills.length === 0) fetchOfficialSkills()
  }, [activeTab])

  /* ── 数据获取 ── */
  async function fetchSkills() {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/skill/list`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setSkills(data.skills || [])
    } catch { setSkills([]) }
    finally { setLoading(false) }
  }

  async function fetchOfficialSkills() {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/skill/official`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setOfficialSkills(data.skills || [])
    } catch { setOfficialSkills([]) }
  }

  async function installSkill(source: string) {
    setInstalling(source)
    setInstallError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/skill/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ source }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(parseErrorMessage(data, '安装失败'))
      }
      await fetchSkills()
      setActiveTab('mine')
      setCustomUrl('')
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : '安装失败')
    } finally { setInstalling(null) }
  }

  async function uninstallSkill(skillId: string) {
    const skillName = skills.find(skill => skill.id === skillId)?.name || skillId
    if (!confirm(`确定要卸载 "${skillName}" 吗？`)) return
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/skill/${skillId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(parseErrorMessage(data, '卸载失败'))
      }
      await fetchSkills()
    } catch (err) { console.error('卸载失败:', err) }
  }

  /* ── 搜索过滤 ── */
  const q = search.toLowerCase()
  const filteredSkills = useMemo(
    () => skills.filter(s => !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)),
    [skills, q]
  )
  const filteredWorkflows = useMemo(
    () => workflows.filter(w => !q || w.name.toLowerCase().includes(q) || (w.description || '').toLowerCase().includes(q)),
    [workflows, q]
  )

  const installedIds = new Set(skills.map(s => s.id))

  /* ── 配置详情页 ── */
  if (selectedSkill) {
    return <SkillConfigPanel skillId={selectedSkill} onBack={() => setSelectedSkill(null)} />
  }

  /* ── 优化对话页 ── */
  if (optimizingSkill) {
    const skill = skills.find(s => s.id === optimizingSkill)
    return (
      <OptimizeSkillChat
        skillId={optimizingSkill}
        skillName={skill?.name || optimizingSkill}
        onBack={() => setOptimizingSkill(null)}
        onComplete={() => { setOptimizingSkill(null); fetchSkills() }}
      />
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* 页头 */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-foreground">能力管理</h2>
        <Link to="/" className="text-sm text-primary hover:underline">返回首页</Link>
      </div>

      {/* 搜索栏 */}
      <div className="mb-6">
        <SearchBar value={search} onChange={setSearch} />
      </div>

      {/* 主 Tab */}
      <div className="border-b border-border mb-6">
        <nav className="flex gap-8">
          <TabButton active={activeTab === 'mine'} onClick={() => setActiveTab('mine')}>
            我的能力 ({skills.length + workflows.length})
          </TabButton>
          <TabButton active={activeTab === 'official'} onClick={() => setActiveTab('official')}>
            官方市场
          </TabButton>
          <TabButton active={activeTab === 'create'} onClick={() => setActiveTab('create')}>
            创建
          </TabButton>
        </nav>
      </div>

      {/* 内容区 */}
      {activeTab === 'mine' && (
        <MineContent
          subTab={subTab}
          onSubTabChange={setSubTab}
          skills={filteredSkills}
          workflows={filteredWorkflows}
          loading={loading || wfLoading}
          onConfigure={setSelectedSkill}
          onOptimize={setOptimizingSkill}
          onUninstall={uninstallSkill}
        />
      )}
      {activeTab === 'official' && (
        <OfficialMarket
          skills={officialSkills}
          installedIds={installedIds}
          installing={installing}
          customUrl={customUrl}
          installError={installError}
          onInstall={installSkill}
          onCustomUrlChange={setCustomUrl}
        />
      )}
      {activeTab === 'create' && <CreatePanel />}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           我的能力 - 子 Tab 内容                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function MineContent({
  subTab, onSubTabChange, skills, workflows, loading,
  onConfigure, onOptimize, onUninstall,
}: {
  subTab: SubTab
  onSubTabChange: (t: SubTab) => void
  skills: Skill[]
  workflows: Workflow[]
  loading: boolean
  onConfigure: (id: string) => void
  onOptimize: (id: string) => void
  onUninstall: (id: string) => void
}) {
  if (loading) return <LoadingState />

  return (
    <div>
      {/* 子 Tab 切换 */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => onSubTabChange('skills')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            subTab === 'skills'
              ? 'bg-primary text-primary-foreground'
              : 'bg-accent text-muted-foreground hover:text-foreground'
          }`}
        >
          技能 ({skills.length})
        </button>
        <button
          onClick={() => onSubTabChange('workflows')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            subTab === 'workflows'
              ? 'bg-primary text-primary-foreground'
              : 'bg-accent text-muted-foreground hover:text-foreground'
          }`}
        >
          工作流 ({workflows.length})
        </button>
      </div>

      {/* 技能网格 */}
      {subTab === 'skills' && (
        skills.length === 0
          ? <EmptyState type="skills" />
          : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {skills.map(s => (
                <SkillCard key={s.id} skill={s} onConfigure={onConfigure} onOptimize={onOptimize} onUninstall={onUninstall} />
              ))}
            </div>
      )}

      {/* 工作流网格 */}
      {subTab === 'workflows' && (
        workflows.length === 0
          ? <EmptyState type="workflows" />
          : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workflows.map(w => <WorkflowMiniCard key={w.id} workflow={w} />)}
            </div>
      )}
    </div>
  )
}
