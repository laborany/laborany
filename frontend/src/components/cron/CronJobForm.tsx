/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     定时任务表单组件                                       ║
 * ║                                                                          ║
 * ║  职责：创建和编辑定时任务                                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect } from 'react'
import type { CronJob, CreateJobRequest, Schedule, ExecutionTarget } from '../../hooks/useCron'
import { ScheduleInput } from './ScheduleInput'
import { TargetInput } from './TargetInput'

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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 编辑模式：填充现有数据
  useEffect(() => {
    if (!job) return

    setName(job.name)
    setDescription(job.description || '')
    setEnabled(job.enabled)
    setTarget({ type: job.targetType, id: job.targetId, query: job.targetQuery })

    // 重建 Schedule
    if (job.scheduleKind === 'at') {
      setSchedule({ kind: 'at', atMs: job.scheduleAtMs! })
    } else if (job.scheduleKind === 'every') {
      setSchedule({ kind: 'every', everyMs: job.scheduleEveryMs! })
    } else {
      setSchedule({ kind: 'cron', expr: job.scheduleCronExpr!, tz: job.scheduleCronTz })
    }
  }, [job])

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
      await onSubmit({ name, description, schedule, target, enabled })
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
            {job ? '编辑定时任务' : '新建定时任务'}
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
              任务名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：每日股票分析"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* 任务描述 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              描述（可选）
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述这个任务的用途"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          {/* 调度配置 */}
          <ScheduleInput value={schedule} onChange={setSchedule} />

          {/* 执行目标 */}
          <TargetInput value={target} onChange={setTarget} />

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
              启用任务
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
              {submitting ? '提交中...' : job ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
