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
import { useConverse } from '../hooks/useConverse'
import { useSkillNameMap } from '../hooks/useSkillNameMap'
import { API_BASE } from '../config/api'
import { ExecutionPanel } from '../components/execution'
import { Tooltip } from '../components/ui'
import { parseAttachmentIdsParam } from '../lib/attachments'
import { ConversationWorkspaceView } from '../components/shared/ConversationWorkspaceView'
import { WorkDetailHeader } from '../components/shared/WorkDetailHeader'
import { isControlInstructionText } from '../lib/workRecords'
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

function normalizeWorkTitle(text: string): string {
  const normalized = (text || '').replace(/\s+/g, ' ').trim()
  if (!normalized || isControlInstructionText(normalized)) return ''
  return normalized
}

export default function ExecutePage() {
  const { skillId } = useParams<{ skillId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<'employee' | 'assistant'>('employee')
  const agent = useAgent(skillId || '')
  const converse = useConverse()
  const { getSkillName } = useSkillNameMap()
  const displaySkillName = getSkillName(skillId)
  const assistantLabel = '个人助理'
  const handledCreatedRef = useRef<string | null>(null)
  const effectiveRunning = agent.isRunning && !agent.pendingQuestion
  const converseSid = (searchParams.get('converseSid') || '').trim()
    || (typeof (location.state as { converseSessionId?: unknown } | null)?.converseSessionId === 'string'
      ? (((location.state as { converseSessionId?: string }).converseSessionId || '').trim())
      : '')
  const routeWorkId = (searchParams.get('workId') || '').trim()
    || (typeof (location.state as { workId?: unknown } | null)?.workId === 'string'
      ? (((location.state as { workId?: string }).workId || '').trim())
      : '')
  const hasAssistantTab = Boolean(converseSid)
  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                      页面级状态（对话框 + 断线重连）                       │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const [showClearDialog, setShowClearDialog] = useState(false)
  const [showResumeDialog, setShowResumeDialog] = useState(false)
  const [runningSessionId, setRunningSessionId] = useState<string | null>(null)
  const [workTitle, setWorkTitle] = useState('')

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
    const stateOriginQuery = typeof (location.state as { originQuery?: unknown } | null)?.originQuery === 'string'
      ? (((location.state as { originQuery?: string }).originQuery || '').trim())
      : ''
    const queryParam = (searchParams.get('q') || '').trim()
    const nextTitle = normalizeWorkTitle(stateOriginQuery || queryParam)
    if (nextTitle) {
      setWorkTitle(nextTitle)
      return
    }

    const firstUserMessage = agent.messages.find((message) => message.type === 'user')?.content || ''
    const fallbackTitle = normalizeWorkTitle(firstUserMessage)
    if (fallbackTitle) {
      setWorkTitle(fallbackTitle)
    }
  }, [location.state, searchParams, agent.messages])

  useEffect(() => {
    if (!converseSid) return
    void converse.resumeSession(converseSid)
  }, [converseSid, converse.resumeSession])

  useEffect(() => {
    if (/^\/history\/work\/[^/]+$/.test(location.pathname)) return

    const currentSid = (searchParams.get('sid') || '').trim()
    const currentWorkId = (searchParams.get('workId') || '').trim()
    const nextSid = (agent.sessionId || '').trim()
    const nextWorkId = (agent.workId || '').trim()

    if (!nextSid && !nextWorkId) return

    const nextParams = new URLSearchParams(searchParams)
    let changed = false

    if (nextSid && currentSid !== nextSid) {
      nextParams.set('sid', nextSid)
      changed = true
    }

    if (nextWorkId && currentWorkId !== nextWorkId) {
      nextParams.set('workId', nextWorkId)
      changed = true
    }

    if (!changed) return

    setSearchParams(nextParams, { replace: true })
  }, [agent.sessionId, agent.workId, location.pathname, searchParams, setSearchParams])

  useEffect(() => {
    const sid = searchParams.get('sid')
    const query = searchParams.get('q')
    const attachmentIds = parseAttachmentIdsParam(searchParams.get('attachments'))
    const hasLiveState = agent.isRunning || agent.messages.length > 0 || Boolean(agent.sessionId)
    const explicitOriginQuery = typeof (location.state as { originQuery?: unknown } | null)?.originQuery === 'string'
      ? ((location.state as { originQuery?: string }).originQuery || '').trim()
      : ''
    const handoffQuery = typeof (location.state as { handoffQuery?: unknown } | null)?.handoffQuery === 'string'
      ? ((location.state as { handoffQuery?: string }).handoffQuery || '').trim()
      : ''
    const executionWorkId = (searchParams.get('workId') || '').trim()
      || (typeof (location.state as { workId?: unknown } | null)?.workId === 'string'
        ? ((location.state as { workId?: string }).workId || '').trim()
        : '')
    if (!sid && !query && attachmentIds.length === 0) return
    if (!query && attachmentIds.length === 0 && hasLiveState) return

    const normalizedQuery = query?.trim() || (attachmentIds.length > 0 ? ATTACHMENT_ONLY_EXECUTION_QUERY : '')
    const bootstrapKey = normalizedQuery
      ? `${skillId || ''}|run|${normalizedQuery}|${attachmentIds.join(',')}|${handoffQuery}|${explicitOriginQuery}`
      : `${skillId || ''}|snapshot|${sid || ''}`
    if (lastBootstrapKeyRef.current === bootstrapKey) return
    lastBootstrapKeyRef.current = bootstrapKey

    const token = localStorage.getItem('token')

    const consumeBootstrapParams = (options?: { clearSid?: boolean }) => {
      const nextParams = new URLSearchParams(searchParams)
      let changed = false

      if (query) {
        nextParams.delete('q')
        changed = true
      }

      if (attachmentIds.length > 0 && nextParams.has('attachments')) {
        nextParams.delete('attachments')
        changed = true
      }

      if (options?.clearSid && sid && nextParams.get('sid') === sid) {
        nextParams.delete('sid')
        changed = true
      }

      if (!changed) return
      setSearchParams(nextParams, { replace: true })
    }

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
          consumeBootstrapParams()
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

      if (sid) {
        attached = await tryAttachRunningSession(sid)
        if (!attached && normalizedQuery && await canContinueSession(sid)) {
          consumeBootstrapParams()
          agent.resumeSession(sid)
          await agent.execute(normalizedQuery, undefined, {
            attachmentIds,
            requestQuery: handoffQuery || undefined,
            originQuery: explicitOriginQuery || normalizedQuery,
            workId: executionWorkId || converse.workId || undefined,
          })
          continuedBySid = true
        }
      }

      if (normalizedQuery && !attached && !continuedBySid) {
        consumeBootstrapParams({ clearSid: Boolean(sid) })
        await agent.execute(normalizedQuery, undefined, {
          attachmentIds,
          requestQuery: handoffQuery || undefined,
          originQuery: explicitOriginQuery || normalizedQuery,
          workId: executionWorkId || converse.workId || undefined,
        })
      }

      if (sid && !normalizedQuery && !attached && !continuedBySid) {
        await agent.loadSessionSnapshot(sid)
      }
    }

    void bootstrap()
  }, [
    searchParams,
    setSearchParams,
    agent.execute,
    agent.attachToSession,
    agent.resumeSession,
    agent.loadSessionSnapshot,
    agent.isRunning,
    agent.messages.length,
    agent.sessionId,
    skillId,
    location.state,
    converse.workId,
  ])

  useEffect(() => {
    if (skillId !== 'skill-creator') return

    const created = agent.createdCapability
    if (!created?.id) return

    const key = `skill:${created.id}`
    if (handledCreatedRef.current === key) return
    handledCreatedRef.current = key

    const firstUserMessage = agent.messages.find((m) => m.type === 'user')?.content || ''
    const originQuery = (created.originQuery || firstUserMessage || '').trim()
    const params = new URLSearchParams()
    if (originQuery) {
      params.set('q', originQuery)
    }
    if (agent.workId || routeWorkId) {
      params.set('workId', agent.workId || routeWorkId)
    }
    const nextUrl = `/history/launch/${created.id}${params.toString() ? `?${params.toString()}` : ''}`

    navigate(nextUrl, { replace: true })
  }, [skillId, agent.createdCapability, agent.messages, agent.workId, routeWorkId, navigate])

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
  const displayWorkTitle = workTitle || '这项工作'
  const effectiveStatus = effectiveRunning
    ? '运行中'
    : agent.pendingQuestion
      ? '待补充'
      : agent.error
        ? '失败'
        : agent.messages.length > 0
          ? '已完成'
          : null
  const effectiveStatusBadgeClass = effectiveStatus === '运行中'
    ? 'badge badge-primary'
    : effectiveStatus === '待补充'
      ? 'badge badge-warning'
      : effectiveStatus === '失败'
        ? 'badge badge-error'
        : effectiveStatus === '已完成'
          ? 'badge badge-success'
          : ''

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                      顶部导航栏                                          │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  const header = (
    <WorkDetailHeader
      title={displayWorkTitle}
      onBack={handleBackToHome}
      statusLabel={effectiveStatus}
      statusBadgeClassName={effectiveStatusBadgeClass}
      rightSlot={(
        <>
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
        </>
      )}
      tabs={hasAssistantTab ? [
        { id: 'assistant', label: assistantLabel },
        { id: 'employee', label: displaySkillName },
      ] : undefined}
      activeTab={hasAssistantTab ? activeTab : undefined}
      onTabChange={hasAssistantTab ? (tabId) => setActiveTab(tabId as 'employee' | 'assistant') : undefined}
    />
  )

  return (
    <div className="h-[calc(100vh-64px)]">
      {activeTab === 'assistant' && hasAssistantTab ? (
        <div className="h-full">
          {header}
          <ConversationWorkspaceView
            messages={converse.messages}
            isRunning={converse.isThinking}
            pendingQuestion={converse.pendingQuestion}
            respondToQuestion={converse.respondToQuestion}
            onSubmit={converse.sendMessage}
            onStop={converse.stop}
            placeholder="继续把要求交给个人助理..."
            emptyText="暂无助理会话记录"
          />
        </div>
      ) : (
        <ExecutionPanel
          key={`${agent.sessionId || 'empty'}:${agent.workDir || 'no-workdir'}`}
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
      )}

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
