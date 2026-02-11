/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Skill 加载器                                      ║
 * ║                                                                          ║
 * ║  职责：读取 skills 目录下的 SKILL.md 和 skill.yaml                         ║
 * ║  设计：双目录加载 - 内置 skills（只读）+ 用户 skills（可写）               ║
 * ║  统一模型：skill（单步）和 composite（多步编排）共用同一套加载逻辑          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { readFile, readdir, stat } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { parse as parseYaml } from 'yaml'
import { BUILTIN_SKILLS_DIR, USER_SKILLS_DIR } from './paths.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface SkillTool {
  name: string
  description: string
  script: string
  parameters?: Record<string, { type: string; description: string; required?: boolean }>
}

/** composite skill 的单个步骤：引用一个 skill + prompt 模板 */
export interface CompositeStep {
  skill: string           // 引用的 skill ID
  name: string            // 步骤显示名称
  prompt: string          // prompt 模板，支持 {{prev.output}} 等插值
}

/** skill 类型：单步 skill 或多步 composite */
export type SkillKind = 'skill' | 'composite'

export interface SkillMeta {
  id: string
  name: string
  description: string
  icon?: string
  category?: string
  kind: SkillKind
  price_per_run?: number
  tools?: SkillTool[]
}

export interface Skill {
  meta: SkillMeta
  systemPrompt: string
  scriptsDir: string
  tools: SkillTool[]
  /** composite 类型独有：步骤列表 */
  steps?: CompositeStep[]
  /** composite 类型：失败策略 */
  onFailure?: 'stop' | 'continue'
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                         Skill 缓存                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const skillCache = new Map<string, Skill>()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       提取 YAML Frontmatter                               │
 * │                                                                          │
 * │  支持 Unix (\n) 和 Windows (\r\n) 换行符                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function extractFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null

  try {
    return parseYaml(match[1]) as Record<string, unknown>
  } catch {
    return null
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       尝试加载 steps.yaml（composite 检测）               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function loadStepsYaml(skillPath: string): Promise<{
  steps: CompositeStep[]
  onFailure: 'stop' | 'continue'
} | null> {
  try {
    const stepsPath = join(skillPath, 'steps.yaml')
    const content = await readFile(stepsPath, 'utf-8')
    const data = parseYaml(content) as {
      steps?: CompositeStep[]
      on_failure?: string
    }
    if (!data.steps?.length) return null
    return {
      steps: data.steps,
      onFailure: data.on_failure === 'continue' ? 'continue' : 'stop',
    }
  } catch {
    return null
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       加载单个 Skill                                      │
 * │                                                                          │
 * │  搜索顺序：用户目录优先，然后是内置目录                                    │
 * │  支持两种格式：                                                            │
 * │  1. skill.yaml + SKILL.md（传统格式）                                     │
 * │  2. SKILL.md with YAML frontmatter（官方格式）                            │
 * │  composite 检测：存在 steps.yaml → kind = 'composite'                    │
 * └───────────────────────────────────────────────────────────────────────��──┘ */
async function loadSingleSkill(skillId: string): Promise<Skill | null> {
  const userPath = join(USER_SKILLS_DIR, skillId)
  const builtinPath = join(BUILTIN_SKILLS_DIR, skillId)
  const skillPath = existsSync(join(userPath, 'SKILL.md')) ? userPath : builtinPath

  try {
    const mdPath = join(skillPath, 'SKILL.md')

    let systemPrompt: string
    try {
      systemPrompt = await readFile(mdPath, 'utf-8')
    } catch {
      return null
    }

    let meta: SkillMeta
    let tools: SkillTool[] = []

    // 尝试读取 skill.yaml（传统格式）
    try {
      const yamlPath = join(skillPath, 'skill.yaml')
      const yamlContent = await readFile(yamlPath, 'utf-8')
      const yamlData = parseYaml(yamlContent) as SkillMeta & { tools?: SkillTool[] }

      meta = {
        id: skillId,
        name: yamlData.name,
        description: yamlData.description,
        icon: yamlData.icon,
        category: yamlData.category,
        kind: 'skill',
        price_per_run: yamlData.price_per_run,
      }
      tools = yamlData.tools || []
    } catch {
      const frontmatter = extractFrontmatter(systemPrompt)
      if (!frontmatter) return null

      meta = {
        id: skillId,
        name: (frontmatter.name as string) || skillId,
        description: (frontmatter.description as string) || '',
        icon: frontmatter.icon as string | undefined,
        category: frontmatter.category as string | undefined,
        kind: 'skill',
        price_per_run: frontmatter.price_per_run as number | undefined,
      }
      tools = (frontmatter.tools as SkillTool[]) || []
    }

    /* ── composite 检测：有 steps.yaml 则为多步编排 ── */
    const composite = await loadStepsYaml(skillPath)
    if (composite) {
      meta.kind = 'composite'
      return { meta, systemPrompt, scriptsDir: join(skillPath, 'scripts'), tools, ...composite }
    }

    return { meta, systemPrompt, scriptsDir: join(skillPath, 'scripts'), tools }
  } catch {
    return null
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       导出的加载器对象                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const loadSkill = {
  /* 根据 ID 加载 Skill（带缓存） */
  async byId(id: string): Promise<Skill | null> {
    if (skillCache.has(id)) {
      return skillCache.get(id)!
    }
    const skill = await loadSingleSkill(id)
    if (skill) {
      skillCache.set(id, skill)
    }
    return skill
  },

  /* 列出所有可用 Skills（用户创建按时间倒序 + 内置） */
  async listAll(): Promise<SkillMeta[]> {
    const userIds: { id: string; mtime: number }[] = []
    const builtinIds: string[] = []
    const seen = new Set<string>()

    /* ────────────────────────────────────────────────────────────────────────
     *  加载用户 Skills（带修改时间，用于排序）
     * ──────────────────────────────────────────────────────────────────────── */
    try {
      const userDirs = await readdir(USER_SKILLS_DIR, { withFileTypes: true })
      for (const dir of userDirs) {
        if (!dir.isDirectory()) continue
        seen.add(dir.name)
        const mtime = (await stat(join(USER_SKILLS_DIR, dir.name))).mtimeMs
        userIds.push({ id: dir.name, mtime })
      }
    } catch { /* 目录可能不存在 */ }

    userIds.sort((a, b) => b.mtime - a.mtime)

    /* ────────────────────────────────────────────────────────────────────────
     *  加载内置 Skills（跳过已存在的 ID，避免重复）
     * ──────────────────────────────────────────────────────────────────────── */
    try {
      const builtinDirs = await readdir(BUILTIN_SKILLS_DIR, { withFileTypes: true })
      for (const dir of builtinDirs) {
        if (dir.isDirectory() && !seen.has(dir.name)) builtinIds.push(dir.name)
      }
    } catch { /* 目录可能不存在 */ }

    /* ────────────────────────────────────────────────────────────────────────
     *  按顺序加载：用户 skills（最新优先）→ 内置 skills
     * ──────────────────────────────────────────────────────────────────────── */
    const orderedIds = [...userIds.map(u => u.id), ...builtinIds]
    const skills: SkillMeta[] = []

    for (const id of orderedIds) {
      const skill = await this.byId(id)
      if (skill) skills.push(skill.meta)
    }
    return skills
  },

  /* 清除缓存 */
  clearCache(): void {
    skillCache.clear()
  },

  /* 获取用户 skills 目录（用于创建新 skill） */
  getUserSkillsDir(): string {
    return USER_SKILLS_DIR
  },

  /* 获取内置 skills 目录（只读） */
  getBuiltinSkillsDir(): string {
    return BUILTIN_SKILLS_DIR
  },

  /* 兼容旧 API：返回用户目录 */
  getSkillsDir(): string {
    return USER_SKILLS_DIR
  },
}
