/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Skill 加载器                                      ║
 * ║                                                                          ║
 * ║  职责：读取 skills 目录下的 SKILL.md 和 skill.yaml                         ║
 * ║  设计：双目录加载 - 内置 skills（只读）+ 用户 skills（可写）               ║
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

export interface SkillMeta {
  id: string
  name: string
  description: string
  icon?: string
  category?: string
  price_per_run?: number
  tools?: SkillTool[]
}

export interface Skill {
  meta: SkillMeta
  systemPrompt: string
  scriptsDir: string
  tools: SkillTool[]
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
 * │                       加载单个 Skill                                      │
 * │                                                                          │
 * │  搜索顺序：用户目录优先，然后是内置目录                                    │
 * │  支持两种格式：                                                            │
 * │  1. skill.yaml + SKILL.md（传统格式）                                     │
 * │  2. SKILL.md with YAML frontmatter（官方格式）                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function loadSingleSkill(skillId: string): Promise<Skill | null> {
  // 优先检查用户目录
  const userPath = join(USER_SKILLS_DIR, skillId)
  const builtinPath = join(BUILTIN_SKILLS_DIR, skillId)

  const skillPath = existsSync(join(userPath, 'SKILL.md')) ? userPath : builtinPath

  try {
    const mdPath = join(skillPath, 'SKILL.md')

    // 读取 SKILL.md
    let systemPrompt: string
    try {
      systemPrompt = await readFile(mdPath, 'utf-8')
    } catch {
      return null // 没有 SKILL.md 则不是有效的 Skill
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
        price_per_run: yamlData.price_per_run,
      }
      tools = yamlData.tools || []
    } catch {
      // 没有 skill.yaml，尝试从 SKILL.md 的 YAML frontmatter 读取
      const frontmatter = extractFrontmatter(systemPrompt)
      if (!frontmatter) {
        return null // 既没有 skill.yaml 也没有 frontmatter
      }

      meta = {
        id: skillId,
        name: (frontmatter.name as string) || skillId,
        description: (frontmatter.description as string) || '',
        icon: frontmatter.icon as string | undefined,
        category: frontmatter.category as string | undefined,
        price_per_run: frontmatter.price_per_run as number | undefined,
      }
      tools = (frontmatter.tools as SkillTool[]) || []
    }

    return {
      meta,
      systemPrompt,
      scriptsDir: join(skillPath, 'scripts'),
      tools,
    }
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
