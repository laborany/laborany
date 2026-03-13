import { v4 as uuid } from 'uuid'
import type { CronJob } from './types.js'
import {
  markJobRunning,
  markJobCompleted,
  releaseJobRunning,
  scheduleRetry,
  createRun,
  completeRun,
} from './store.js'
import { notifyJobComplete } from './notifier.js'

function getSrcApiBaseUrl(): string {
  return (process.env.SRC_API_BASE_URL || 'http://127.0.0.1:3620/api').replace(/\/+$/, '')
}

interface SkillExecuteEvent {
  type?: string
  sessionId?: string
  content?: string
  message?: string
  phase?: string
}

type SkillRunTerminalStatus = 'ok' | 'aborted' | 'stopped' | 'needs_input'

interface SkillRunResult {
  status: SkillRunTerminalStatus
  message?: string
}

export type TriggerJobResult =
  | {
      success: true
      sessionId: string
    }
  | {
      success: false
      errorCode: 'NOT_FOUND' | 'ALREADY_RUNNING' | 'EXECUTION_FAILED'
      error: string
      sessionId?: string
    }

function parseSseBlock(rawBlock: string): SkillExecuteEvent | null {
  const lines = rawBlock.split(/\r?\n/)
  let dataLine = ''

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line.startsWith('data:')) continue
    dataLine += line.slice(5).trimStart()
  }

  if (!dataLine) return null

  try {
    return JSON.parse(dataLine) as SkillExecuteEvent
  } catch {
    return null
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text()
  if (!text) return `HTTP ${response.status}`

  try {
    const payload = JSON.parse(text) as { error?: string; message?: string }
    return payload.error || payload.message || text
  } catch {
    return text
  }
}

async function safeNotifyJobComplete(
  job: CronJob,
  status: 'ok' | 'error' | 'aborted',
  sessionId: string,
  error?: string,
  runStartedAtMs?: number,
): Promise<void> {
  try {
    await notifyJobComplete(job, status, sessionId, error, runStartedAtMs)
  } catch (notifyError) {
    console.error(`[Cron] notify failed: job=${job.id}`, notifyError)
  }
}

async function runSkillJob(job: CronJob, sessionId: string): Promise<SkillRunResult> {
  const response = await fetch(`${getSrcApiBaseUrl()}/skill/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      skill_id: job.targetId,
      query: job.targetQuery,
      sessionId,
      modelProfileId: job.modelProfileId,
    }),
  })

  if (!response.ok) {
    const message = await readErrorMessage(response)
    throw new Error(`Cron call /skill/execute failed: ${message}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Cron cannot read /skill/execute response stream')
  }

  const decoder = new TextDecoder()
  const errors: string[] = []
  let buffer = ''
  let terminalStatus: SkillRunTerminalStatus | null = null
  let lastStatePhase = ''
  let pendingQuestionText = ''
  let needsInputDetected = false

  while (!terminalStatus) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() || ''

    for (const block of blocks) {
      const event = parseSseBlock(block)
      if (!event) continue

      if (event.type === 'session' && event.sessionId && event.sessionId !== sessionId) {
        console.warn(`[Cron] sessionId mismatch, expected=${sessionId}, actual=${event.sessionId}`)
      }

      if (event.type === 'error') {
        const message = event.message || event.content
        if (message) errors.push(message)
      }

      if (event.type === 'question') {
        needsInputDetected = true
        const questionText = event.message || event.content
        if (questionText) {
          pendingQuestionText = questionText
        }
      }

      if (event.type === 'state' && event.phase) {
        lastStatePhase = event.phase
      }

      if (event.type === 'done') {
        if (needsInputDetected || lastStatePhase === 'waiting_input') {
          terminalStatus = 'needs_input'
        } else {
          terminalStatus = 'ok'
        }
        void reader.cancel()
        break
      }

      if (event.type === 'stopped') {
        terminalStatus = 'stopped'
        void reader.cancel()
        break
      }

      if (event.type === 'aborted') {
        terminalStatus = 'aborted'
        void reader.cancel()
        break
      }
    }
  }

  if (!terminalStatus && buffer.trim()) {
    const tailEvent = parseSseBlock(buffer.trim())
    if (tailEvent?.type === 'error') {
      const message = tailEvent.message || tailEvent.content
      if (message) errors.push(message)
    }
    if (tailEvent?.type === 'question') {
      needsInputDetected = true
      pendingQuestionText = tailEvent.message || tailEvent.content || pendingQuestionText
    }
    if (tailEvent?.type === 'state' && tailEvent.phase) {
      lastStatePhase = tailEvent.phase
    }
    if (tailEvent?.type === 'done') {
      terminalStatus = needsInputDetected || lastStatePhase === 'waiting_input' ? 'needs_input' : 'ok'
    }
    if (tailEvent?.type === 'stopped') {
      terminalStatus = 'stopped'
    }
    if (tailEvent?.type === 'aborted') {
      terminalStatus = 'aborted'
    }
  }

  if (needsInputDetected) {
    return {
      status: 'needs_input',
      message: pendingQuestionText || errors.join('; ') || '任务执行需要用户输入',
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '))
  }

  if (!terminalStatus) {
    throw new Error('Cron run ended without a terminal event')
  }

  if (terminalStatus === 'aborted') {
    return { status: 'aborted', message: '任务已中止' }
  }

  if (terminalStatus === 'stopped') {
    return { status: 'stopped', message: '任务已停止' }
  }

  if (terminalStatus === 'needs_input') {
    return {
      status: 'needs_input',
      message: pendingQuestionText || '任务执行需要用户输入',
    }
  }

  return { status: 'ok' }
}

export async function runJob(job: CronJob): Promise<void> {
  const sessionId = `cron-${job.id}-${uuid().slice(0, 8)}`

  const locked = markJobRunning(job.id, sessionId)
  if (!locked) {
    console.log(`[Cron] job ${job.name} is already running, skip`)
    return
  }

  console.log(`[Cron] start job ${job.name} (${job.id})`)
  const startTime = Date.now()
  const runId = createRun(job.id, sessionId)

  try {
    const result = await runSkillJob(job, sessionId)

    const durationMs = Date.now() - startTime
    if (result.status === 'ok') {
      markJobCompleted(job.id, 'ok')
      completeRun(runId, 'ok', undefined, durationMs)
      console.log(`[Cron] job completed: ${job.name}, duration ${durationMs}ms`)
      await safeNotifyJobComplete(job, 'ok', sessionId, undefined, startTime)
      return
    }

    if (result.status === 'needs_input') {
      const terminalMessage = result.message || '任务执行需要用户输入'
      markJobCompleted(job.id, 'error', terminalMessage)
      completeRun(runId, 'error', terminalMessage, durationMs)
      console.log(`[Cron] job needs input: ${job.name}, duration ${durationMs}ms`)
      await safeNotifyJobComplete(job, 'error', sessionId, terminalMessage, startTime)
      return
    }

    const terminalMessage = result.message || (result.status === 'aborted' ? '任务已中止' : '任务已停止')
    markJobCompleted(job.id, 'error', terminalMessage)
    completeRun(runId, 'error', terminalMessage, durationMs)
    console.log(`[Cron] job ${result.status}: ${job.name}, duration ${durationMs}ms`)
    await safeNotifyJobComplete(job, 'aborted', sessionId, terminalMessage, startTime)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    const durationMs = Date.now() - startTime
    completeRun(runId, 'error', error, durationMs)
    console.error(`[Cron] job failed: ${job.name}`, error)

    const shouldRetry = (job.retryCount ?? 0) < job.retryMaxRetries

    if (shouldRetry) {
      scheduleRetry(job.id, job.retryCount ?? 0)
      console.log(
        `[Cron] retry scheduled: ${job.name} (${(job.retryCount ?? 0) + 1}/${job.retryMaxRetries})`,
      )
    } else {
      markJobCompleted(job.id, 'error', error)
      await safeNotifyJobComplete(job, 'error', sessionId, error, startTime)
    }
  }
}

export async function triggerJob(jobId: string): Promise<TriggerJobResult> {
  const { getJob } = await import('./store.js')

  const job = getJob(jobId)
  if (!job) {
    return { success: false, errorCode: 'NOT_FOUND', error: '任务不存在' }
  }

  const sessionId = `cron-manual-${job.id}-${uuid().slice(0, 8)}`
  const locked = markJobRunning(job.id, sessionId)
  if (!locked) {
    return { success: false, errorCode: 'ALREADY_RUNNING', error: '任务正在运行中', sessionId }
  }

  const startTime = Date.now()
  const runId = createRun(job.id, sessionId)

  try {
    const result = await runSkillJob(job, sessionId)

    const durationMs = Date.now() - startTime
    if (result.status === 'ok') {
      completeRun(runId, 'ok', undefined, durationMs)
      await safeNotifyJobComplete(job, 'ok', sessionId, undefined, startTime)
      return { success: true, sessionId }
    }

    const terminalMessage = result.message || (result.status === 'aborted' ? '任务已中止' : '任务已停止')
    completeRun(runId, 'error', terminalMessage, durationMs)
    await safeNotifyJobComplete(job, 'aborted', sessionId, terminalMessage, startTime)

    return {
      success: false,
      errorCode: 'EXECUTION_FAILED',
      error: terminalMessage,
      sessionId,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    completeRun(runId, 'error', error, Date.now() - startTime)
    await safeNotifyJobComplete(job, 'error', sessionId, error, startTime)

    return { success: false, errorCode: 'EXECUTION_FAILED', error, sessionId }
  } finally {
    releaseJobRunning(job.id)
  }
}
