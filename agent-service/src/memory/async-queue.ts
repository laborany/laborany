import { memoryOrchestrator } from './orchestrator.js'
import type { ExtractAndUpsertParams, UpsertResult } from './orchestrator.js'
import { memoryProcessor } from './consolidator.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { DATA_DIR } from '../paths.js'

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

interface MemoryAsyncSettings {
  enabled: boolean
  maxSize: number
  autoClusterEnabled: boolean
  clusterCooldownMs: number
  clusterDays: number
  clusterMinCompletedJobs: number
  clusterMaxIntervalMs: number
}

function getMemoryAsyncSettings(): MemoryAsyncSettings {
  return {
    enabled: (process.env.MEMORY_ASYNC_ENABLED || 'true').toLowerCase() !== 'false',
    maxSize: toInt(process.env.MEMORY_QUEUE_MAX, 100),
    autoClusterEnabled: (process.env.MEMORY_AUTO_CLUSTER_ENABLED || 'true').toLowerCase() !== 'false',
    clusterCooldownMs: toInt(process.env.MEMORY_CLUSTER_COOLDOWN_MS, 10 * 60 * 1000),
    clusterDays: toInt(process.env.MEMORY_CLUSTER_DAYS, 7),
    clusterMinCompletedJobs: toInt(process.env.MEMORY_CLUSTER_MIN_COMPLETED_JOBS, 3),
    clusterMaxIntervalMs: toInt(process.env.MEMORY_CLUSTER_MAX_INTERVAL_MS, 24 * 60 * 60 * 1000),
  }
}

const CLUSTER_MARKER_PATH = join(DATA_DIR, 'memory', 'last-cluster.txt')

function readClusterMarker(): number {
  try {
    if (!existsSync(CLUSTER_MARKER_PATH)) return 0
    const raw = readFileSync(CLUSTER_MARKER_PATH, 'utf-8').trim()
    if (!raw) return 0

    const parsed = Date.parse(raw)
    if (Number.isFinite(parsed) && parsed > 0) return parsed

    const asNumber = Number.parseInt(raw, 10)
    if (Number.isFinite(asNumber) && asNumber > 0) return asNumber
    return 0
  } catch {
    return 0
  }
}

function writeClusterMarker(atMs: number): void {
  try {
    mkdirSync(dirname(CLUSTER_MARKER_PATH), { recursive: true })
    writeFileSync(CLUSTER_MARKER_PATH, new Date(atMs).toISOString(), 'utf-8')
  } catch {
    // ignore
  }
}

class MemoryAsyncQueue {
  private readonly queue: MemoryQueueJob[] = []
  private processing = false

  private accepted = 0
  private completed = 0
  private failed = 0
  private dropped = 0

  private lastError: string | undefined
  private lastAcceptedAt: string | undefined
  private lastCompletedAt: string | undefined
  private lastClusterAt = readClusterMarker()
  private clusterInFlight = false
  private completedSinceCluster = 0

  enqueue(params: ExtractAndUpsertParams): MemoryQueueResult {
    const settings = getMemoryAsyncSettings()
    const job: MemoryQueueJob = {
      id: `mq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      acceptedAt: new Date().toISOString(),
      params,
    }

    if (this.queue.length >= settings.maxSize) {
      this.queue.shift()
      this.dropped += 1
      this.lastError = `queue_overflow:max=${settings.maxSize}`
      console.warn(`[MemoryQueue] queue full, dropping oldest job (max=${settings.maxSize})`)
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
    if (getMemoryAsyncSettings().enabled) {
      this.enqueue(params)
      return ASYNC_FALLBACK_RESULT
    }
    return this.runSync(params)
  }

  getStats(): MemoryQueueStats {
    return {
      enabled: getMemoryAsyncSettings().enabled,
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
    return getMemoryAsyncSettings().enabled
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
          this.completedSinceCluster += 1
          this.maybeAutoClusterEpisodes()
        } catch (error) {
          this.failed += 1
          const message = error instanceof Error ? error.message : String(error)
          this.lastError = `job=${job.id};${message}`
          console.error(`[MemoryQueue] job failed: id=${job.id}`, error)
        }
      }
    } finally {
      this.processing = false
    }
  }

  private maybeAutoClusterEpisodes(): void {
    const settings = getMemoryAsyncSettings()
    if (!settings.autoClusterEnabled) return
    if (this.clusterInFlight) return

    const now = Date.now()
    const sinceLast = now - this.lastClusterAt
    const cooldownOk = sinceLast >= settings.clusterCooldownMs
    if (!cooldownOk) return

    const thresholdReached = this.completedSinceCluster >= settings.clusterMinCompletedJobs
    const maxIntervalReached = this.lastClusterAt === 0 || sinceLast >= settings.clusterMaxIntervalMs

    if (!thresholdReached && !maxIntervalReached) return

    const pendingJobs = this.completedSinceCluster
    this.completedSinceCluster = 0
    this.lastClusterAt = now
    writeClusterMarker(now)
    this.clusterInFlight = true

    void memoryProcessor
      .clusterRecentCellsAsync(settings.clusterDays)
      .then((episodeIds) => {
        if (episodeIds.length > 0) {
          console.log(`[MemoryQueue] auto-cluster completed: episodes=${episodeIds.length}`)
        }
      })
      .catch((error) => {
        this.completedSinceCluster = Math.max(this.completedSinceCluster, pendingJobs)
        console.warn('[MemoryQueue] auto-cluster failed:', error)
      })
      .finally(() => {
        this.clusterInFlight = false
      })
  }
}

export const memoryAsyncQueue = new MemoryAsyncQueue()
