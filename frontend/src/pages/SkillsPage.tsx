/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      技能管理页面                                        ║
 * ║                                                                          ║
 * ║  职责：查看、配置、创建 AI 技能                                            ║
 * ║  设计：配置展示完整物料结构，创建通过对话式流程                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Skill, OfficialSkill } from '../types'
import { parseErrorMessage, API_BASE } from '../config'
import { TabButton } from '../components/shared/TabButton'
import { LoadingState } from '../components/shared/LoadingState'
import { InstalledSkills } from '../components/skill/InstalledSkills'
import { OfficialMarket } from '../components/skill/OfficialMarket'
import { SkillConfigPanel } from '../components/skill/SkillConfigPanel'
import { CreateSkillChat } from '../components/create/CreateSkillChat'
import { OptimizeSkillChat } from '../components/create/OptimizeSkillChat'

type TabType = 'installed' | 'official' | 'create'

export default function SkillsPage() {
  const [searchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as TabType) || 'installed'

  const [skills, setSkills] = useState<Skill[]>([])
  const [officialSkills, setOfficialSkills] = useState<OfficialSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [optimizingSkill, setOptimizingSkill] = useState<string | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const [customUrl, setCustomUrl] = useState('')
  const [installError, setInstallError] = useState<string | null>(null)

  useEffect(() => {
    fetchSkills()
  }, [])

  useEffect(() => {
    if (activeTab === 'official' && officialSkills.length === 0) {
      fetchOfficialSkills()
    }
  }, [activeTab])

  async function fetchSkills() {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/skill/list`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
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
      const res = await fetch(`${API_BASE}/skill/official`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setOfficialSkills(data.skills || [])
    } catch {
      setOfficialSkills([])
    }
  }

  async function installSkill(source: string) {
    setInstalling(source)
    setInstallError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/skill/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ source }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(parseErrorMessage(data, '安装失败'))
      }
      await fetchSkills()
      setActiveTab('installed')
      setCustomUrl('')
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : '安装失败')
    } finally {
      setInstalling(null)
    }
  }

  async function uninstallSkill(skillId: string) {
    if (!confirm(`确定要卸载 "${skillId}" 吗？`)) return
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/skill/uninstall/${skillId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(parseErrorMessage(data, '卸载失败'))
      }
      await fetchSkills()
    } catch (err) {
      console.error('卸载失败:', err)
    }
  }

  const installedIds = new Set(skills.map((s) => s.id))

  // 配置详情页
  if (selectedSkill) {
    return (
      <SkillConfigPanel
        skillId={selectedSkill}
        onBack={() => setSelectedSkill(null)}
      />
    )
  }

  // 优化对话页
  if (optimizingSkill) {
    const skill = skills.find((s) => s.id === optimizingSkill)
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
        <h2 className="text-2xl font-bold text-foreground">技能管理</h2>
        <Link to="/" className="text-sm text-primary hover:underline">
          返回首页
        </Link>
      </div>

      <div className="border-b border-border mb-6">
        <nav className="flex gap-8">
          <TabButton
            active={activeTab === 'installed'}
            onClick={() => setActiveTab('installed')}
          >
            已安装 ({skills.length})
          </TabButton>
          <TabButton
            active={activeTab === 'official'}
            onClick={() => setActiveTab('official')}
          >
            官方技能
          </TabButton>
          <TabButton
            active={activeTab === 'create'}
            onClick={() => setActiveTab('create')}
          >
            创建流程
          </TabButton>
        </nav>
      </div>

      {loading ? (
        <LoadingState />
      ) : activeTab === 'installed' ? (
        <InstalledSkills
          skills={skills}
          onConfigure={setSelectedSkill}
          onOptimize={setOptimizingSkill}
          onUninstall={uninstallSkill}
        />
      ) : activeTab === 'official' ? (
        <OfficialMarket
          skills={officialSkills}
          installedIds={installedIds}
          installing={installing}
          customUrl={customUrl}
          installError={installError}
          onInstall={installSkill}
          onCustomUrlChange={setCustomUrl}
        />
      ) : (
        <CreateSkillChat />
      )}
    </div>
  )
}
