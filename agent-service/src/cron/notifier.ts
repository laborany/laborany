/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Cron 定时任务 - 通知发送                              ║
 * ║                                                                          ║
 * ║  职责：任务执行完成后发送通知（系统通知 + 邮件）                            ║
 * ║  设计：统一通知入口，支持多种通知渠道                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { createTransport, type Transporter } from 'nodemailer'
import { createNotification } from './store.js'
import type { CronJob } from './types.js'
import { sendTextToOpenId, sendArtifactsToOpenId } from '../feishu/push.js'
import { sendTextToTarget, sendArtifactsToTarget } from '../qq/push.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           配置读取                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

interface NotifyConfig {
  email?: string
  notifyOnSuccess: boolean
  notifyOnError: boolean
  smtp?: {
    host: string
    port: number
    user: string
    pass: string
  }
}

function getNotifyConfig(): NotifyConfig {
  return {
    email: process.env.NOTIFICATION_EMAIL,
    notifyOnSuccess: process.env.NOTIFY_ON_SUCCESS !== 'false',
    notifyOnError: process.env.NOTIFY_ON_ERROR !== 'false',
    smtp: process.env.SMTP_HOST ? {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    } : undefined
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           邮件发送                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

let transporter: Transporter | null = null

export function resetNotifierTransport(): void {
  if (!transporter) return
  try {
    transporter.close()
  } catch {
    // ignore close errors and rebuild on next send
  }
  transporter = null
}

function getTransporter(): Transporter | null {
  if (transporter) return transporter

  const config = getNotifyConfig()
  if (!config.smtp) return null

  transporter = createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  })

  return transporter
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const transport = getTransporter()
  if (!transport) return false

  const config = getNotifyConfig()
  if (!config.smtp) return false

  try {
    await transport.sendMail({
      from: config.smtp.user,
      to,
      subject,
      html,
    })
    console.log(`[Notifier] 邮件发送成功: ${to}`)
    return true
  } catch (err) {
    console.error('[Notifier] 邮件发送失败:', err)
    return false
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           通知发送入口                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export async function notifyJobComplete(
  job: CronJob,
  status: 'ok' | 'error' | 'aborted',
  sessionId: string,
  error?: string,
  runStartedAtMs?: number,
): Promise<void> {
  const config = getNotifyConfig()
  const isSuccess = status === 'ok'
  const isAborted = status === 'aborted'

  // 检查是否需要通知
  const shouldNotify = isSuccess ? config.notifyOnSuccess : config.notifyOnError
  if (!shouldNotify) return

  const title = `${job.name} ${isSuccess ? '执行成功' : isAborted ? '已中止' : '执行失败'}`
  const content = error || (isAborted ? '任务已中止' : '任务已完成')

  if (job.notifyChannel === 'feishu_dm' && job.notifyFeishuOpenId) {
    const summary = buildFeishuSummaryText(job, status, sessionId, error)
    const summarySent = await sendTextToOpenId(job.notifyFeishuOpenId, summary)
    if (!summarySent) {
      console.warn(`[Notifier] 飞书摘要推送失败: job=${job.id}`)
      createNotification({
        type: isSuccess ? 'cron_success' : 'cron_error',
        title: `${title}（飞书推送失败）`,
        content,
        jobId: job.id,
        sessionId,
      })
      return
    }

    if (isSuccess) {
      const artifacts = await sendArtifactsToOpenId(job.notifyFeishuOpenId, sessionId, runStartedAtMs)
      if (artifacts.sent > 0 || artifacts.failed > 0 || artifacts.skipped > 0) {
        const followup = `文件回传结果：成功 ${artifacts.sent}，失败 ${artifacts.failed}，跳过 ${artifacts.skipped}。`
        await sendTextToOpenId(job.notifyFeishuOpenId, followup)
      }
    }
    return
  }

  if (job.notifyChannel === 'qq_dm' && job.notifyQqOpenId) {
    const summary = buildQqSummaryText(job, status, sessionId, error)
    const summarySent = await sendTextToTarget(job.notifyQqOpenId, 'c2c', summary)
    if (!summarySent) {
      console.warn(`[Notifier] QQ 摘要推送失败: job=${job.id}`)
      createNotification({
        type: isSuccess ? 'cron_success' : 'cron_error',
        title: `${title}（QQ 推送失败）`,
        content,
        jobId: job.id,
        sessionId,
      })
      return
    }

    const artifacts = await sendArtifactsToTarget(job.notifyQqOpenId, 'c2c', sessionId, runStartedAtMs)
    if (artifacts.sent > 0 || artifacts.failed > 0 || artifacts.skipped > 0) {
      const followup = `文件回传结果：成功 ${artifacts.sent}，失败 ${artifacts.failed}，跳过 ${artifacts.skipped}。`
      await sendTextToTarget(job.notifyQqOpenId, 'c2c', followup)
    }
    return
  }

  // 默认通知渠道：写入 app 内通知
  createNotification({
    type: isSuccess ? 'cron_success' : 'cron_error',
    title,
    content,
    jobId: job.id,
    sessionId,
  })

  // 发送邮件（如配置）
  if (config.email && config.smtp) {
    const html = buildEmailHtml(job, status, sessionId, error)
    await sendEmail(config.email, `[LaborAny] ${title}`, html)
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     后台任务完成通知                                      │
 * │                                                                          │
 * │  与定时任务不同，后台任务仅写入 app 内通知，不发送邮件                      │
 * │  因为用户正在使用 app，无需额外的邮件提醒                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function notifyTaskComplete(
  sessionId: string,
  skillName: string,  // 用户友好的名称（如"金融研报助手"）
  status: 'ok' | 'error',
  error?: string
): void {
  const isSuccess = status === 'ok'
  const title = `${skillName} ${isSuccess ? '执行完成' : '执行失败'}`
  const content = error || '后台任务已完成'

  // 仅写入 app 内通知，不发送邮件
  createNotification({
    type: isSuccess ? 'task_success' : 'task_error',
    title,
    content,
    sessionId,
  })

  console.log(`[Notifier] 后台任务通知: ${title}`)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           测试邮件                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export async function sendTestEmail(): Promise<{ success: boolean; error?: string }> {
  const config = getNotifyConfig()

  if (!config.email) {
    return { success: false, error: '未配置通知邮箱 (NOTIFICATION_EMAIL)' }
  }

  if (!config.smtp) {
    return { success: false, error: '未配置 SMTP 服务器' }
  }

  // 每次测试都创建新的 transporter，确保使用最新配置
  const transport = createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  })

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f0fdf4; padding: 20px; border-radius: 8px; border: 1px solid #bbf7d0; }
    .success { color: #16a34a; }
    .info { background: #f1f5f9; padding: 16px; border-radius: 8px; margin: 16px 0; }
    .footer { color: #94a3b8; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 class="success" style="margin: 0;">✅ 邮件配置测试成功！</h2>
    </div>
    <div class="info">
      <p style="margin: 0;">恭喜！你的邮件通知已配置成功。</p>
      <p style="margin: 8px 0 0 0;">当定时任务执行完成后，你将收到类似的邮件通知。</p>
    </div>
    <div class="footer">
      <p>此邮件由 LaborAny 自动发送，请勿回复。</p>
      <p>发送时间: ${new Date().toLocaleString('zh-CN')}</p>
    </div>
  </div>
</body>
</html>
  `.trim()

  try {
    await transport.sendMail({
      from: config.smtp.user,
      to: config.email,
      subject: '[LaborAny] 邮件配置测试成功',
      html,
    })
    console.log(`[Notifier] 测试邮件发送成功: ${config.email}`)
    return { success: true }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[Notifier] 测试邮件发送失败:', errorMsg)
    return { success: false, error: errorMsg }
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           邮件模板                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function buildEmailHtml(
  job: CronJob,
  status: 'ok' | 'error' | 'aborted',
  sessionId: string,
  error?: string
): string {
  const isSuccess = status === 'ok'
  const isAborted = status === 'aborted'
  const statusColor = isSuccess ? '#22c55e' : isAborted ? '#f59e0b' : '#ef4444'
  const statusText = isSuccess ? '执行成功' : isAborted ? '已中止' : '执行失败'

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 4px; color: white; font-weight: 500; }
    .info { background: #f1f5f9; padding: 16px; border-radius: 8px; margin: 16px 0; }
    .info-row { display: flex; margin: 8px 0; }
    .info-label { color: #64748b; width: 80px; }
    .info-value { color: #1e293b; }
    .error { background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 8px; color: #dc2626; }
    .footer { color: #94a3b8; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0 0 12px 0;">🤖 LaborAny 定时任务通知</h2>
      <span class="status" style="background: ${statusColor};">${statusText}</span>
    </div>

    <div class="info">
      <div class="info-row">
        <span class="info-label">任务名称</span>
        <span class="info-value">${job.name}</span>
      </div>
      <div class="info-row">
        <span class="info-label">执行类型</span>
        <span class="info-value">Skill</span>
      </div>
      <div class="info-row">
        <span class="info-label">会话 ID</span>
        <span class="info-value">${sessionId}</span>
      </div>
      <div class="info-row">
        <span class="info-label">执行时间</span>
        <span class="info-value">${new Date().toLocaleString('zh-CN')}</span>
      </div>
    </div>

    ${error ? `<div class="error"><strong>错误信息：</strong>${error}</div>` : ''}

    <div class="footer">
      <p>此邮件由 LaborAny 自动发送，请勿回复。</p>
    </div>
  </div>
</body>
</html>
  `.trim()
}

function buildFeishuSummaryText(
  job: CronJob,
  status: 'ok' | 'error' | 'aborted',
  sessionId: string,
  error?: string,
): string {
  const statusLabel = status === 'ok' ? '执行成功' : status === 'aborted' ? '已中止' : '执行失败'
  const now = new Date()
  const when = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  const lines = [
    `【LaborAny 定时任务】${statusLabel}`,
    `任务：${job.name}`,
    `时间：${when}`,
    `会话：${sessionId}`,
  ]
  if (error) lines.push(`错误：${error}`)
  return lines.join('\n')
}

function buildQqSummaryText(
  job: CronJob,
  status: 'ok' | 'error',
  sessionId: string,
  error?: string,
): string {
  const statusLabel = status === 'ok' ? '执行成功' : '执行失败'
  const when = new Date().toLocaleString('zh-CN')
  const lines = [
    `【LaborAny 定时任务】${statusLabel}`,
    `任务：${job.name}`,
    `时间：${when}`,
    `会话：${sessionId}`,
  ]
  if (error) lines.push(`错误：${error}`)
  return lines.join('\n')
}
