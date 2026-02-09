/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Memory Writer                                         ║
 * ║                                                                          ║
 * ║  职责：写入记忆（纠正、偏好、事实、长期记忆）                               ║
 * ║  设计：追加到每日日志，重要内容写入长期记忆                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { memoryFileManager } from './file-manager.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface WriteCorrectionParams {
  skillId: string
  original: string
  corrected: string
  context?: string
}

interface WritePreferenceParams {
  skillId: string
  preference: string
  isGlobal?: boolean
}

interface WriteFactParams {
  skillId: string
  fact: string
  isGlobal?: boolean
}

interface WriteLongTermParams {
  skillId: string
  section: string
  content: string
  isGlobal?: boolean
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     Memory Writer 类                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class MemoryWriter {
  /* ────────────────────────────────────────────────────────────────────────
   *  写入纠正记录
   * ──────────────────────────────────────────────────────────────────────── */
  writeCorrection(params: WriteCorrectionParams): void {
    const { skillId, original, corrected, context } = params
    const content = [
      '**纠正记录**',
      `- 原始：${original}`,
      `- 正确：${corrected}`,
      context ? `- 上下文：${context}` : '',
    ].filter(Boolean).join('\n')

    // 写入 Skill 每日日志
    memoryFileManager.appendToDaily({
      scope: 'skill',
      skillId,
      content,
    })
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  写入偏好记录
   * ──────────────────────────────────────────────────────────────────────── */
  writePreference(params: WritePreferenceParams): void {
    const { skillId, preference, isGlobal = false } = params
    const content = `**用户偏好**\n${preference}`

    // 写入 Skill 每日日志
    memoryFileManager.appendToDaily({
      scope: 'skill',
      skillId,
      content,
    })

    // 如果是全局偏好，同时写入全局日志
    if (isGlobal) {
      memoryFileManager.appendToDaily({
        scope: 'global',
        content,
      })
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  写入事实记录
   * ──────────────────────────────────────────────────────────────────────── */
  writeFact(params: WriteFactParams): void {
    const { skillId, fact, isGlobal = false } = params
    const content = `**事实记录**\n${fact}`

    memoryFileManager.appendToDaily({
      scope: 'skill',
      skillId,
      content,
    })

    if (isGlobal) {
      memoryFileManager.appendToDaily({
        scope: 'global',
        content,
      })
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  写入长期记忆（重要决定等）
   *  注意：长期记忆需要用户确认，这里只是写入每日日志作为候选
   * ──────────────────────────────────────────────────────────────────────── */
  writeLongTerm(params: WriteLongTermParams): void {
    const { skillId, section, content, isGlobal = false } = params
    const entry = `**建议写入长期记忆**\n- 章节：${section}\n- 内容：${content}`

    memoryFileManager.appendToDaily({
      scope: 'skill',
      skillId,
      content: entry,
    })

    if (isGlobal) {
      memoryFileManager.appendToDaily({
        scope: 'global',
        content: entry,
      })
    }
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出单例                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const memoryWriter = new MemoryWriter()
