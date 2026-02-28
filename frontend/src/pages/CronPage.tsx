/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     定时任务管理页面                                       ║
 * ║                                                                          ║
 * ║  职责：展示任务列表、创建/编辑任务、查看执行历史                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCronJobs, useCronJobRuns, describeSchedule, formatTime, formatDuration } from '../hooks/useCron'
import type { CronJob, CreateJobRequest, Schedule } from '../hooks/useCron'
import { CronJobForm } from '../components/cron/CronJobForm'
import { useSkillNameMap } from '../hooks/useSkillNameMap'
import { useModelProfile } from '../contexts/ModelProfileContext'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           状态图标                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function StatusBadge({ status }: { status: CronJob['lastStatus'] }) {
  if (!status) return <span className="text-muted-foreground text-xs">未执行</span>

  const styles = {
    ok: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
  }

  const labels = { ok: '成功', error: '失败', running: '运行中' }

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           任务卡片                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function JobCard({
  job,
  targetName,
  onEdit,
  onDelete,
  onTrigger,
  onViewRuns,
  isSelected,
  modelLabel,
}: {
  job: CronJob
  targetName: string
  onEdit: () => void
  onDelete: () => void
  onTrigger: () => void
  onViewRuns: () => void
  isSelected: boolean
  modelLabel: string
}) {
  const schedule: Schedule = job.scheduleKind === 'at'
    ? { kind: 'at', atMs: job.scheduleAtMs! }
    : job.scheduleKind === 'every'
    ? { kind: 'every', everyMs: job.scheduleEveryMs! }
    : { kind: 'cron', expr: job.scheduleCronExpr!, tz: job.scheduleCronTz }

  return (
    <div
      className={`p-4 rounded-lg border transition-colors cursor-pointer ${
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50'
      }`}
      onClick={onViewRuns}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-foreground truncate">{job.name}</h3>
            {!job.enabled && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                已禁用
              </span>
            )}
          </div>
          {job.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {job.description}
            </p>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span title="调度规则">⏰ {describeSchedule(schedule)}</span>
            <span title="目标">
              🧪 {targetName}
            </span>
            <span title="模型">
              🤖 {modelLabel}
            </span>
            <span title="来源">
              📍 {job.sourceChannel === 'feishu' ? '飞书' : '桌面'}
            </span>
            <span title="通知">
              🔔 {job.notifyChannel === 'feishu_dm' ? '飞书私聊' : '应用内'}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={job.lastStatus} />
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onTrigger() }}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              title="立即执行"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              title="编辑"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-600"
              title="删除"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {job.nextRunAtMs && (
        <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
          下次执行: {formatTime(job.nextRunAtMs)}
        </div>
      )}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           执行历史面板                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function RunsPanel({ jobId, jobName }: { jobId: string; jobName: string }) {
  const { runs, loading, error } = useCronJobRuns(jobId)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return <div className="text-center py-8 text-red-500">{error}</div>
  }

  if (runs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        暂无执行记录
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h3 className="font-medium text-foreground mb-3">
        {jobName} - 执行历史
      </h3>
      {runs.map((run) => (
        <div
          key={run.id}
          className="p-3 rounded-lg border border-border bg-card"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                run.status === 'ok' ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <span className="text-sm text-foreground">
                {run.status === 'ok' ? '执行成功' : '执行失败'}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {formatDuration(run.durationMs)}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {new Date(run.startedAt.endsWith('Z') ? run.startedAt : run.startedAt + 'Z').toLocaleString('zh-CN')}
          </div>
          {run.error && (
            <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-400">
              {run.error}
            </div>
          )}
          {run.sessionId && (
            <Link
              to={`/history/${run.sessionId}`}
              className="mt-2 text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              查看详情 →
            </Link>
          )}
        </div>
      ))}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主页面组件                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export default function CronPage() {
  const { jobs, loading, error, createJob, updateJob, deleteJob, triggerJob } = useCronJobs()
  const { getCapabilityName } = useSkillNameMap()
  const { profiles } = useModelProfile()
  const [showForm, setShowForm] = useState(false)
  const [editingJob, setEditingJob] = useState<CronJob | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  const selectedJob = jobs.find(j => j.id === selectedJobId)

  async function handleCreate(data: CreateJobRequest) {
    await createJob(data)
    setShowForm(false)
  }

  async function handleUpdate(data: CreateJobRequest) {
    if (!editingJob) return
    await updateJob(editingJob.id, data)
    setEditingJob(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('确定要删除这个定时任务吗？')) return
    await deleteJob(id)
    if (selectedJobId === id) setSelectedJobId(null)
  }

  async function handleTrigger(id: string) {
    try {
      await triggerJob(id)
    } catch {
      // 错误已在 hook 中处理
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">加载中...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 头部 */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between pl-6 pr-40">
        <h1 className="text-lg font-semibold text-foreground">定时任务</h1>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          + 新建任务
        </button>
      </header>

      {/* 内容区 */}
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* 左侧：任务列表 */}
        <div className="w-1/2 border-r border-border p-6 overflow-y-auto">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {jobs.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">⏰</div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                还没有定时任务
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                创建定时任务，让 AI 自动为你工作
              </p>
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
              >
                创建第一个任务
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  targetName={getCapabilityName(job.targetId)}
                  modelLabel={
                    job.modelProfileId
                      ? (profiles.find((p) => p.id === job.modelProfileId)?.name || '已删除配置（回退默认）')
                      : `默认（${profiles[0]?.name || '第一配置'}）`
                  }
                  isSelected={selectedJobId === job.id}
                  onEdit={() => setEditingJob(job)}
                  onDelete={() => handleDelete(job.id)}
                  onTrigger={() => handleTrigger(job.id)}
                  onViewRuns={() => setSelectedJobId(job.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 右侧：执行历史 */}
        <div className="w-1/2 p-6 overflow-y-auto">
          {selectedJob ? (
            <RunsPanel jobId={selectedJob.id} jobName={selectedJob.name} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              选择一个任务查看执行历史
            </div>
          )}
        </div>
      </div>

      {/* 创建/编辑表单弹窗 */}
      {(showForm || editingJob) && (
        <CronJobForm
          job={editingJob}
          onSubmit={editingJob ? handleUpdate : handleCreate}
          onCancel={() => {
            setShowForm(false)
            setEditingJob(null)
          }}
        />
      )}
    </div>
  )
}
