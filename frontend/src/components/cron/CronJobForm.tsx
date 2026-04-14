/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     定时任务表单组件                                       ║
 * ║                                                                          ║
 * ║  职责：创建和编辑定时任务                                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import type {
  CronJob,
  CreateJobRequest,
  Schedule,
  ExecutionTarget,
  JobNotifyChannel,
  DeliveryStatusResponse,
} from '../../hooks/useCron'
import { ScheduleInput } from './ScheduleInput'
import { TargetInput } from './TargetInput'
import { useModelProfile } from '../../contexts/ModelProfileContext'

interface Props {
  job: CronJob | null
  deliveryStatus: DeliveryStatusResponse | null
  deliveryStatusLoading: boolean
  onSubmit: (data: CreateJobRequest) => Promise<void>
  onCancel: () => void
}

type ExternalDeliveryChannel = 'none' | 'email' | 'feishu_dm' | 'qq_dm' | 'wechat_dm'

export function CronJobForm({ job, deliveryStatus, deliveryStatusLoading, onSubmit, onCancel }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [schedule, setSchedule] = useState<Schedule>({ kind: 'every', everyMs: 3600000 })
  const [target, setTarget] = useState<ExecutionTarget>({ type: 'skill', id: '', query: '' })
  const [modelProfileId, setModelProfileId] = useState<string>('')
  const [deliveryChannel, setDeliveryChannel] = useState<ExternalDeliveryChannel>('none')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { profiles } = useModelProfile()

  // 编辑模式：填充现有数据
  useEffect(() => {
    if (!job) return

    setName(job.name)
    setDescription(job.description || '')
    setEnabled(job.enabled)
    setTarget({ type: job.targetType, id: job.targetId, query: job.targetQuery })
    setModelProfileId((job as any).modelProfileId || '')
    setDeliveryChannel(job.notifyChannel && job.notifyChannel !== 'app'
      ? (job.notifyChannel as ExternalDeliveryChannel)
      : 'none')

    // 重建 Schedule
    if (job.scheduleKind === 'at') {
      setSchedule({ kind: 'at', atMs: job.scheduleAtMs! })
    } else if (job.scheduleKind === 'every') {
      setSchedule({ kind: 'every', everyMs: job.scheduleEveryMs! })
    } else {
      setSchedule({ kind: 'cron', expr: job.scheduleCronExpr!, tz: job.scheduleCronTz })
    }
  }, [job])

  useEffect(() => {
    if (!modelProfileId) return
    if (profiles.some((profile) => profile.id === modelProfileId)) return
    setModelProfileId('')
  }, [modelProfileId, profiles])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('请输入任务名称')
      return
    }

    if (!target.id) {
      setError('请选择执行目标')
      return
    }

    if (!target.query.trim()) {
      setError('请输入执行内容')
      return
    }

    const externalChannel = deliveryChannel === 'none' ? 'app' : deliveryChannel
    const channelState = deliveryStatus?.channels?.[externalChannel as JobNotifyChannel]

    if (deliveryChannel !== 'none' && !channelState?.enabled) {
      setError(channelState?.reason || '当前送达通道不可用，请先完成配置')
      return
    }

    const notify = (() => {
      if (deliveryChannel === 'none') {
        return { channel: 'app' as const }
      }
      if (deliveryChannel === 'email') {
        return { channel: 'email' as const }
      }
      if (deliveryChannel === 'feishu_dm') {
        return {
          channel: 'feishu_dm' as const,
          feishuOpenId: channelState?.resolvedRecipientId,
        }
      }
      if (deliveryChannel === 'qq_dm') {
        return {
          channel: 'qq_dm' as const,
          qqOpenId: channelState?.resolvedRecipientId,
        }
      }
      return {
        channel: 'wechat_dm' as const,
        wechatUserId: channelState?.resolvedRecipientId,
      }
    })()

    setSubmitting(true)
    try {
      await onSubmit({ name, description, schedule, target, enabled, modelProfileId, notify })
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const externalChannelOptions: Array<{
    value: ExternalDeliveryChannel
    label: string
    description: string
  }> = [
    { value: 'none', label: '无额外送达', description: '仅保留应用内通知' },
    { value: 'email', label: '邮箱', description: '额外发送到通知邮箱' },
    { value: 'feishu_dm', label: '飞书私聊', description: '额外发送到飞书私聊' },
    { value: 'qq_dm', label: 'QQ 私聊', description: '额外发送到 QQ 私聊' },
    { value: 'wechat_dm', label: '微信私聊', description: '额外发送到微信私聊' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/60 bg-card shadow-2xl shadow-slate-950/20">
        {/* 头部 */}
        <div className="shrink-0 flex items-start justify-between border-b border-border/80 bg-gradient-to-r from-background via-background to-muted/30 px-7 py-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/70">
              Calendar Automation
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {job ? '编辑日历安排' : '新建日历安排'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              把重复工作安排进日历，到时间后由对应同事自动执行，并按你的要求把结果送回来。
            </p>
          </div>
          <button
            onClick={onCancel}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
          {error && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="space-y-6">
            <section className="rounded-3xl border border-border/80 bg-card/70 p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">基础信息</h3>
                  <p className="text-sm leading-6 text-muted-foreground">先告诉系统这项安排是什么，以及它为什么存在。</p>
                </div>
              </div>

              <div className="grid gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    安排名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：每周一早会前生成投研简报"
                    className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    安排说明（可选）
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="补充说明这项安排的用途、场景或背景"
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-[15px] leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-border/80 bg-card/70 p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">时间规则</h3>
                  <p className="text-sm leading-6 text-muted-foreground">定义这项工作何时触发，是一次性、周期性还是 Cron 表达式。</p>
                </div>
              </div>
              <ScheduleInput value={schedule} onChange={setSchedule} />
            </section>

            <section className="rounded-3xl border border-border/80 bg-card/70 p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5V4H2v16h5m10 0v-3.586a1 1 0 00-.293-.707l-2.414-2.414a1 1 0 00-.707-.293H10.414a1 1 0 00-.707.293l-2.414 2.414a1 1 0 00-.293.707V20m10 0H7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">负责人和工作内容</h3>
                  <p className="text-sm leading-6 text-muted-foreground">选择负责同事，并明确这次自动执行时要完成什么结果。</p>
                </div>
              </div>

              <TargetInput value={target} onChange={setTarget} />

              {profiles.length > 0 && (
                <div className="mt-5 border-t border-border/70 pt-5">
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    负责同事的工作模型
                  </label>
                  <select
                    value={modelProfileId}
                    onChange={e => setModelProfileId(e.target.value)}
                    className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">默认（{profiles[0]?.name || '第一个配置'}）</option>
                    {profiles.map((p, idx) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{idx === 0 ? '（默认）' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-sm text-muted-foreground">
                    如果不单独指定，系统会沿用当前默认模型配置。
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-border/80 bg-card/70 p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V4a2 2 0 10-4 0v1.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">结果送达</h3>
                  <p className="text-sm leading-6 text-muted-foreground">应用内通知会保留，你可以再选择一种额外送达方式。</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {externalChannelOptions.map((item) => {
                  const channelState = item.value === 'none'
                    ? { enabled: true }
                    : deliveryStatus?.channels?.[item.value as JobNotifyChannel]
                  const isUnavailable = item.value !== 'none' && channelState?.enabled === false
                  const isSelected = deliveryChannel === item.value
                  const canClick = !isUnavailable || isSelected

                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        if (!canClick) return
                        setDeliveryChannel(item.value as ExternalDeliveryChannel)
                      }}
                      disabled={!canClick}
                      className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/[0.07] shadow-sm shadow-primary/10'
                          : isUnavailable
                            ? 'border-border/70 bg-muted/20 text-muted-foreground/60 cursor-not-allowed'
                            : 'border-border bg-background hover:border-primary/30 hover:bg-accent/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className={`text-[15px] font-semibold ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                            {item.label}
                          </div>
                          <div className="mt-1 text-sm leading-5 text-muted-foreground">
                            {item.description}
                          </div>
                        </div>
                        <div className={`mt-0.5 h-5 w-5 rounded-full border ${
                          isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'
                        }`}>
                          {isSelected && (
                            <svg className="h-5 w-5 p-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>

                      {item.value !== 'none' && isUnavailable && (
                        <div className="mt-3 text-sm leading-5 text-red-500 dark:text-red-300">
                          {channelState?.reason || '当前不可用'}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              <p className="mt-3 text-sm text-muted-foreground">
                {({
                  none: '这项安排完成后只会保留应用内通知。',
                  email: '任务完成后会额外发到通知邮箱。',
                  feishu_dm: '任务完成后会额外发到飞书私聊。',
                  qq_dm: '任务完成后会额外发到 QQ 私聊。',
                  wechat_dm: '任务完成后会额外发到微信私聊。',
                } as const)[deliveryChannel]}
              </p>
            </section>

            <section className="rounded-3xl border border-border/80 bg-card/70 p-5 shadow-sm">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-5 w-5 rounded border-border text-primary focus:ring-primary/50"
                />
                <span>
                  <span className="block text-[15px] font-medium text-foreground">启用这项安排</span>
                  <span className="block text-sm text-muted-foreground">关闭后不会按时间自动执行，但会保留规则与历史记录。</span>
                </span>
              </label>
            </section>
          </div>

          <div className="sticky bottom-0 mt-8 flex flex-col gap-4 border-t border-border/80 bg-card/95 px-1 pt-5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              保存后可在右侧查看执行记录，并随时手动触发一次。
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-2xl border border-border px-4 py-2.5 text-foreground transition-colors hover:bg-accent"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting || deliveryStatusLoading}
                className="rounded-2xl bg-primary px-5 py-2.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? '提交中...' : deliveryStatusLoading ? '加载中...' : job ? '保存安排' : '创建安排'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
