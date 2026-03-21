/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Skill 执行页面                                    ║
 * ║                                                                          ║
 * ║  设计哲学：                                                               ║
 * ║  1. 薄包装 —— 只负责路由参数、useAgent 调用、断线重连                       ║
 * ║  2. 布局委托 —— 三面板布局完全交给 ExecutionPanel                          ║
 * ║  3. 页面级关注点 —— URL 参数、对话框、导航栏                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useAgent } from '../hooks/useAgent'
import { useSkillNameMap } from '../hooks/useSkillNameMap'
import { API_BASE } from '../config/api'
import { ExecutionPanel } from '../components/execution'
import { Tooltip } from '../components/ui'
import { parseAttachmentIdsParam } from '../lib/attachments'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui'
import { Button } from '../components/ui'

const ATTACHMENT_ONLY_EXECUTION_QUERY = '请先查看我上传的文件，并根据文件内容继续处理。'

export default function ExecutePage() {
  const { skillId } = useParams<{ skillId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
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
    if (searchParams.get('q') || searchParams.get('sid')) return

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
  const lastBootstrapKeyRef = useRef<string | null>(null)

  useEffect(() => {
    lastBootstrapKeyRef.current = null
    handledCreatedRef.current = null
  }, [skillId])

  useEffect(() => {
    const sid = searchParams.get('sid')
    const query = searchParams.get('q')
    const attachmentIds = parseAttachmentIdsParam(searchParams.get('attachments'))
    const explicitOriginQuery = typeof (location.state as { originQuery?: unknown } | null)?.originQuery === 'string'
      ? ((location.state as { originQuery?: string }).originQuery || '').trim()
      : ''
    const handoffQuery = typeof (location.state as { handoffQuery?: unknown } | null)?.handoffQuery === 'string'
      ? ((location.state as { handoffQuery?: string }).handoffQuery || '').trim()
      : ''
    if (!sid && !query && attachmentIds.length === 0) return

    const normalizedQuery = query?.trim() || (attachmentIds.length > 0 ? ATTACHMENT_ONLY_EXECUTION_QUERY : '')
    const bootstrapKey = `${skillId || ''}|${sid || ''}|${normalizedQuery}|${attachmentIds.join(',')}|${handoffQuery}`
    if (lastBootstrapKeyRef.current === bootstrapKey) return
    lastBootstrapKeyRef.current = bootstrapKey

    const token = localStorage.getItem('token')

    const canContinueSession = async (targetSessionId: string): Promise<boolean> => {
      if (!targetSessionId || !token || !skillId) return false
      try {
        const res = await fetch(`${API_BASE}/sessions/${targetSessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return false

        const detail = await res.json() as {
          skill_id?: string
        }

        return detail.skill_id === skillId
      } catch {
        return false
      }
    }

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

    const bootstrap = async () => {
      let attached = false
      let continuedBySid = false
      let startedNewExecution = false

      if (sid) {
        attached = await tryAttachRunningSession(sid)
        if (!attached && normalizedQuery && await canContinueSession(sid)) {
          agent.resumeSession(sid)
          await agent.execute(normalizedQuery, undefined, {
            attachmentIds,
            requestQuery: handoffQuery || undefined,
            originQuery: explicitOriginQuery || normalizedQuery,
          })
          continuedBySid = true
          startedNewExecution = true
        }
      }

      if (normalizedQuery && !attached && !continuedBySid) {
        await agent.execute(normalizedQuery, undefined, {
          attachmentIds,
          requestQuery: handoffQuery || undefined,
          originQuery: explicitOriginQuery || normalizedQuery,
        })
        startedNewExecution = true
      }

      if ((query || attachmentIds.length > 0) && (startedNewExecution || attached || continuedBySid)) {
        const nextParams = new URLSearchParams(searchParams)
        nextParams.delete('q')
        nextParams.delete('attachments')
        // sid 存在但并未成功续接时，说明已启动了新的 runtime 会话，清理旧 sid 避免后续误判。
        if (sid && startedNewExecution && !attached && !continuedBySid) {
          nextParams.delete('sid')
        }
        lastBootstrapKeyRef.current = `${skillId || ''}|${sid || ''}|`
        setSearchParams(nextParams, { replace: true })
      }
    }

    void bootstrap()
  }, [searchParams, setSearchParams, agent.execute, agent.attachToSession, agent.resumeSession, skillId, location.state])

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
    if (runningSessionId) {
      agent.resumeSession(runningSessionId)
      agent.attachToSession(runningSessionId)
    }
    setShowResumeDialog(false)
    setRunningSessionId(null)
  }, [runningSessionId, agent.attachToSession, agent.resumeSession])

  const handleDismissResume = useCallback(() => {
    setShowResumeDialog(false)
    setRunningSessionId(null)
  }, [])

  const handleClear = useCallback(() => {
    agent.clear()
    setShowClearDialog(false)
  }, [agent.clear])

  const handleBackToHome = useCallback(() => {
    // 启动期（尚无 sessionId）返回首页时不主动 detach，避免请求被提前中断。
    if (effectiveRunning && agent.sessionId) {
      agent.detach()
    }
    navigate('/')
  }, [agent.detach, agent.sessionId, effectiveRunning, navigate])

  const placeholder = skillId === 'financial-report'
    ? '例如：分析腾讯 2023 年财报的营收增长情况'
    : '输入你的问题...'

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                      顶部导航栏                                          │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const header = (
    <div className="mb-4 shrink-0 space-y-3">
      <div className="flex items-center justify-between pr-24 sm:pr-28">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleBackToHome}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
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
    </div>
  )

  return (
    <div className="h-[calc(100vh-64px)]">
      <ExecutionPanel
        messages={agent.messages}
        isRunning={effectiveRunning}
        error={agent.error}
        connectionStatus={agent.connectionStatus}
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
        activeWidget={agent.activeWidget}
        streamingWidget={agent.streamingWidget}
        onCloseWidget={() => agent.setActiveWidget(null)}
        onWidgetInteraction={(_widgetId, data) => {
          const text = `[来自组件交互]\n${JSON.stringify(data, null, 2)}`
          void agent.execute(text)
        }}
        onWidgetFallbackToText={() => {
          agent.setActiveWidget(null)
          void agent.execute('[请改为文本解释]')
        }}
        onShowWidget={agent.showWidget}
        onExpandWidget={agent.showWidget}
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
