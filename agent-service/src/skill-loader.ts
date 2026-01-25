/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Skill 加载器                                      ║
 * ║                                                                          ║
 * ║  职责：读取 skills 目录下的 SKILL.md 和 skill.yaml                         ║
 * ║  设计：单例模式，缓存已加载的 Skill                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { readFile, readdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parse as parseYaml } from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SKILLS_DIR = join(__dirname, '../../skills')

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
 * │                       加载单个 Skill                                      │
 * │  支持两种格式：                                                            │
 * │  1. skill.yaml + SKILL.md（传统格式）                                     │
 * │  2. SKILL.md with YAML frontmatter（官方格式）                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function loadSingleSkill(skillDir: string): Promise<Skill | null> {
  try {
    const skillPath = join(SKILLS_DIR, skillDir)
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
        id: skillDir,
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
        id: skillDir,
        name: (frontmatter.name as string) || skillDir,
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
 * │                       提取 YAML Frontmatter                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function extractFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null

  try {
    return parseYaml(match[1]) as Record<string, unknown>
  } catch {
    return null
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       导出的加载器对象                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const loadSkill = {
  // 根据 ID 加载 Skill
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

  // 列出所有可用 Skills
  async listAll(): Promise<SkillMeta[]> {
    const dirs = await readdir(SKILLS_DIR, { withFileTypes: true })
    const skills: SkillMeta[] = []

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue
      const skill = await this.byId(dir.name)
      if (skill) {
        skills.push(skill.meta)
      }
    }
    return skills
  },

  // 清除缓存
  clearCache(): void {
    skillCache.clear()
  },
}
