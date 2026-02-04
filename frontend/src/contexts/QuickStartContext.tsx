/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      快速开始 Context                                     ║
 * ║                                                                          ║
 * ║  功能：在组件树中共享快速开始配置状态                                        ║
 * ║  解决：ScenarioCards 和 QuickStartEditor 状态不同步问题                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface QuickStartItem {
  skillId: string
  icon: string
  name: string
  description: string
}

interface QuickStartContextValue {
  scenarios: QuickStartItem[]
  isCustomized: boolean
  saveScenarios: (items: QuickStartItem[]) => void
  resetToDefault: () => void
  addScenario: (item: QuickStartItem) => void
  removeScenario: (skillId: string) => void
  moveScenario: (skillId: string, direction: 'up' | 'down') => void
  maxItems: number
  defaultScenarios: QuickStartItem[]
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           常量定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const STORAGE_KEY = 'laborany:quick-start'
const MAX_ITEMS = 6

const DEFAULT_SCENARIOS: QuickStartItem[] = [
  { skillId: 'docx', icon: '📝', name: 'Word文档助手', description: '创建和编辑Word文档' },
  { skillId: 'pptx', icon: '📊', name: 'PPT演示助手', description: '制作精美演示文稿' },
  { skillId: 'xlsx', icon: '📈', name: 'Excel表格助手', description: '数据分析与可视化' },
  { skillId: 'paper-explainer', icon: '📚', name: '论文讲解助手', description: '深度解读学术论文' },
  { skillId: 'diagram', icon: '📐', name: '论文图表助手', description: '流程图、架构图、时序图' },
  { skillId: 'video-creator', icon: '🎬', name: '视频创作助手', description: '动画视频、数据可视化' },
]

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

  // 初始化：从 localStorage 加载配置
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setScenarios(parsed)
          setIsCustomized(true)
        }
      } catch { /* 解析失败，使用默认配置 */ }
    }
  }, [])

  const saveScenarios = useCallback((items: QuickStartItem[]) => {
    const trimmed = items.slice(0, MAX_ITEMS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    setScenarios(trimmed)
    setIsCustomized(true)
  }, [])

  const resetToDefault = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setScenarios(DEFAULT_SCENARIOS)
    setIsCustomized(false)
  }, [])

  const addScenario = useCallback((item: QuickStartItem) => {
    setScenarios(prev => {
      if (prev.length >= MAX_ITEMS) return prev
      if (prev.some(s => s.skillId === item.skillId)) return prev
      const next = [...prev, item]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setIsCustomized(true)
      return next
    })
  }, [])

  const removeScenario = useCallback((skillId: string) => {
    setScenarios(prev => {
      const next = prev.filter(s => s.skillId !== skillId)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setIsCustomized(true)
      return next
    })
  }, [])

  const moveScenario = useCallback((skillId: string, direction: 'up' | 'down') => {
    setScenarios(prev => {
      const index = prev.findIndex(s => s.skillId === skillId)
      if (index === -1) return prev

      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= prev.length) return prev

      const next = [...prev]
      ;[next[index], next[newIndex]] = [next[newIndex], next[index]]

      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setIsCustomized(true)
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
 * └───────────────────────────────────────────────────────────��──────────────┘ */
export function useQuickStartContext(): QuickStartContextValue {
  const context = useContext(QuickStartContext)
  if (!context) {
    throw new Error('useQuickStartContext must be used within QuickStartProvider')
  }
  return context
}
