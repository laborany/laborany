import fs from 'fs'
import path from 'path'
import { parse as parseYaml } from 'yaml'
import { RESOURCES_DIR, WORKFLOWS_DIR } from './paths.js'
import { BUILTIN_SKILLS_DIR, USER_SKILLS_DIR } from 'laborany-shared'

export interface CatalogItem {
  type: 'skill' | 'workflow'
  id: string
  name: string
  description: string
  keywords: string[]
}

const CATALOG_DIRS = {
  skills: [path.join(RESOURCES_DIR, 'skills'), BUILTIN_SKILLS_DIR, USER_SKILLS_DIR],
  workflows: [WORKFLOWS_DIR],
}

export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function extractFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) {
    return null
  }
  try {
    return parseYaml(match[1]) as Record<string, unknown>
  } catch {
    return null
  }
}

function readSkillMeta(rootDir: string, id: string): CatalogItem | null {
  const skillDir = path.join(rootDir, id)
  const skillMdPath = path.join(skillDir, 'SKILL.md')
  const skillYamlPath = path.join(skillDir, 'skill.yaml')

  try {
    if (fs.existsSync(skillMdPath)) {
      const content = fs.readFileSync(skillMdPath, 'utf-8')
      const fm = extractFrontmatter(content)
      const name = (fm?.name as string) || id
      const desc = (fm?.description as string) || ''
      return {
        type: 'skill',
        id,
        name,
        description: desc,
        keywords: extractKeywords(`${name} ${desc}`),
      }
    }

    if (!fs.existsSync(skillYamlPath)) {
      return null
    }

    const doc = parseYaml(fs.readFileSync(skillYamlPath, 'utf-8')) as Record<string, unknown>
    const name = (doc.name as string) || id
    const desc = (doc.description as string) || ''
    return {
      type: 'skill',
      id,
      name,
      description: desc,
      keywords: extractKeywords(`${name} ${desc}`),
    }
  } catch {
    return null
  }
}

function directoryMtimeMs(dirPath: string): number {
  if (!fs.existsSync(dirPath)) {
    return 0
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  let maxMtimeMs = 0

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    try {
      const st = fs.statSync(fullPath)
      if (st.mtimeMs > maxMtimeMs) {
        maxMtimeMs = st.mtimeMs
      }
    } catch {
      // ignore single entry read error
    }
  }

  return maxMtimeMs
}

function computeCatalogVersion(): string {
  const parts: string[] = []

  for (const dir of CATALOG_DIRS.skills) {
    parts.push(`${dir}:${directoryMtimeMs(dir)}`)
  }

  for (const dir of CATALOG_DIRS.workflows) {
    parts.push(`${dir}:${directoryMtimeMs(dir)}`)
  }

  return parts.join('|')
}

export function scanSkills(): CatalogItem[] {
  const seen = new Set<string>()
  const items: CatalogItem[] = []

  for (const dir of CATALOG_DIRS.skills) {
    if (!dir || !fs.existsSync(dir)) {
      continue
    }

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || seen.has(entry.name)) {
        continue
      }
      seen.add(entry.name)
      const item = readSkillMeta(dir, entry.name)
      if (item) {
        items.push(item)
      }
    }
  }

  return items
}

export function scanWorkflows(): CatalogItem[] {
  if (!fs.existsSync(WORKFLOWS_DIR)) {
    return []
  }

  return fs
    .readdirSync(WORKFLOWS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const workflowYaml = path.join(WORKFLOWS_DIR, entry.name, 'workflow.yaml')
      if (!fs.existsSync(workflowYaml)) {
        return null
      }

      try {
        const doc = parseYaml(fs.readFileSync(workflowYaml, 'utf-8')) as Record<string, unknown>
        const name = (doc.name as string) || entry.name
        const description = (doc.description as string) || ''
        return {
          type: 'workflow' as const,
          id: entry.name,
          name,
          description,
          keywords: extractKeywords(`${name} ${description}`),
        }
      } catch {
        return null
      }
    })
    .filter(Boolean) as CatalogItem[]
}

let cachedCatalog: CatalogItem[] = []
let cacheVersion = ''

export function invalidateCatalogCache(): void {
  cachedCatalog = []
  cacheVersion = ''
}

export function loadCatalog(): CatalogItem[] {
  const nextVersion = computeCatalogVersion()
  if (cachedCatalog.length > 0 && nextVersion === cacheVersion) {
    return cachedCatalog
  }

  cachedCatalog = [...scanSkills(), ...scanWorkflows()]
  cacheVersion = nextVersion
  return cachedCatalog
}

