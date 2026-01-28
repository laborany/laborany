/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Skill 加载器                                      ║
 * ║                                                                          ║
 * ║  职责：读取 skills 目录下的 SKILL.md 和 skill.yaml                         ║
 * ║  设计：双目录加载 - 内置 skills（只读）+ 用户 skills（可写）               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { readFile, readdir, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, mkdirSync } from 'fs'
import { parse as parseYaml } from 'yaml'
import { homedir, platform } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       判断是否为打包模式                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function isPackaged(): boolean {
  return !process.execPath.includes('node')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取内置 Skills 目录（只读）                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getBuiltinSkillsDir(): string {
  // 打包后：API exe 在 resources/api/，skills 在 resources/skills/
  const pkgPath = join(dirname(process.execPath), '..', 'skills')
  if (existsSync(pkgPath)) return pkgPath

  // 开发模式：相对于源码
  return join(__dirname, '../../../../skills')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取用户 Skills 目录（可写）                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getUserSkillsDir(): string {
  const os = platform()
  const baseDir = isPackaged()
    ? os === 'win32'
      ? join(homedir(), 'AppData', 'Roaming', 'LaborAny')
      : os === 'darwin'
        ? join(homedir(), 'Library', 'Application Support', 'LaborAny')
        : join(homedir(), '.config', 'laborany')
    : join(__dirname, '../../../../.user-data')

  const userSkillsDir = join(baseDir, 'skills')

  // 确保目录存在
  if (!existsSync(userSkillsDir)) {
    mkdirSync(userSkillsDir, { recursive: true })
  }

  return userSkillsDir
}

const BUILTIN_SKILLS_DIR = getBuiltinSkillsDir()
const USER_SKILLS_DIR = getUserSkillsDir()

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
 * │  优先从用户目录加载，其次从内置目录加载                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function loadSingleSkill(skillDir: string): Promise<Skill | null> {
  // 优先检查用户目录
  const userPath = join(USER_SKILLS_DIR, skillDir)
  const builtinPath = join(BUILTIN_SKILLS_DIR, skillDir)

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
      const frontmatter = extractFrontmatter(systemPrompt)
      if (!frontmatter) {
        return null
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
  // 支持 Unix (\n) 和 Windows (\r\n) 换行符
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
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

  async listAll(): Promise<SkillMeta[]> {
    const skillIds = new Set<string>()
    const skills: SkillMeta[] = []

    // 从用户目录加载（优先）
    try {
      const userDirs = await readdir(USER_SKILLS_DIR, { withFileTypes: true })
      for (const dir of userDirs) {
        if (dir.isDirectory()) skillIds.add(dir.name)
      }
    } catch { /* 目录可能不存在 */ }

    // 从内置目录加载
    try {
      const builtinDirs = await readdir(BUILTIN_SKILLS_DIR, { withFileTypes: true })
      for (const dir of builtinDirs) {
        if (dir.isDirectory()) skillIds.add(dir.name)
      }
    } catch { /* 目录可能不存在 */ }

    // 加载所有 skills
    for (const id of skillIds) {
      const skill = await this.byId(id)
      if (skill) {
        skills.push(skill.meta)
      }
    }
    return skills
  },

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
