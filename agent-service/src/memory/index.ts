/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Memory System - 导出入口                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

export { memoryFileManager, MemoryFileManager, type MemoryScope } from './file-manager.js'
export { memoryInjector, MemoryInjector } from './injector.js'
export { memoryWriter, MemoryWriter } from './writer.js'
export { memorySearch, MemorySearch, type SearchResult } from './search.js'
export { bossManager, BossManager } from './boss.js'
export { globalMemoryManager, GlobalMemoryManager } from './global-memory.js'
export {
  memoryConsolidator,
  MemoryConsolidator,
  type ConsolidationCandidate,
  type ConsolidateParams,
} from './consolidator.js'
