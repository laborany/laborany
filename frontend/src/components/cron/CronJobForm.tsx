/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     定时任务表单组件                                       ║
 * ║                                                                          ║
 * ║  职责：创建和编辑定时任务                                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import type { CronJob, CreateJobRequest, Schedule, ExecutionTarget } from '../../hooks/useCron'
import { ScheduleInput } from './ScheduleInput'
import { TargetInput } from './TargetInput'
import { useModelProfile } from '../../contexts/ModelProfileContext'

interface Props {
  job: CronJob | null
  onSubmit: (data: CreateJobRequest) => Promise<void>
  onCancel: () => void
}

export function CronJobForm({ job, onSubmit, onCancel }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [schedule, setSchedule] = useState<Schedule>({ kind: 'every', everyMs: 3600000 })
  const [target, setTarget] = useState<ExecutionTarget>({ type: 'skill', id: '', query: '' })
  const [modelProfileId, setModelProfileId] = useState<string>('')
  const [deliveryChannel, setDeliveryChannel] = useState<'app' | 'email' | 'feishu' | 'qq'>('app')
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

    setSubmitting(true)
    try {
      await onSubmit({ name, description, schedule, target, enabled, modelProfileId })
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {job ? '编辑日历安排' : '新建日历安排'}
          </h2>
          <button
            onClick={onCancel}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* 任务名称 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              安排名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：每周一早会前生成投研简报"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* 安排说明 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              安排说明（可选）
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="补充说明这项安排的用途、场景或背景"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          {/* 日历规则 */}
          <ScheduleInput value={schedule} onChange={setSchedule} />

          {/* 负责人和工作内容 */}
          <TargetInput value={target} onChange={setTarget} />

          {/* 执行模型 */}
          {profiles.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                负责同事的工作模型
              </label>
              <select
                value={modelProfileId}
                onChange={e => setModelProfileId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">默认（{profiles[0]?.name || '第一个配置'}）</option>
                {profiles.map((p, idx) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{idx === 0 ? '（默认）' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 结果送达方式（前端预设） */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              结果送达方式
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'app', label: '应用内', desc: '在工作记录和通知里查看' },
                { value: 'email', label: '邮箱', desc: '结果发到老板邮箱' },
                { value: 'feishu', label: '飞书', desc: '结果发到飞书机器人' },
                { value: 'qq', label: 'QQ', desc: '结果发到 QQ Bot' },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setDeliveryChannel(item.value as typeof deliveryChannel)}
                  className={`rounded-full border px-3 py-1.5 text-left transition-colors ${
                    deliveryChannel === item.value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <div className="text-xs font-medium">{item.label}</div>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              当前先用于安排预设。真实送达通道会在后续重构 phase 接入。
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {({
                app: '结果会保留在应用内查看。',
                email: '后续将支持把结果发到老板邮箱。',
                feishu: '后续将支持把结果发到飞书。',
                qq: '后续将支持把结果发到 QQ。',
              } as const)[deliveryChannel]}
            </p>
          </div>

          {/* 启用状态 */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50"
            />
            <label htmlFor="enabled" className="text-sm text-foreground">
              启用这项安排
            </label>
          </div>

          {/* 按钮 */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-border text-foreground hover:bg-accent transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {submitting ? '提交中...' : job ? '保存安排' : '创建安排'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
