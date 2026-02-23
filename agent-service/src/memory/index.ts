/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Memory System - 导出入口                              ║
 * ║                                                                          ║
 * ║  三级记忆架构：MemCell → Episode → Profile                                ║
 * ║  混合检索：BM25 + TF-IDF + RRF 融合                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     核心模块                                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export { memoryFileManager, MemoryFileManager, type MemoryScope } from './file-manager.js'
export { memoryInjector, MemoryInjector } from './io.js'
export { memoryWriter, MemoryWriter } from './file-manager.js'
export { memorySearch, MemorySearch, type SearchResult, type SearchStrategy } from './search.js'
export { bossManager, BossManager } from './markdown-files.js'
export { globalMemoryManager, GlobalMemoryManager } from './markdown-files.js'
export {
  memoryConsolidator,
  MemoryConsolidator,
  type ConsolidationCandidate,
  type ConsolidateParams,
  type EnqueueCandidateParams,
  type EnqueueCandidateResult,
  type LongTermEntry,
  type LongTermDecisionLog,
  type LongTermStats,
  type LongTermAuditBackfillResult,
  type RecordNoDecisionSummaryParams,
  type AutoUpsertLongTermParams,
  type AutoUpsertLongTermResult,
} from './consolidator.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     检索优化模块                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export {
  TFIDFIndexer,
  TFIDFSearcher,
  tokenize,
  type TFIDFDocument,
  type TFIDFIndex,
  indexCacheManager,
  IndexCacheManager,
  INDEX_DIR,
} from './search.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     三级记忆结构                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */

// MemCell（原子记忆）
export {
  memCellExtractor,
  MemCellExtractor,
  memCellStorage,
  MemCellStorage,
  CELLS_DIR,
  type MemCell,
  type Message,
  type ExtractedFact,
} from './memcell/index.js'

// Episode（情节记忆）
export {
  episodeClusterer,
  EpisodeClusterer,
  episodeStorage,
  EpisodeStorage,
  EPISODES_DIR,
  type Episode,
} from './episode/index.js'

// Profile（用户画像）
export {
  evidenceTracker,
  EvidenceTracker,
  profileManager,
  ProfileManager,
  PROFILES_DIR,
  PROFILE_PATH,
  type Evidence,
  type EvidencedValue,
  type Profile,
  type ProfileSection,
  type ProfileField,
} from './profile/index.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     记忆处理器（协调三级结构）                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export { memoryProcessor, MemoryProcessor } from './consolidator.js'
export { memoryOrchestrator, MemoryOrchestrator } from './orchestrator.js'
export { memoryCliExtractor, MemoryCliExtractor, type CliExtractResult } from './io.js'
export { memoryAsyncQueue, type MemoryQueueStats } from './async-queue.js'
export type { MemoryScene, InjectedMemorySection, MemoryTraceEvent } from './types.js'
