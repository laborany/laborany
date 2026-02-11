/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Skill 执行页面                                    ║
 * ║                                                                          ║
 * ║  设计哲学：                                                               ║
 * ║  1. 薄包装 —— 只负责路由参数、useAgent 调用、断线重连                       ║
 * ║  2. 布局委托 —— 三面板布局完全交给 ExecutionPanel                          ║
 * ║  3. 页面级关注点 —— URL 参数、对话框、导航栏                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useAgent } from '../hooks/useAgent'
import { useSkillNameMap } from '../hooks/useSkillNameMap'
import { API_BASE } from '../config/api'
import { ExecutionPanel } from '../components/execution'
import { Tooltip } from '../components/ui'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui'
import { Button } from '../components/ui'

export default function ExecutePage() {
  const { skillId } = useParams<{ skillId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const agent = useAgent(skillId || '')
  const { getSkillName } = useSkillNameMap()
  const displaySkillName = getSkillName(skillId)
  const handledCreatedRef = useRef<string | null>(null)
  const effectiveRunning = agent.isRunning && !agent.pendingQuestion

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                      页面级状态（对话框 + 断线重连）                       │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const [showClearDialog, setShowClearDialog] = useState(false)
  const [showResumeDialog, setShowResumeDialog] = useState(false)
  const [runningSessionId, setRunningSessionId] = useState<string | null>(null)

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                      断线重连：检查正在执行的任务                          │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  useEffect(() => {
    if (searchParams.get('q')) return

    async function checkTask() {
      const runningId = await agent.checkRunningTask()
      if (runningId) {
        setRunningSessionId(runningId)
        setShowResumeDialog(true)
      }
    }
    checkTask()
  }, [agent.checkRunningTask])

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                      URL 参数自动执行（?q=xxx&sid=xxx）                 │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const hasAutoExecutedRef = useRef(false)

  useEffect(() => {
    hasAutoExecutedRef.current = false
    handledCreatedRef.current = null
  }, [skillId])

  useEffect(() => {
    if (hasAutoExecutedRef.current) return
    const query = searchParams.get('q')
    if (!query) return

    hasAutoExecutedRef.current = true

    const token = localStorage.getItem('token')
    const sid = searchParams.get('sid')

    const tryAttachRunningSession = async (targetSessionId: string): Promise<boolean> => {
      if (!targetSessionId || !token) return false
      try {
        const statusRes = await fetch(`${API_BASE}/sessions/${targetSessionId}/live-status`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!statusRes.ok) return false

        const live = await statusRes.json() as {
          isRunning?: boolean
          canAttach?: boolean
        }

        if (live.isRunning && live.canAttach) {
          agent.resumeSession(targetSessionId)
          await agent.attachToSession(targetSessionId)
          return true
        }
        return false
      } catch {
        return false
      }
    }

    const findSameRunningSession = async (): Promise<string | null> => {
      if (!token || !skillId) return null
      try {
        const res = await fetch(`${API_BASE}/sessions`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return null

        const list = await res.json() as Array<{
          id: string
          skill_id: string
          query: string
          status: string
        }>

        const normalizedQuery = query.trim()
        const matched = list.find(item =>
          item.status === 'running'
          && item.skill_id === skillId
          && (item.query || '').trim() === normalizedQuery,
        )

        return matched?.id || null
      } catch {
        return null
      }
    }

    const bootstrap = async () => {
      let attached = false

      if (sid) {
        attached = await tryAttachRunningSession(sid)
      }

      if (!attached) {
        const matchedSessionId = await findSameRunningSession()
        if (matchedSessionId) {
          attached = await tryAttachRunningSession(matchedSessionId)
        }
      }

      if (!attached) {
        await agent.execute(query)
      }

      setSearchParams({}, { replace: true })
    }

    void bootstrap()
  }, [searchParams, setSearchParams, agent.execute, agent.attachToSession, agent.resumeSession, skillId])

  useEffect(() => {
    if (skillId !== 'skill-creator') return

    const created = agent.createdCapability
    if (!created?.id) return

    const key = `skill:${created.id}`
    if (handledCreatedRef.current === key) return
    handledCreatedRef.current = key

    const firstUserMessage = agent.messages.find((m) => m.type === 'user')?.content || ''
    const originQuery = (created.originQuery || firstUserMessage || '').trim()
    const nextUrl = originQuery
      ? `/execute/${created.id}?q=${encodeURIComponent(originQuery)}`
      : `/execute/${created.id}`

    navigate(nextUrl, { replace: true })
  }, [skillId, agent.createdCapability, agent.messages, navigate])

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                      页面级回调                                          │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const handleResumeTask = useCallback(() => {
    if (runningSessionId) agent.attachToSession(runningSessionId)
    setShowResumeDialog(false)
    setRunningSessionId(null)
  }, [runningSessionId, agent.attachToSession])

  const handleDismissResume = useCallback(() => {
    setShowResumeDialog(false)
    setRunningSessionId(null)
  }, [])

  const handleClear = useCallback(() => {
    agent.clear()
    setShowClearDialog(false)
  }, [agent.clear])

  const placeholder = skillId === 'financial-report'
    ? '例如：分析腾讯 2023 年财报的营收增长情况'
    : '输入你的问题...'

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                      顶部导航栏                                          │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const header = (
    <div className="flex items-center justify-between mb-4 shrink-0">
      <div className="flex items-center gap-4">
        <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-lg font-semibold text-foreground">
          {displaySkillName}
        </h2>
      </div>
      <div className="flex items-center gap-3">
        {effectiveRunning ? (
          <button
            onClick={agent.stop}
            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-sm transition-colors"
          >
            停止任务
          </button>
        ) : agent.messages.length > 0 ? (
          <button
            onClick={handleClear}
            className="text-sm text-primary hover:text-primary/80 transition-colors"
          >
            新对话
          </button>
        ) : null}
        {agent.messages.length > 0 && !effectiveRunning && (
          <Tooltip content="清空当前对话记录" side="bottom">
            <button
              onClick={() => setShowClearDialog(true)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              清空
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  )

  return (
    <div className="h-[calc(100vh-64px)]">
      <ExecutionPanel
        messages={agent.messages}
        isRunning={effectiveRunning}
        error={agent.error}
        taskFiles={agent.taskFiles}
        workDir={agent.workDir}
        filesVersion={agent.filesVersion}
        onSubmit={agent.execute}
        onStop={agent.stop}
        sessionId={agent.sessionId}
        getFileUrl={agent.getFileUrl}
        fetchTaskFiles={agent.fetchTaskFiles}
        pendingQuestion={agent.pendingQuestion}
        respondToQuestion={agent.respondToQuestion}
        placeholder={placeholder}
        headerSlot={header}
      />

      {/* ════════════════════════════════════════════════════════════════════
       * 清空对话确认框
       * ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={showClearDialog} onClose={() => setShowClearDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认清空对话</DialogTitle>
            <DialogDescription>
              清空后将删除当前所有对话记录，此操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowClearDialog(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleClear}>
              确认清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════
       * 恢复任务确认框
       * ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={showResumeDialog} onClose={handleDismissResume}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>任务还在运行中</DialogTitle>
            <DialogDescription>
              你有一个任务还在运行，要继续查看进度吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={handleDismissResume}>
              不用了
            </Button>
            <Button onClick={handleResumeTask}>
              继续查看
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
