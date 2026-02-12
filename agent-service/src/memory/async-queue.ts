import { memoryOrchestrator } from './orchestrator.js'
import type { ExtractAndUpsertParams, UpsertResult } from './orchestrator.js'

export interface MemoryQueueStats {
  enabled: boolean
  pending: number
  processing: boolean
  accepted: number
  completed: number
  failed: number
  dropped: number
  lastError?: string
  lastAcceptedAt?: string
  lastCompletedAt?: string
}

interface MemoryQueueJob {
  id: string
  acceptedAt: string
  params: ExtractAndUpsertParams
}

interface MemoryQueueResult {
  success: boolean
  queued: boolean
  jobId: string
  acceptedAt: string
  skipped?: boolean
  reason?: string
}

const ASYNC_FALLBACK_RESULT: UpsertResult = {
  written: { cells: 0, profile: 0, longTerm: 0, episodes: 0 },
  conflicts: [],
  extractionMethod: 'regex',
}

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

const MEMORY_ASYNC_ENABLED = (process.env.MEMORY_ASYNC_ENABLED || 'true').toLowerCase() !== 'false'
const MEMORY_QUEUE_MAX = toInt(process.env.MEMORY_QUEUE_MAX, 100)

class MemoryAsyncQueue {
  private readonly enabled = MEMORY_ASYNC_ENABLED
  private readonly maxSize = MEMORY_QUEUE_MAX
  private readonly queue: MemoryQueueJob[] = []
  private processing = false

  private accepted = 0
  private completed = 0
  private failed = 0
  private dropped = 0

  private lastError: string | undefined
  private lastAcceptedAt: string | undefined
  private lastCompletedAt: string | undefined

  enqueue(params: ExtractAndUpsertParams): MemoryQueueResult {
    const job: MemoryQueueJob = {
      id: `mq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      acceptedAt: new Date().toISOString(),
      params,
    }

    if (this.queue.length >= this.maxSize) {
      this.queue.shift()
      this.dropped += 1
      this.lastError = `queue_overflow:max=${this.maxSize}`
      console.warn(`[MemoryQueue] queue full, dropping oldest job (max=${this.maxSize})`)
    }

    this.queue.push(job)
    this.accepted += 1
    this.lastAcceptedAt = job.acceptedAt

    void this.processNext()

    return {
      success: true,
      queued: true,
      jobId: job.id,
      acceptedAt: job.acceptedAt,
    }
  }

  async runSync(params: ExtractAndUpsertParams): Promise<UpsertResult> {
    return memoryOrchestrator.extractAndUpsert(params)
  }

  async submit(params: ExtractAndUpsertParams): Promise<UpsertResult> {
    if (this.enabled) {
      this.enqueue(params)
      return ASYNC_FALLBACK_RESULT
    }
    return this.runSync(params)
  }

  getStats(): MemoryQueueStats {
    return {
      enabled: this.enabled,
      pending: this.queue.length,
      processing: this.processing,
      accepted: this.accepted,
      completed: this.completed,
      failed: this.failed,
      dropped: this.dropped,
      lastError: this.lastError,
      lastAcceptedAt: this.lastAcceptedAt,
      lastCompletedAt: this.lastCompletedAt,
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  async drain(timeoutMs = 3000): Promise<{ pending: number; drained: boolean }> {
    const deadline = Date.now() + Math.max(0, timeoutMs)

    while (Date.now() < deadline) {
      if (!this.processing && this.queue.length === 0) {
        return { pending: 0, drained: true }
      }
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    return { pending: this.queue.length + (this.processing ? 1 : 0), drained: false }
  }

  private async processNext(): Promise<void> {
    if (this.processing) return
    this.processing = true

    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift()
        if (!job) continue

        try {
          const result = await memoryOrchestrator.extractAndUpsert(job.params)
          this.completed += 1
          this.lastCompletedAt = new Date().toISOString()
          console.log(
            `[MemoryQueue] job completed: id=${job.id} method=${result.extractionMethod} cells=${result.written.cells}`,
          )
        } catch (error) {
          this.failed += 1
          this.lastError = error instanceof Error ? error.message : String(error)
          console.error(`[MemoryQueue] job failed: id=${job.id}`, error)
        }
      }
    } finally {
      this.processing = false
    }
  }
}

export const memoryAsyncQueue = new MemoryAsyncQueue()
