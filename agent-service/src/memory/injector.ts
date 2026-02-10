import { memoryFileManager } from './file-manager.js'
import { memorySearch } from './search.js'
import { profileManager } from './profile/index.js'

interface BuildContextParams {
  skillId: string
  userQuery: string
  tokenBudget?: number
}

interface MemorySection {
  title: string
  content: string
  priority: number
  tokens: number
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2.5)
}

export class MemoryInjector {
  private collectSections(skillId: string): MemorySection[] {
    const sections: MemorySection[] = []

    const bossMd = memoryFileManager.readBossMd()
    if (bossMd) {
      sections.push({
        title: '老板工作手册',
        content: bossMd,
        priority: 1,
        tokens: estimateTokens(bossMd),
      })
    }

    const profileSummary = profileManager.getSummary()
    if (profileSummary && profileSummary.trim()) {
      sections.push({
        title: '用户画像',
        content: profileSummary,
        priority: 1,
        tokens: estimateTokens(profileSummary),
      })
    }

    const globalMemory = memoryFileManager.readGlobalMemory()
    if (globalMemory) {
      sections.push({
        title: '全局长期记忆',
        content: globalMemory,
        priority: 2,
        tokens: estimateTokens(globalMemory),
      })
    }

    const skillMemory = memoryFileManager.readSkillMemory(skillId)
    if (skillMemory) {
      sections.push({
        title: '当前技能长期记忆',
        content: skillMemory,
        priority: 2,
        tokens: estimateTokens(skillMemory),
      })
    }

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

  private searchRelevantMemories(
    userQuery: string,
    skillId: string,
    maxResults = 5,
  ): MemorySection[] {
    const results = memorySearch.search({
      query: userQuery,
      scope: 'all',
      skillId,
      maxResults,
      strategy: 'hybrid',
    })

    return results.map((result, index) => ({
      title: `相关记忆 #${index + 1}`,
      content: result.snippet,
      priority: 3,
      tokens: estimateTokens(result.snippet),
    }))
  }

  buildContext(params: BuildContextParams): string {
    const { skillId, userQuery, tokenBudget = 4000 } = params

    const sections = this.collectSections(skillId)

    if (userQuery.trim()) {
      const relevant = this.searchRelevantMemories(userQuery, skillId)
      const existingPrefixes = new Set(sections.map(section => section.content.slice(0, 100)))
      const unique = relevant.filter(result => !existingPrefixes.has(result.content.slice(0, 100)))
      sections.push(...unique)
    }

    sections.sort((a, b) => a.priority - b.priority)

    const selected: MemorySection[] = []
    let usedTokens = 0
    const maxPerItem = Math.floor(tokenBudget * 0.4)

    for (const section of sections) {
      if (section.priority === 1) {
        if (section.tokens > maxPerItem) {
          section.content = section.content.slice(0, Math.floor(maxPerItem * 2.5))
          section.tokens = maxPerItem
        }
        selected.push(section)
        usedTokens += section.tokens
        continue
      }

      if (usedTokens + section.tokens <= tokenBudget) {
        selected.push(section)
        usedTokens += section.tokens
      }
    }

    return selected
      .map(section => `## ${section.title}\n\n${section.content}`)
      .join('\n\n---\n\n')
  }

  buildContextSimple(skillId: string): string {
    return this.buildContext({ skillId, userQuery: '' })
  }
}

export const memoryInjector = new MemoryInjector()
