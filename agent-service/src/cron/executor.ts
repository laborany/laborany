import { v4 as uuid } from 'uuid'
import type { CronJob } from './types.js'
import {
  markJobRunning,
  markJobCompleted,
  scheduleRetry,
  createRun,
  completeRun,
} from './store.js'
import { notifyJobComplete } from './notifier.js'

const SRC_API_BASE_URL = (process.env.SRC_API_BASE_URL || 'http://127.0.0.1:3620/api').replace(/\/+$/, '')

interface SkillExecuteEvent {
  type?: string
  sessionId?: string
  content?: string
  message?: string
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

async function runSkillJob(job: CronJob, sessionId: string): Promise<void> {
  const response = await fetch(`${SRC_API_BASE_URL}/skill/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      skill_id: job.targetId,
      query: job.targetQuery,
      sessionId,
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
  let completed = false

  while (!completed) {
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

      if (event.type === 'done' || event.type === 'stopped' || event.type === 'aborted') {
        completed = true
        void reader.cancel()
        break
      }
    }
  }

  if (!completed && buffer.trim()) {
    const tailEvent = parseSseBlock(buffer.trim())
    if (tailEvent?.type === 'error') {
      const message = tailEvent.message || tailEvent.content
      if (message) errors.push(message)
    }
    if (tailEvent?.type === 'done' || tailEvent?.type === 'stopped' || tailEvent?.type === 'aborted') {
      completed = true
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '))
  }

  if (!completed) {
    throw new Error('Cron run ended without a terminal event')
  }
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
    await runSkillJob(job, sessionId)

    const durationMs = Date.now() - startTime
    markJobCompleted(job.id, 'ok')
    completeRun(runId, 'ok', undefined, durationMs)
    console.log(`[Cron] job completed: ${job.name}, duration ${durationMs}ms`)

    await notifyJobComplete(job, 'ok', sessionId)
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
      await notifyJobComplete(job, 'error', sessionId, error)
    }
  }
}

export async function triggerJob(jobId: string): Promise<{
  success: boolean
  sessionId?: string
  error?: string
}> {
  const { getJob } = await import('./store.js')

  const job = getJob(jobId)
  if (!job) {
    return { success: false, error: 'Job not found' }
  }

  const sessionId = `cron-manual-${job.id}-${uuid().slice(0, 8)}`
  const startTime = Date.now()
  const runId = createRun(job.id, sessionId)

  try {
    await runSkillJob(job, sessionId)

    const durationMs = Date.now() - startTime
    completeRun(runId, 'ok', undefined, durationMs)
    await notifyJobComplete(job, 'ok', sessionId)

    return { success: true, sessionId }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    completeRun(runId, 'error', error, Date.now() - startTime)
    await notifyJobComplete(job, 'error', sessionId, error)

    return { success: false, error, sessionId }
  }
}
