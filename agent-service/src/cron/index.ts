/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Cron 定时任务 - 统一导出                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

// 类型导出
export type {
  Schedule,
  ScheduleKind,
  ScheduleAt,
  ScheduleEvery,
  ScheduleCron,
  TargetType,
  ExecutionTarget,
  JobSourceChannel,
  JobNotifyChannel,
  JobSource,
  JobNotify,
  CronJob,
  CronRun,
  CreateJobRequest,
  UpdateJobRequest
} from './types.js'

export { flattenSchedule, unflattenSchedule } from './types.js'

// 调度计算
export {
  computeNextRunAtMs,
  computeNextRunFromJob,
  validateCronExpr,
  describeSchedule
} from './schedule.js'

// 数据库操作
export {
  listJobs,
  getJob,
  listJobsBySourceOpenId,
  createJob,
  updateJob,
  deleteJob,
  getJobRuns,
  getDueJobs,
  // 通知相关
  createNotification,
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead
} from './store.js'

export type { Notification, CreateNotificationRequest } from './store.js'

// 定时器管理
export {
  startCronTimer,
  stopCronTimer,
  triggerPoll,
  getCronTimerStatus
} from './timer.js'

// 任务执行
export { runJob, triggerJob } from './executor.js'

// 通知发送
export { notifyJobComplete, notifyTaskComplete, sendTestEmail, resetNotifierTransport } from './notifier.js'
