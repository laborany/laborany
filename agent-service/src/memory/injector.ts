/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Memory Injector (智能注入器)                          ║
 * ║                                                                          ║
 * ║  职责：构建完整的上下文（BOSS.md + Profile + Memory）注入到 Agent          ║
 * ║  改进：基于 userQuery 检索相关记忆，Token 预算控制                         ║
 * ╚═══════════════════════════════════════════════════════��══════════════════╝ */

import { memoryFileManager } from './file-manager.js'
import { memorySearch } from './search.js'
import { profileManager } from './profile/index.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * ���──────────────────────────────────────────────────────────────────────────┘ */
interface BuildContextParams {
  skillId: string
  userQuery: string
  tokenBudget?: number  // Token 预算，默认 4000
}

interface MemorySection {
  title: string
  content: string
  priority: number      // 优先级：1=必须注入，2=高优先，3=按相关性
  tokens: number
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     工具函数                                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function estimateTokens(text: string): number {
  // 粗略估算：中文约 1.5 字符/token，英文约 4 字符/token
  // 取平均值约 2.5 字符/token
  return Math.ceil(text.length / 2.5)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     Memory Injector 类                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class MemoryInjector {
  /* ────────────────────────────────────────────────────────────────────────
   *  收集所有记忆段落
   * ──────────────────────────────────────────────────────────────────────── */
  private collectSections(skillId: string): MemorySection[] {
    const sections: MemorySection[] = []

    // 1. BOSS.md（必须注入）
    const bossMd = memoryFileManager.readBossMd()
    if (bossMd) {
      sections.push({
        title: '老板工作手册',
        content: bossMd,
        priority: 1,
        tokens: estimateTokens(bossMd),
      })
    }

    // 2. Profile 用户画像（必须注入）
    const profileSummary = profileManager.getSummary()
    if (profileSummary && profileSummary.trim()) {
      sections.push({
        title: '用户画像',
        content: profileSummary,
        priority: 1,
        tokens: estimateTokens(profileSummary),
      })
    }

    // 3. 全局长期记忆（高优先）
    const globalMemory = memoryFileManager.readGlobalMemory()
    if (globalMemory) {
      sections.push({
        title: '全局长期记忆',
        content: globalMemory,
        priority: 2,
        tokens: estimateTokens(globalMemory),
      })
    }

    // 4. Skill 长期记忆（高优先）
    const skillMemory = memoryFileManager.readSkillMemory(skillId)
    if (skillMemory) {
      sections.push({
        title: '当前技能长期记忆',
        content: skillMemory,
        priority: 2,
        tokens: estimateTokens(skillMemory),
      })
    }

    // 5. 最近全局记忆（按相关性）
    const recentGlobal = memoryFileManager.readRecentDaily({
      scope: 'global',
      days: 2,
    })
    if (recentGlobal) {
      sections.push({
        title: '最近全局记忆',
        content: recentGlobal,
        priority: 3,
        tokens: estimateTokens(recentGlobal),
      })
    }

    // 6. Skill 最近记忆（按相关性）
    const recentSkill = memoryFileManager.readRecentDaily({
      scope: 'skill',
      skillId,
      days: 2,
    })
    if (recentSkill) {
      sections.push({
        title: '当前技能最近记忆',
        content: recentSkill,
        priority: 3,
        tokens: estimateTokens(recentSkill),
      })
    }

    return sections
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  基于查询检索相关记忆片段
   * ──────────────────────────────────────────────────────────────────────── */
  private searchRelevantMemories(
    userQuery: string,
    skillId: string,
    maxResults = 5
  ): MemorySection[] {
    const results = memorySearch.search({
      query: userQuery,
      scope: 'all',
      skillId,
      maxResults,
      strategy: 'hybrid',
    })

    return results.map((r, i) => ({
      title: `相关记忆 #${i + 1}`,
      content: r.snippet,
      priority: 3,
      tokens: estimateTokens(r.snippet),
    }))
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  构建完整上下文（智能版）
   *
   *  策略：
   *  1. 必须注入：BOSS.md、Profile
   *  2. 高优先：长期记忆
   *  3. 按相关性：检索结果、最近记忆
   *  4. Token 预算控制
   * ──────────────────────────────────────────────────────────────────────── */
  buildContext(params: BuildContextParams): string {
    const { skillId, userQuery, tokenBudget = 4000 } = params

    // 收集所有记忆段落
    const sections = this.collectSections(skillId)

    // 如果有查询，添加检索结果（去重）
    if (userQuery.trim()) {
      const relevant = this.searchRelevantMemories(userQuery, skillId)
      // 去重：排除已存在的段落（基于内容前 100 字符）
      const existingPrefixes = new Set(sections.map(s => s.content.slice(0, 100)))
      const unique = relevant.filter(r => !existingPrefixes.has(r.content.slice(0, 100)))
      sections.push(...unique)
    }

    // 按优先级排序
    sections.sort((a, b) => a.priority - b.priority)

    // Token 预算控制
    const selected: MemorySection[] = []
    let usedTokens = 0
    const maxPerItem = Math.floor(tokenBudget * 0.4)

    for (const section of sections) {
      // 优先级 1 必须注入，但单项不超过预算 40%
      if (section.priority === 1) {
        if (section.tokens > maxPerItem) {
          section.content = section.content.slice(0, Math.floor(maxPerItem * 2.5))
          section.tokens = maxPerItem
        }
        selected.push(section)
        usedTokens += section.tokens
        continue
      }

      // 其他按预算选择
      if (usedTokens + section.tokens <= tokenBudget) {
        selected.push(section)
        usedTokens += section.tokens
      }
    }

    // 组装输出
    return selected
      .map(s => `## ${s.title}\n\n${s.content}`)
      .join('\n\n---\n\n')
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  简化版构建（兼容旧接口）
   * ──────────────────────────────────────────────────────────────────────── */
  buildContextSimple(skillId: string): string {
    return this.buildContext({ skillId, userQuery: '' })
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出单例                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const memoryInjector = new MemoryInjector()