/* ── Markdown 文件管理器（BOSS.md + MEMORY.md） ── */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { BOSS_MD_PATH, GLOBAL_MEMORY_MD_PATH } from './file-manager.js'

/* ── BOSS.md Manager ── */

interface UpdateSuggestion {
  section: string
  content: string
  reason: string
  approved: boolean
}

interface SuggestParams {
  section: string
  content: string
  reason: string
}

export class BossManager {
  read(): string | null {
    if (!existsSync(BOSS_MD_PATH)) return null
    return readFileSync(BOSS_MD_PATH, 'utf-8')
  }

  update(content: string): void {
    writeFileSync(BOSS_MD_PATH, content, 'utf-8')
  }

  suggest(params: SuggestParams): UpdateSuggestion {
    return { ...params, approved: false }
  }

  getPath(): string {
    return BOSS_MD_PATH
  }
}

export const bossManager = new BossManager()

/* ── MEMORY.md Manager ── */

export class GlobalMemoryManager {
  read(): string | null {
    if (!existsSync(GLOBAL_MEMORY_MD_PATH)) return null
    return readFileSync(GLOBAL_MEMORY_MD_PATH, 'utf-8')
  }

  update(content: string): void {
    writeFileSync(GLOBAL_MEMORY_MD_PATH, content, 'utf-8')
  }

  getPath(): string {
    return GLOBAL_MEMORY_MD_PATH
  }
}

export const globalMemoryManager = new GlobalMemoryManager()
