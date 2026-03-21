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
import { getEmployeeDirectoryProfile } from '../lib/employeeDirectory'

type TabType = 'mine' | 'talent'

const CATEGORY_COLORS: Record<string, string> = {
  写作: 'from-blue-500/20 to-blue-600/10 text-blue-700 dark:text-blue-300',
  分析: 'from-green-500/20 to-green-600/10 text-green-700 dark:text-green-300',
  开发: 'from-purple-500/20 to-purple-600/10 text-purple-700 dark:text-purple-300',
  设计: 'from-pink-500/20 to-pink-600/10 text-pink-700 dark:text-pink-300',
  效率: 'from-amber-500/20 to-amber-600/10 text-amber-700 dark:text-amber-300',
  工具: 'from-gray-500/20 to-gray-600/10 text-gray-700 dark:text-gray-300',
  default: 'from-gray-500/20 to-gray-600/10 text-gray-700 dark:text-gray-300',
}

function categoryColor(category?: string) {
  return CATEGORY_COLORS[category || ''] || CATEGORY_COLORS.default
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder="搜索员工、岗位或擅长事务..."
        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
    </div>
  )
}

function SkillCard({
  skill,
  onConfigure,
  onOptimize,
  onUninstall,
}: {
  skill: Skill
  onConfigure: (id: string) => void
  onOptimize: (id: string) => void
  onUninstall: (id: string) => void
}) {
  const navigate = useNavigate()
  const employee = getEmployeeDirectoryProfile(skill)

  return (
    <div
      onClick={() => navigate(`/execute/${skill.id}`)}
      className="group relative bg-card border border-border rounded-xl p-5 cursor-pointer hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all"
    >
      <div className="flex items-start gap-3 mb-3">
        <span className="text-3xl shrink-0">{skill.icon || <LaborAnyLogo size={32} />}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground truncate">{employee.displayName}</h3>
            {(employee.tags || []).slice(0, 2).map((tag) => (
              <span
                key={tag}
                className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full bg-gradient-to-r ${categoryColor(tag)}`}
              >
                {tag}
              </span>
            ))}
          </div>
          <p className="text-xs text-primary mt-1">{employee.roleTitle}</p>
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{employee.summary}</p>
        </div>
      </div>

      <div
        onClick={event => event.stopPropagation()}
        className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <button onClick={() => onOptimize(skill.id)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-primary" title="让 HR 协助提升">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        </button>
        <button onClick={() => onConfigure(skill.id)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground" title="查看员工档案">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </button>
        <button onClick={() => onUninstall(skill.id)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-destructive" title="办理离职">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-4xl mb-4"><LaborAnyLogo size={48} /></span>
      <p className="text-muted-foreground mb-4">公司里还没有可上岗的数字员工</p>
      <Link to="/create" className="btn-primary px-6 py-2.5 text-sm font-medium rounded-lg">
        联系 HR 招聘
      </Link>
    </div>
  )
}

function TalentMarketPanel({
  skills,
  installedIds,
  installing,
  customUrl,
  installError,
  onInstall,
  onCustomUrlChange,
}: {
  skills: OfficialSkill[]
  installedIds: Set<string>
  installing: string | null
  customUrl: string
  installError: string | null
  onInstall: (source: string) => void
  onCustomUrlChange: (value: string) => void
}) {
  return (
    <div className="space-y-6 py-2">
      <Link to="/create" className="group block p-6 rounded-xl border border-border hover:border-primary/50 hover:shadow-lg transition-all">
        <div className="flex items-start gap-4">
          <span className="text-4xl shrink-0">🧑‍💼</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold text-foreground">人力专员</h3>
              <span className="inline-block px-2 py-0.5 text-[10px] font-medium rounded-full bg-primary/10 text-primary">
                HR
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              负责招聘新员工、补齐岗位能力，也能帮你为现有同事做培训和升级。
            </p>
            <p className="text-sm text-primary mt-3">联系 HR 处理招聘或员工升级</p>
          </div>
        </div>
      </Link>

      <div>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-foreground">人才市场</h3>
          <p className="text-sm text-muted-foreground mt-1">
            从候选人才库中引进新同事，或通过安装外部员工包扩充公司岗位能力。
          </p>
        </div>
        <OfficialMarket
          skills={skills}
          installedIds={installedIds}
          installing={installing}
          customUrl={customUrl}
          installError={installError}
          onInstall={onInstall}
          onCustomUrlChange={onCustomUrlChange}
        />
      </div>
    </div>
  )
}

function MineContent({
  skills,
  loading,
  onConfigure,
  onOptimize,
  onUninstall,
}: {
  skills: Skill[]
  loading: boolean
  onConfigure: (id: string) => void
  onOptimize: (id: string) => void
  onUninstall: (id: string) => void
}) {
  if (loading) return <LoadingState />
  if (skills.length === 0) return <EmptyState />

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {skills.map(skill => (
        <SkillCard
          key={skill.id}
          skill={skill}
          onConfigure={onConfigure}
          onOptimize={onOptimize}
          onUninstall={onUninstall}
        />
      ))}
    </div>
  )
}

export default function SkillsPage() {
  const [searchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as TabType) || 'mine'

  const [skills, setSkills] = useState<Skill[]>([])
  const [officialSkills, setOfficialSkills] = useState<OfficialSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)
  const [search, setSearch] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [optimizingSkill, setOptimizingSkill] = useState<string | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const [customUrl, setCustomUrl] = useState('')
  const [installError, setInstallError] = useState<string | null>(null)
  const [installSuccess, setInstallSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetchSkills()
  }, [])

  useEffect(() => {
    if (activeTab === 'talent' && officialSkills.length === 0) {
      fetchOfficialSkills()
    }
  }, [activeTab, officialSkills.length])

  async function fetchSkills() {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/skill/list`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      setSkills(data.skills || [])
    } catch {
      setSkills([])
    } finally {
      setLoading(false)
    }
  }

  async function fetchOfficialSkills() {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/skill/official`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      setOfficialSkills(data.skills || [])
    } catch {
      setOfficialSkills([])
    }
  }

  async function installSkill(source: string) {
    setInstalling(source)
    setInstallError(null)
    setInstallSuccess(null)

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/skill/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ source }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(parseErrorMessage(data, '安装失败'))
      }

      await fetchSkills()
      setInstallSuccess(typeof data.summary === 'string' ? data.summary : '员工已入职，可在「通讯录」查看')
      setSearch(typeof data.skillId === 'string' ? data.skillId : '')
      setActiveTab('mine')
      setCustomUrl('')
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : '安装失败')
    } finally {
      setInstalling(null)
    }
  }

  async function uninstallSkill(skillId: string) {
    const skillName = skills.find(skill => skill.id === skillId)?.name || skillId
    if (!confirm(`确定要为 "${skillName}" 办理离职吗？`)) return

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/skill/${skillId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(parseErrorMessage(data, '卸载失败'))
      }

      await fetchSkills()
    } catch (error) {
      console.error('卸载失败:', error)
    }
  }

  const query = search.toLowerCase()
  const filteredSkills = useMemo(
    () => skills
      .filter(skill => {
        const employee = getEmployeeDirectoryProfile(skill)
        if (!query) return true
        return (
          employee.displayName.toLowerCase().includes(query)
          || employee.roleTitle.toLowerCase().includes(query)
          || employee.summary.toLowerCase().includes(query)
          || skill.name.toLowerCase().includes(query)
          || skill.description.toLowerCase().includes(query)
        )
      })
      .sort((a, b) => {
        const left = getEmployeeDirectoryProfile(a)
        const right = getEmployeeDirectoryProfile(b)
        if (left.priority !== right.priority) return left.priority - right.priority
        return left.displayName.localeCompare(right.displayName, 'zh-CN')
      }),
    [skills, query],
  )

  const installedIds = new Set(skills.map(skill => skill.id))

  if (selectedSkill) {
    return <SkillConfigPanel skillId={selectedSkill} onBack={() => setSelectedSkill(null)} />
  }

  if (optimizingSkill) {
    const skill = skills.find(item => item.id === optimizingSkill)
    return (
      <OptimizeSkillChat
        skillId={optimizingSkill}
        skillName={skill?.name || optimizingSkill}
        onBack={() => setOptimizingSkill(null)}
        onComplete={() => {
          setOptimizingSkill(null)
          fetchSkills()
        }}
      />
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">通讯录</h2>
          <p className="text-sm text-muted-foreground mt-1">查看公司现有员工、联系 HR 招聘新同事，或为员工提升能力。</p>
        </div>
        <Link to="/" className="text-sm text-primary hover:underline">返回助理办公桌</Link>
      </div>

      <div className="mb-6">
        <SearchBar value={search} onChange={setSearch} />
      </div>

      <div className="border-b border-border mb-6">
        <nav className="flex gap-8">
          <TabButton active={activeTab === 'mine'} onClick={() => setActiveTab('mine')}>
            公司员工 ({skills.length})
          </TabButton>
          <TabButton active={activeTab === 'talent'} onClick={() => setActiveTab('talent')}>
            人才市场
          </TabButton>
        </nav>
      </div>

      {installSuccess && (
        <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-300">
          {installSuccess}
        </div>
      )}

      {activeTab === 'mine' && (
        <MineContent
          skills={filteredSkills}
          loading={loading}
          onConfigure={setSelectedSkill}
          onOptimize={setOptimizingSkill}
          onUninstall={uninstallSkill}
        />
      )}

      {activeTab === 'talent' && (
        <TalentMarketPanel
          skills={officialSkills}
          installedIds={installedIds}
          installing={installing}
          customUrl={customUrl}
          installError={installError}
          onInstall={installSkill}
          onCustomUrlChange={setCustomUrl}
        />
      )}
    </div>
  )
}
