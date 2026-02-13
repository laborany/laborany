/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      首页案例 Context                                     ║
 * ║                                                                          ║
 * ║  功能：统一管理首页可引用案例（skill/composite）                            ║
 * ║  特性：本地持久化、旧数据迁移、增删改排                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { CapabilityTargetType } from '../types'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface HomeCaseItem {
  id: string
  targetType: CapabilityTargetType
  targetId: string
  icon: string
  name: string
  description: string
}

export type QuickStartItem = HomeCaseItem

interface LegacyQuickStartItem {
  skillId: string
  icon: string
  name: string
  description: string
}

interface QuickStartContextValue {
  scenarios: HomeCaseItem[]
  isCustomized: boolean
  saveScenarios: (items: HomeCaseItem[]) => void
  resetToDefault: () => void
  addScenario: (item: HomeCaseItem) => void
  updateScenario: (caseId: string, patch: Partial<HomeCaseItem>) => void
  removeScenario: (caseId: string) => void
  moveScenario: (caseId: string, direction: 'up' | 'down') => void
  maxItems: number
  defaultScenarios: HomeCaseItem[]
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           常量定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const STORAGE_KEY = 'laborany:home-cases:v2'
const LEGACY_STORAGE_KEY = 'laborany:quick-start'
const MAX_ITEMS = 8

const LEGACY_TARGET_ID_MAP: Record<string, string> = {
  'ai-column-ppt-svg': 'ppt-svg-generator',
  'ppt-creation': 'pptx',
  'data-analysis-report': 'xlsx',
  'data-monitor-daily': 'data-monitor',
  'expense-summary': 'expense-assistant',
  'financial-analysis': 'financial-report',
  'social-content-pack': 'social-operator',
  'stock-report-pipeline': 'stock-analyzer',
  'competitor-comparison': 'deep-research',
  'contract-review': 'paper-editor',
  'weekly-report': 'topic-collector',
  '股票研报解读流程': 'stock-analyzer',
}

export const DEFAULT_SCENARIOS: HomeCaseItem[] = [
  {
    id: 'case-skill-creator',
    targetType: 'skill',
    targetId: 'skill-creator',
    icon: '🛠️',
    name: 'Skill Creator',
    description: '创建与迭代新的自动化技能',
  },
  {
    id: 'case-xhs-note-creator',
    targetType: 'skill',
    targetId: 'xhs-note-creator',
    icon: '📕',
    name: '小红书笔记',
    description: '生成小红书风格文案与配图素材',
  },
  {
    id: 'case-wechat-writer',
    targetType: 'skill',
    targetId: 'wechat-writer',
    icon: '✍️',
    name: '微信写作',
    description: '公众号文章策划、写作与排版',
  },
  {
    id: 'case-stock-analyzer',
    targetType: 'skill',
    targetId: 'stock-analyzer',
    icon: '📈',
    name: '股票分析',
    description: '实时股票数据采集与分析',
  },
  {
    id: 'case-deep-research',
    targetType: 'skill',
    targetId: 'deep-research',
    icon: '🔍',
    name: '深度研究',
    description: '多源调研与报告生成',
  },
  {
    id: 'case-pptx',
    targetType: 'skill',
    targetId: 'pptx',
    icon: '📽️',
    name: 'PPT演示助手',
    description: '制作精美演示文稿',
  },
]

const LEGACY_DEFAULT_SCENARIO_TARGET_IDS = [
  'docx',
  'pptx',
  'xlsx',
  'email-assistant',
  'paper-explainer',
  'ai-productivity-column',
  'ppt-svg-generator',
]

const LEGACY_QUICK_START_DEFAULT_TARGET_IDS = [
  'docx',
  'pptx',
  'xlsx',
  'paper-explainer',
  'diagram',
  'video-creator',
]

function matchesLegacyDefault(items: HomeCaseItem[]): boolean {
  if (items.length !== LEGACY_DEFAULT_SCENARIO_TARGET_IDS.length) return false
  return items.every((item, index) => item.targetId === LEGACY_DEFAULT_SCENARIO_TARGET_IDS[index])
}

function matchesLegacyQuickStartDefault(items: HomeCaseItem[]): boolean {
  if (items.length !== LEGACY_QUICK_START_DEFAULT_TARGET_IDS.length) return false
  return items.every((item, index) => item.targetId === LEGACY_QUICK_START_DEFAULT_TARGET_IDS[index])
}

function shouldResetToLatestDefault(items: HomeCaseItem[]): boolean {
  return matchesLegacyDefault(items) || matchesLegacyQuickStartDefault(items)
}
function makeCaseId(prefix = 'case'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function isValidCaseItem(item: unknown): item is HomeCaseItem {
  if (!item || typeof item !== 'object') return false
  const candidate = item as Partial<HomeCaseItem>
  return Boolean(
    candidate.id &&
    candidate.targetType === 'skill' &&
    candidate.targetId &&
    candidate.name,
  )
}

function sanitizeItems(items: HomeCaseItem[]): HomeCaseItem[] {
  const seen = new Set<string>()
  const deduped: HomeCaseItem[] = []

  for (const raw of items) {
    if (!isValidCaseItem(raw)) continue
    const normalizedTargetId = LEGACY_TARGET_ID_MAP[raw.targetId] || raw.targetId
    if (!normalizedTargetId) continue
    const key = `${raw.targetType}:${normalizedTargetId}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push({
      id: raw.id || makeCaseId('case'),
      targetType: 'skill',
      targetId: normalizedTargetId,
      icon: raw.icon || '🔧',
      name: raw.name,
      description: raw.description || '',
    })
    if (deduped.length >= MAX_ITEMS) break
  }

  return deduped
}

function migrateLegacyItems(items: LegacyQuickStartItem[]): HomeCaseItem[] {
  return sanitizeItems(
    items.map((item, index) => ({
      id: `legacy-${item.skillId || 'skill'}-${index}`,
      targetType: 'skill',
      targetId: item.skillId,
      icon: item.icon || '🔧',
      name: item.name || item.skillId || '未命名案例',
      description: item.description || '',
    })),
  )
}

function sameAsDefault(items: HomeCaseItem[]): boolean {
  if (items.length !== DEFAULT_SCENARIOS.length) return false
  return items.every((item, index) => {
    const target = DEFAULT_SCENARIOS[index]
    return (
      item.targetType === target.targetType &&
      item.targetId === target.targetId &&
      item.icon === target.icon &&
      item.name === target.name &&
      item.description === target.description
    )
  })
}

function loadInitialScenarios(): { items: HomeCaseItem[]; customized: boolean } {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const items = sanitizeItems(parsed)
        if (items.length > 0) {
          if (shouldResetToLatestDefault(items)) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SCENARIOS))
            return { items: DEFAULT_SCENARIOS, customized: false }
          }
          return { items, customized: !sameAsDefault(items) }
        }
      }
    } catch {
      // ignore and fallback
    }
  }

  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
  if (legacy) {
    try {
      const parsed = JSON.parse(legacy)
      if (Array.isArray(parsed)) {
        const migrated = migrateLegacyItems(parsed as LegacyQuickStartItem[])
        if (migrated.length > 0) {
          if (shouldResetToLatestDefault(migrated)) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SCENARIOS))
            localStorage.removeItem(LEGACY_STORAGE_KEY)
            return { items: DEFAULT_SCENARIOS, customized: false }
          }
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
          localStorage.removeItem(LEGACY_STORAGE_KEY)
          return { items: migrated, customized: true }
        }
      }
    } catch {
      // ignore and fallback
    }
  }

  return { items: DEFAULT_SCENARIOS, customized: false }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Context 创建                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const QuickStartContext = createContext<QuickStartContextValue | null>(null)

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Provider 组件                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function QuickStartProvider({ children }: { children: ReactNode }) {
  const [scenarios, setScenarios] = useState<QuickStartItem[]>(DEFAULT_SCENARIOS)
  const [isCustomized, setIsCustomized] = useState(false)

  useEffect(() => {
    const { items, customized } = loadInitialScenarios()
    setScenarios(items)
    setIsCustomized(customized)
  }, [])

  const saveScenarios = useCallback((items: HomeCaseItem[]) => {
    const normalized = sanitizeItems(items)
    setScenarios(normalized)
    setIsCustomized(!sameAsDefault(normalized))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  }, [])

  const resetToDefault = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
    setScenarios(DEFAULT_SCENARIOS)
    setIsCustomized(false)
  }, [])

  const addScenario = useCallback((item: HomeCaseItem) => {
    setScenarios(prev => {
      if (prev.length >= MAX_ITEMS) return prev
      const duplicate = prev.some(s => s.targetType === item.targetType && s.targetId === item.targetId)
      if (duplicate) return prev
      const nextItem: HomeCaseItem = {
        ...item,
        id: item.id || makeCaseId(item.targetType),
        icon: item.icon || '🔧',
        name: item.name || item.targetId,
        description: item.description || '',
      }
      const next = [...prev, nextItem]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setIsCustomized(!sameAsDefault(next))
      return next
    })
  }, [])

  const updateScenario = useCallback((caseId: string, patch: Partial<HomeCaseItem>) => {
    setScenarios(prev => {
      const index = prev.findIndex(s => s.id === caseId)
      if (index === -1) return prev

      const current = prev[index]
      const merged: HomeCaseItem = {
        ...current,
        ...patch,
        id: current.id,
        targetType: 'skill',
      }

      if (!merged.targetId.trim()) return prev

      const conflict = prev.some(
        s => s.id !== caseId && s.targetType === merged.targetType && s.targetId === merged.targetId,
      )
      if (conflict) return prev

      const next = [...prev]
      next[index] = merged
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setIsCustomized(!sameAsDefault(next))
      return next
    })
  }, [])

  const removeScenario = useCallback((caseId: string) => {
    setScenarios(prev => {
      const next = prev.filter(s => s.id !== caseId)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setIsCustomized(!sameAsDefault(next))
      return next
    })
  }, [])

  const moveScenario = useCallback((caseId: string, direction: 'up' | 'down') => {
    setScenarios(prev => {
      const index = prev.findIndex(s => s.id === caseId)
      if (index === -1) return prev

      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= prev.length) return prev

      const next = [...prev]
      ;[next[index], next[newIndex]] = [next[newIndex], next[index]]

      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setIsCustomized(!sameAsDefault(next))
      return next
    })
  }, [])

  return (
    <QuickStartContext.Provider value={{
      scenarios,
      isCustomized,
      saveScenarios,
      resetToDefault,
      addScenario,
      updateScenario,
      removeScenario,
      moveScenario,
      maxItems: MAX_ITEMS,
      defaultScenarios: DEFAULT_SCENARIOS,
    }}>
      {children}
    </QuickStartContext.Provider>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Hook 导出                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function useQuickStartContext(): QuickStartContextValue {
  const context = useContext(QuickStartContext)
  if (!context) {
    throw new Error('useQuickStartContext must be used within QuickStartProvider')
  }
  return context
}
