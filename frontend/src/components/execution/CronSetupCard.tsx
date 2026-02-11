/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                  定时任务确认卡片 - CronSetupCard                       ║
 * ║                                                                        ║
 * ║  职责：在对话流中内联显示定时任务确认 UI                                 ║
 * ║  设计：纯展示 + 回调，状态由父组件管理                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState } from 'react'
import { cronToHuman } from '../../utils/cronHuman'
import { useSkillNameMap } from '../../hooks/useSkillNameMap'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export interface CronSetupCardProps {
  schedule: string
  timezone?: string
  targetQuery: string
  targetType?: 'skill'
  targetId?: string
  onConfirm: (payload: {
    schedule: string
    timezone?: string
    targetQuery: string
    targetType: 'skill'
    targetId: string
  }) => void | Promise<void>
  onCancel: () => void
}

type CardStatus = 'pending' | 'confirming' | 'success' | 'error'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主组件                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function CronSetupCard({
  schedule,
  timezone,
  targetQuery,
  targetType,
  targetId,
  onConfirm,
  onCancel,
}: CronSetupCardProps) {
  const [status, setStatus] = useState<CardStatus>('pending')
  const [errMsg, setErrMsg] = useState('')
  const [draftSchedule, setDraftSchedule] = useState(schedule)
  const [draftTimezone, setDraftTimezone] = useState(timezone || '')
  const [draftTargetQuery, setDraftTargetQuery] = useState(targetQuery)
  const [draftTargetType] = useState<'skill'>(targetType || 'skill')
  const [draftTargetId, setDraftTargetId] = useState(targetId || '')
  const humanDesc = cronToHuman(draftSchedule)
  const { getCapabilityName } = useSkillNameMap()
  const displayTargetName = draftTargetId
    ? getCapabilityName(draftTargetId)
    : ''

  async function handleConfirm() {
    if (!draftSchedule.trim()) {
      setStatus('error')
      setErrMsg('请填写 cron 表达式')
      return
    }
    if (!draftTargetId.trim()) {
      setStatus('error')
      setErrMsg('请填写执行目标 ID')
      return
    }
    if (!draftTargetQuery.trim()) {
      setStatus('error')
      setErrMsg('请填写执行内容')
      return
    }

    setStatus('confirming')
    try {
      await onConfirm({
        schedule: draftSchedule.trim(),
        timezone: draftTimezone.trim() || undefined,
        targetQuery: draftTargetQuery.trim(),
        targetType: draftTargetType,
        targetId: draftTargetId.trim(),
      })
      setStatus('success')
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : '创建失败')
      setStatus('error')
    }
  }

  /* ── 成功态：简洁反馈 ── */
  if (status === 'success') {
    return (
      <div className="my-3 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 max-w-md">
        <p className="text-green-700 dark:text-green-400 text-sm font-medium">
          定时任务已创建 — {humanDesc}
        </p>
      </div>
    )
  }

  return (
    <div className="my-3 rounded-xl border border-border bg-card p-4 shadow-sm max-w-md">
      <Header />
      <ScheduleEditor
        humanDesc={humanDesc}
        schedule={draftSchedule}
        timezone={draftTimezone}
        onScheduleChange={setDraftSchedule}
        onTimezoneChange={setDraftTimezone}
      />
      <TaskRow
        targetQuery={draftTargetQuery}
        targetType={draftTargetType}
        targetName={displayTargetName}
        targetId={draftTargetId}
        onTargetQueryChange={setDraftTargetQuery}
        onTargetIdChange={setDraftTargetId}
      />
      <Actions
        status={status}
        errMsg={errMsg}
        onConfirm={handleConfirm}
        onCancel={onCancel}
      />
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      子组件：卡片标题                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function Header() {
  return (
    <div className="flex items-center gap-2 mb-3">
      <ClockIcon />
      <span className="text-sm font-semibold text-foreground">定时任务确认</span>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      子组件：调度信息行                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function ScheduleEditor({
  humanDesc,
  schedule,
  timezone,
  onScheduleChange,
  onTimezoneChange,
}: {
  humanDesc: string
  schedule: string
  timezone?: string
  onScheduleChange: (value: string) => void
  onTimezoneChange: (value: string) => void
}) {
  return (
    <div className="mb-3 space-y-2">
      <p className="text-sm text-foreground font-medium">{humanDesc}</p>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Cron 表达式</label>
        <input
          value={schedule}
          onChange={(e) => onScheduleChange(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono"
          placeholder="0 9 * * *"
        />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">时区</label>
        <input
          value={timezone || ''}
          onChange={(e) => onTimezoneChange(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          placeholder="Asia/Shanghai"
        />
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      子组件：目标任务行                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function TaskRow({
  targetQuery,
  targetType,
  targetName,
  targetId,
  onTargetQueryChange,
  onTargetIdChange,
}: {
  targetQuery: string
  targetType: 'skill'
  targetName?: string
  targetId: string
  onTargetQueryChange: (value: string) => void
  onTargetIdChange: (value: string) => void
}) {
  const targetLabel = '能力单元'

  return (
    <div className="mb-3 p-2 rounded-lg bg-accent/50 space-y-2">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">执行内容</label>
        <textarea
          value={targetQuery}
          onChange={(e) => onTargetQueryChange(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          rows={3}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">目标类型</label>
          <input
            value={targetType}
            disabled
            className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-xs text-muted-foreground"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">目标 ID</label>
          <input
            value={targetId}
            onChange={(e) => onTargetIdChange(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            placeholder="skill-id"
          />
        </div>
      </div>
      {targetName && (
        <p className="text-xs text-muted-foreground mt-0.5">
          目标：{targetLabel} / {targetName}
        </p>
      )}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      子组件：操作按钮区                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function Actions({ status, errMsg, onConfirm, onCancel }: {
  status: CardStatus
  errMsg: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div>
      {status === 'error' && (
        <p className="text-xs text-red-500 mb-2">{errMsg}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={status === 'confirming'}
          className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {status === 'confirming' ? '创建中...' : '确认创建'}
        </button>
        <button
          onClick={onCancel}
          disabled={status === 'confirming'}
          className="px-4 py-1.5 rounded-lg border border-border text-foreground text-sm hover:bg-accent transition-colors disabled:opacity-50"
        >
          取消
        </button>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      图标：时钟 SVG                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function ClockIcon() {
  return (
    <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
