import { existsSync } from 'fs'
import { mkdir, readFile, readdir, rename, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import {
  loadSkill,
  generateCapabilityId,
  normalizeCapabilityDisplayName,
  pickUniqueCapabilityId,
} from 'laborany-shared'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export const DEFAULT_SKILL_ICON = '🧩'
export const DEFAULT_SKILL_CATEGORY = '工具'

const CATEGORY_RULES: Array<{
  category: string
  icon: string
  keywords: string[]
}> = [
  { category: '开发', icon: '🛠️', keywords: ['开发', 'code', 'coding', 'program', 'api', 'automation', 'browser', 'web'] },
  { category: '写作', icon: '✍️', keywords: ['写作', 'writer', 'copywriting', 'content', 'blog', '文案'] },
  { category: '金融', icon: '📈', keywords: ['金融', '股票', '投资', 'finance', 'stock', 'trading'] },
  { category: '学术', icon: '📚', keywords: ['学术', '论文', 'research', 'paper', 'journal'] },
  { category: '设计', icon: '🎨', keywords: ['设计', 'design', 'ui', 'ux', 'figma'] },
  { category: '办公', icon: '📄', keywords: ['办公', 'word', 'excel', 'ppt', 'document', 'report', 'pdf'] },
  { category: '数据', icon: '📊', keywords: ['数据', '分析', 'analysis', 'analytics', 'dashboard', 'monitor'] },
  { category: '运营', icon: '📣', keywords: ['运营', 'marketing', '社媒', 'social', '增长'] },
]

export interface SkillMetadata {
  name: string
  description: string
  icon?: string
  category?: string
}

export interface MaterializedSkillResult {
  skillId: string
  installedPath: string
  sourceAdapted: boolean
  metadataPatched: {
    icon: boolean
    category: boolean
  }
  metadata: {
    name: string
    description: string
    icon: string
    category: string
  }
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n[\s\S]*)?$/)
  if (!match) return null

  try {
    const frontmatter = parseYaml(match[1]) as Record<string, unknown>
    return { frontmatter: frontmatter || {}, body: match[2] || '\n' }
  } catch {
    return null
  }
}

function inferMetadata(rawText: string): { icon: string; category: string } {
  const text = rawText.toLowerCase()
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(keyword => text.includes(keyword.toLowerCase()))) {
      return { icon: rule.icon, category: rule.category }
    }
  }
  return { icon: DEFAULT_SKILL_ICON, category: DEFAULT_SKILL_CATEGORY }
}

export function normalizeSkillDisplayName(name: string): string {
  return String(name || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function fallbackSkillId(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || `skill-${Date.now()}`
}

export function deriveSkillDescription(text: string, fallback = '导入自外部来源的 LaborAny 技能'): string {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*`[\]\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return fallback
  return cleaned.slice(0, 180)
}

async function findReadmePath(skillDir: string): Promise<string | null> {
  const directCandidates = ['README.md', 'readme.md', 'README.MD']
  for (const candidate of directCandidates) {
    const fullPath = join(skillDir, candidate)
    if (existsSync(fullPath)) return fullPath
  }

  try {
    const entries = await readdir(skillDir, { withFileTypes: true })
    const nestedReadmeDir = entries.find(entry => entry.isDirectory() && /^docs?$/i.test(entry.name))
    if (!nestedReadmeDir) return null
    const nestedPath = join(skillDir, nestedReadmeDir.name, 'README.md')
    return existsSync(nestedPath) ? nestedPath : null
  } catch {
    return null
  }
}

async function ensureSkillTemplateForLaborAny(skillDir: string, fallbackName: string): Promise<boolean> {
  const skillMdPath = join(skillDir, 'SKILL.md')
  if (existsSync(skillMdPath)) return false

  const readmePath = await findReadmePath(skillDir)
  const readmeText = readmePath ? await readFile(readmePath, 'utf-8').catch(() => '') : ''

  const candidateName = normalizeSkillDisplayName(fallbackName || basename(skillDir) || 'Imported Skill')
  const name = candidateName || 'Imported Skill'
  const description = deriveSkillDescription(readmeText, `${name}（外部来源）自动改造为 LaborAny 可安装技能`)
  const inferred = inferMetadata(`${name}\n${description}`)

  const frontmatter = stringifyYaml({
    name,
    description,
    icon: inferred.icon,
    category: inferred.category,
  }).trimEnd()

  const body = [
    '# Skill Overview',
    '',
    'This skill is auto-converted from an external source to match LaborAny skill format.',
    '',
    readmePath
      ? `Primary reference is kept at \`${basename(readmePath)}\`.`
      : 'No README was found in source package; please refine instructions as needed.',
    '',
    '## Usage',
    '',
    '- Read bundled references/scripts in this skill directory when needed.',
    '- Adjust this SKILL.md for your own workflow and execution constraints.',
    '',
  ].join('\n')

  await mkdir(skillDir, { recursive: true })
  await writeFile(skillMdPath, `---\n${frontmatter}\n---\n\n${body}`, 'utf-8')
  return true
}

async function patchSkillMetadata(skillDir: string, fallbackName: string): Promise<{
  meta: SkillMetadata
  metadataPatched: { icon: boolean; category: boolean }
}> {
  const skillMdPath = join(skillDir, 'SKILL.md')
  const skillYamlPath = join(skillDir, 'skill.yaml')

  if (!existsSync(skillMdPath)) {
    throw new Error('skill 目录缺少 SKILL.md')
  }

  const skillMdRaw = await readFile(skillMdPath, 'utf-8')
  const frontmatterParsed = parseFrontmatter(skillMdRaw)

  if (frontmatterParsed) {
    const frontmatter = frontmatterParsed.frontmatter
    const body = frontmatterParsed.body
    const bodyDescription = deriveSkillDescription(body, '')
    const name = (typeof frontmatter.name === 'string' && frontmatter.name.trim()) || normalizeSkillDisplayName(fallbackName)
    const description = (typeof frontmatter.description === 'string' && frontmatter.description.trim()) || bodyDescription || `${name} for LaborAny`
    const existedIcon = typeof frontmatter.icon === 'string' ? frontmatter.icon.trim() : ''
    const existedCategory = typeof frontmatter.category === 'string' ? frontmatter.category.trim() : ''

    const inferred = inferMetadata(`${name}\n${description}`)
    const finalIcon = existedIcon || inferred.icon
    const finalCategory = existedCategory || inferred.category

    const metadataPatched = {
      icon: !existedIcon,
      category: !existedCategory,
    }

    const shouldRewrite = metadataPatched.icon
      || metadataPatched.category
      || !(typeof frontmatter.name === 'string' && frontmatter.name.trim())
      || !(typeof frontmatter.description === 'string' && frontmatter.description.trim())

    if (shouldRewrite) {
      const nextFrontmatter: Record<string, unknown> = {
        ...frontmatter,
        name,
        description,
        icon: finalIcon,
        category: finalCategory,
      }
      const yamlBody = stringifyYaml(nextFrontmatter).trimEnd()
      const nextSkillMd = `---\n${yamlBody}\n---${body.startsWith('\n') ? body : `\n${body}`}`
      await writeFile(skillMdPath, nextSkillMd, 'utf-8')
    }

    return {
      meta: {
        name,
        description,
        icon: finalIcon,
        category: finalCategory,
      },
      metadataPatched,
    }
  }

  if (!existsSync(skillYamlPath)) {
    const name = normalizeSkillDisplayName(fallbackName || 'Imported Skill')
    const description = deriveSkillDescription(skillMdRaw, `${name} for LaborAny`)
    const inferred = inferMetadata(`${name}\n${description}`)
    const yamlBody = stringifyYaml({
      name,
      description,
      icon: inferred.icon,
      category: inferred.category,
    }).trimEnd()
    await writeFile(skillMdPath, `---\n${yamlBody}\n---\n\n${skillMdRaw}`, 'utf-8')
    return {
      meta: {
        name,
        description,
        icon: inferred.icon,
        category: inferred.category,
      },
      metadataPatched: {
        icon: true,
        category: true,
      },
    }
  }

  const yamlRaw = await readFile(skillYamlPath, 'utf-8')
  const yamlObject = parseYaml(yamlRaw) as Record<string, unknown> || {}
  const name = (typeof yamlObject.name === 'string' && yamlObject.name.trim()) || normalizeSkillDisplayName(fallbackName)
  const description = (typeof yamlObject.description === 'string' && yamlObject.description.trim()) || deriveSkillDescription(skillMdRaw, `${name} for LaborAny`)
  const existedIcon = typeof yamlObject.icon === 'string' ? yamlObject.icon.trim() : ''
  const existedCategory = typeof yamlObject.category === 'string' ? yamlObject.category.trim() : ''

  const inferred = inferMetadata(`${name}\n${description}`)
  const finalIcon = existedIcon || inferred.icon
  const finalCategory = existedCategory || inferred.category

  const metadataPatched = {
    icon: !existedIcon,
    category: !existedCategory,
  }

  if (metadataPatched.icon || metadataPatched.category || !(typeof yamlObject.description === 'string' && yamlObject.description.trim())) {
    const nextYaml: Record<string, unknown> = {
      ...yamlObject,
      name,
      description,
      icon: finalIcon,
      category: finalCategory,
    }
    await writeFile(skillYamlPath, stringifyYaml(nextYaml), 'utf-8')
  }

  return {
    meta: {
      name,
      description,
      icon: finalIcon,
      category: finalCategory,
    },
    metadataPatched,
  }
}

async function createUniqueSkillId(displayName: string, preferredId?: string, currentId?: string): Promise<string> {
  const normalizedName = normalizeCapabilityDisplayName(displayName || 'Imported Skill')
  const preferredBase = preferredId
    ? generateCapabilityId(preferredId, 'skill')
    : ''
  const baseId = preferredBase || generateCapabilityId(normalizedName, 'skill') || fallbackSkillId(normalizedName)
  const existing = await loadSkill.listAll()
  const idSet = new Set(existing.map(item => item.id))

  if (currentId && idSet.has(currentId)) {
    idSet.delete(currentId)
  }

  return pickUniqueCapabilityId(baseId, idSet)
}

async function prepareSkillDirectory(skillDir: string, fallbackName: string): Promise<{
  sourceAdapted: boolean
  meta: SkillMetadata
  metadataPatched: { icon: boolean; category: boolean }
}> {
  const sourceAdapted = await ensureSkillTemplateForLaborAny(skillDir, fallbackName)
  const patched = await patchSkillMetadata(skillDir, fallbackName)
  return {
    sourceAdapted,
    meta: patched.meta,
    metadataPatched: patched.metadataPatched,
  }
}

export async function materializeStagedSkillDirectory(params: {
  stagingDir: string
  fallbackName: string
  preferredSkillId?: string
  userSkillsDir?: string
}): Promise<MaterializedSkillResult> {
  const userSkillsDir = params.userSkillsDir || loadSkill.getUserSkillsDir()
  const prepared = await prepareSkillDirectory(params.stagingDir, params.fallbackName)
  const finalSkillId = await createUniqueSkillId(prepared.meta.name, params.preferredSkillId)
  const installedPath = join(userSkillsDir, finalSkillId)

  if (existsSync(installedPath)) {
    throw new Error('目标技能目录已存在，请重试')
  }

  await rename(params.stagingDir, installedPath)
  loadSkill.clearCache()

  return {
    skillId: finalSkillId,
    installedPath,
    sourceAdapted: prepared.sourceAdapted,
    metadataPatched: prepared.metadataPatched,
    metadata: {
      name: prepared.meta.name,
      description: prepared.meta.description,
      icon: prepared.meta.icon || DEFAULT_SKILL_ICON,
      category: prepared.meta.category || DEFAULT_SKILL_CATEGORY,
    },
  }
}

export async function materializeExistingSkillDirectory(params: {
  existingSkillId: string
  preferredSkillId?: string
  fallbackName?: string
  userSkillsDir?: string
}): Promise<MaterializedSkillResult> {
  const userSkillsDir = params.userSkillsDir || loadSkill.getUserSkillsDir()
  const currentPath = join(userSkillsDir, params.existingSkillId)
  const fallbackName = normalizeSkillDisplayName(params.fallbackName || params.existingSkillId || basename(currentPath))
  const prepared = await prepareSkillDirectory(currentPath, fallbackName)
  const finalSkillId = await createUniqueSkillId(prepared.meta.name, params.preferredSkillId, params.existingSkillId)
  const installedPath = join(userSkillsDir, finalSkillId)

  if (finalSkillId !== params.existingSkillId) {
    if (existsSync(installedPath)) {
      throw new Error('目标技能目录已存在，请重试')
    }
    await rename(currentPath, installedPath)
  }

  loadSkill.clearCache()

  return {
    skillId: finalSkillId,
    installedPath: finalSkillId === params.existingSkillId ? currentPath : installedPath,
    sourceAdapted: prepared.sourceAdapted,
    metadataPatched: prepared.metadataPatched,
    metadata: {
      name: prepared.meta.name,
      description: prepared.meta.description,
      icon: prepared.meta.icon || DEFAULT_SKILL_ICON,
      category: prepared.meta.category || DEFAULT_SKILL_CATEGORY,
    },
  }
}
