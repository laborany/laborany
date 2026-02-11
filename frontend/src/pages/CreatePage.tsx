/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      创建页面 - 招聘新员工                                  ║
 * ║                                                                          ║
 * ║  设计：复用 useAgent + MessageList + ChatInput，与 ExecutePage 一致        ║
 * ║  流程：对话创建 skill → 自动检测新 skill → 显示安装通知                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Link } from 'react-router-dom'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useAgent } from '../hooks/useAgent'
import { API_BASE } from '../config'
import ChatInput from '../components/shared/ChatInput'
import MessageList from '../components/shared/MessageList'
import { QuestionInput } from '../components/shared/QuestionInput'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           新 Skill 通知卡片                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface SkillMeta { id: string; name: string; description: string }

function NewSkillBanner({ skills }: { skills: SkillMeta[] }) {
  if (skills.length === 0) return null
  return (
    <div className="mx-4 mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
      {skills.map(s => (
        <div key={s.id} className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>新技能 <strong>{s.name}</strong> 已创建并安装</span>
        </div>
      ))}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           页面主体                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export default function CreatePage() {
  const {
    messages, isRunning, error, pendingQuestion,
    execute, stop, clear, respondToQuestion,
  } = useAgent('skill-creator')

  const [userSkillsDir, setUserSkillsDir] = useState<string | null>(null)
  const [knownIds, setKnownIds] = useState<string[]>([])
  const [newSkills, setNewSkills] = useState<SkillMeta[]>([])
  const isFirstMsg = useRef(true)
  const prevRunning = useRef(false)

  /* ────────────────────────────────────────────────────────────────────────
   *  页面加载：获取 userSkillsDir 和当前已知 skill 列表
   * ──────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const token = localStorage.getItem('token')
    const headers = { Authorization: `Bearer ${token}` }

    Promise.all([
      fetch(`${API_BASE}/skill/user-dir`, { headers }).then(r => r.json()),
      fetch(`${API_BASE}/skill/list`, { headers }).then(r => r.json()),
    ]).then(([dirData, listData]) => {
      setUserSkillsDir(dirData.path || null)
      setKnownIds((listData.skills || []).map((s: SkillMeta) => s.id))
    }).catch(() => {})
  }, [])

  /* ────────────────────────────────────────────────────────────────────────
   *  每轮对话结束后检测新 skill
   * ──────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (prevRunning.current && !isRunning && knownIds.length > 0) {
      const token = localStorage.getItem('token')
      fetch(`${API_BASE}/skill/detect-new`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ knownIds }),
      })
        .then(r => r.json())
        .then(data => {
          const found: SkillMeta[] = data.newSkills || []
          if (found.length > 0) {
            setNewSkills(prev => [...prev, ...found])
            setKnownIds(prev => [...prev, ...found.map(s => s.id)])
          }
        })
        .catch(() => {})
    }
    prevRunning.current = isRunning
  }, [isRunning, knownIds])

  /* ────────────────────────────────────────────────────────────────────────
   *  首条消息附加 userSkillsDir 路径提示
   * ──────────────────────────────────────────────────────────────────────── */
  const handleSubmit = useCallback(
    (query: string, files?: File[]) => {
      let finalQuery = query
      if (isFirstMsg.current && userSkillsDir) {
        finalQuery = `${query}\n\n【重要】创建 skill 时，请使用以下路径：${userSkillsDir}`
        isFirstMsg.current = false
      }
      execute(finalQuery, files)
    },
    [execute, userSkillsDir],
  )

  const handleClear = useCallback(() => {
    clear()
    isFirstMsg.current = true
    setNewSkills([])
  }, [clear])

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] max-w-4xl mx-auto px-4">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between py-4 shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">招聘新员工</h1>
            <p className="text-xs text-muted-foreground">
              通过对话描述你的需求，AI 会帮你创建一位专属的数字员工
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            清空
          </button>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm shrink-0">
          {error}
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto mb-4 min-h-0">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <p className="text-lg font-medium text-foreground mb-1">描述你的需求</p>
              <p className="text-sm">例如：帮我创建一个能分析 PDF 文档的助手</p>
            </div>
          </div>
        ) : (
          <MessageList messages={messages} isRunning={isRunning} />
        )}
      </div>

      {/* 新 Skill 通知 */}
      <NewSkillBanner skills={newSkills} />

      {/* 问题输入 */}
      {pendingQuestion && (
        <div className="shrink-0 mb-4">
          <QuestionInput pendingQuestion={pendingQuestion} onSubmit={respondToQuestion} />
        </div>
      )}

      {/* 输入框 */}
      <div className="shrink-0 pb-4">
        <ChatInput
          onSubmit={handleSubmit}
          onStop={stop}
          isRunning={isRunning}
          placeholder="描述你想创建的技能或复合技能..."
        />
      </div>
    </div>
  )
}
