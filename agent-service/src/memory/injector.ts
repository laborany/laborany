/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Memory Injector                                       ║
 * ║                                                                          ║
 * ║  职责：构建完整的上下文（BOSS.md + Memory）注入到 Agent                     ║
 * ║  设计：读取 MD 文件，组装成结构化的 Prompt                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { memoryFileManager } from './file-manager.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface BuildContextParams {
  skillId: string
  userQuery: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     Memory Injector 类                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class MemoryInjector {
  /* ────────────────────────────────────────────────────────────────────────
   *  构建完整上下文
   * ──────────────────────────────────────────────────────────────────────── */
  buildContext(params: BuildContextParams): string {
    const { skillId } = params
    const sections: string[] = []

    // 1. BOSS.md（老板工作手册）
    const bossMd = memoryFileManager.readBossMd()
    if (bossMd) {
      sections.push('## 老板工作手册\n\n' + bossMd)
    }

    // 2. 全局长期记忆
    const globalMemory = memoryFileManager.readGlobalMemory()
    if (globalMemory) {
      sections.push('## 全局长期记忆\n\n' + globalMemory)
    }

    // 3. 最近全局记忆（今天 + 昨天）
    const recentGlobal = memoryFileManager.readRecentDaily({
      scope: 'global',
      days: 2,
    })
    if (recentGlobal) {
      sections.push('## 最近全局记忆\n\n' + recentGlobal)
    }

    // 4. 当前 Skill 长期记忆
    const skillMemory = memoryFileManager.readSkillMemory(skillId)
    if (skillMemory) {
      sections.push('## 当前技能长期记忆\n\n' + skillMemory)
    }

    // 5. 当前 Skill 最近记忆（今天 + 昨天）
    const recentSkill = memoryFileManager.readRecentDaily({
      scope: 'skill',
      skillId,
      days: 2,
    })
    if (recentSkill) {
      sections.push('## 当前技能最近记忆\n\n' + recentSkill)
    }

    return sections.join('\n\n---\n\n')
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出单例                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const memoryInjector = new MemoryInjector()
