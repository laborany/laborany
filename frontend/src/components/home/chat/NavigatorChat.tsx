/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      导航对话框 - NavigatorChat                        ║
 * ║                                                                          ║
 * ║  核心理念：对话框是导航器，不是执行器                                      ║
 * ║  用户输入 → 路由匹配 → 跳转到 ExecutePage                               ║
 * ║                                                                          ║
 * ║  状态极简：idle | routing | no_match                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useSmartRouter } from '../../../hooks/useSmartRouter'
import type { ShowcaseItem } from './ChatState'
import { SkillTag } from '../grid/SkillTag'
import { SmartSuggestion } from './SmartSuggestion'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
type NavPhase = 'idle' | 'routing' | 'no_match'

interface NavigatorChatProps {
  selectedSkill: ShowcaseItem | null
  onClearSkill: () => void
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           路由中动画                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function RoutingOverlay() {
  return (
    <div className="flex items-center gap-3 py-3 justify-center text-muted-foreground">
      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-sm">正在分析你的需求...</span>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           未匹配提示                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function NoMatchTip({ onReset }: { onReset: () => void }) {
  const navigate = useNavigate()

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50 text-sm gap-2">
      <span className="text-muted-foreground">
        未找到匹配的技能，试试换个描述或
        <Link to="/create" className="text-primary hover:underline ml-1">创建新技能</Link>
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => navigate('/execute/skill-creator')}
          className="px-3 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          直接对话
        </button>
        <button onClick={onReset} className="text-xs text-primary hover:underline">
          重试
        </button>
      </div>
    </div>
  )
}

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      主组件 - 导航对话框                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */
export function NavigatorChat({ selectedSkill, onClearSkill }: NavigatorChatProps) {
  const [phase, setPhase] = useState<NavPhase>('idle')
  const [input, setInput] = useState('')
  const navigate = useNavigate()
  const { route } = useSmartRouter()

  /* ────────────────────────────────────────────────────────────────────────
   *  跳转到执行页
   * ──────────────────────────────────────────────────────────────────────── */
  const goExecute = (id: string, query: string, type: 'skill' | 'workflow' = 'skill') => {
    const base = type === 'workflow' ? '/workflow-run' : '/execute'
    navigate(`${base}/${id}?q=${encodeURIComponent(query)}`)
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  提交：有选中技能直接跳转，否则走路由匹配
   * ──────────────────────────────────────────────────────────────────────── */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const q = input.trim()
    if (!q) return

    if (selectedSkill) {
      goExecute(selectedSkill.id, q, selectedSkill.type)
      return
    }

    setPhase('routing')
    const match = await route(q)

    if (match.type === 'none') {
      setPhase('no_match')
      return
    }
    goExecute(match.id, q, match.type === 'workflow' ? 'workflow' : 'skill')
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  智能建议选中 → 直接跳转
   * ──────────────────────────────────────────────────────────────────────── */
  const handleSuggestionSelect = (match: { id: string; name: string; type: string }) => {
    goExecute(match.id, input.trim() || match.name, match.type === 'workflow' ? 'workflow' : 'skill')
  }

  const handleReset = () => {
    setPhase('idle')
    setInput('')
  }

  const isDisabled = phase === 'routing'

  return (
    <div className="w-full space-y-3">
      {/* 技能标签 */}
      {selectedSkill && (
        <div className="mb-1">
          <SkillTag icon={selectedSkill.icon} name={selectedSkill.name} onRemove={onClearSkill} />
        </div>
      )}

      {/* 输入框 */}
      <form onSubmit={handleSubmit} className="relative">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={isDisabled}
          placeholder={selectedSkill
            ? `向 ${selectedSkill.name} 描述你的任务...`
            : '描述你想完成的任务...'
          }
          className={
            'w-full px-4 py-3 pr-20 rounded-lg border border-border bg-card ' +
            'text-foreground placeholder:text-muted-foreground ' +
            'focus:outline-none focus:ring-2 focus:ring-primary/50 ' +
            'disabled:opacity-50 disabled:cursor-not-allowed'
          }
        />
        <button
          type="submit"
          disabled={isDisabled || !input.trim()}
          className={
            'absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-md text-sm ' +
            'bg-primary text-primary-foreground hover:bg-primary/90 ' +
            'disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
          }
        >
          {isDisabled ? '...' : '发送'}
        </button>
        <SmartSuggestion query={input} visible={input.length >= 2 && !isDisabled} onSelect={handleSuggestionSelect} />
      </form>

      {/* 阶段提示 */}
      {phase === 'routing' && <RoutingOverlay />}
      {phase === 'no_match' && <NoMatchTip onReset={handleReset} />}

    </div>
  )
}
