/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流加载器                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { readFile, readdir, mkdir, writeFile, rm } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, mkdirSync } from 'fs'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { homedir, platform } from 'os'
import type { WorkflowDefinition, WorkflowInputParam, WorkflowStep } from './types.js'
import { convertWorkflowToSkill } from './converter.js'
import {
  generateCapabilityId,
  normalizeCapabilityDisplayName,
  normalizeCapabilityId,
  pickUniqueCapabilityId,
} from 'laborany-shared'

const __dirname = dirname(fileURLToPath(import.meta.url))

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       判断是否为打包模式                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function isPackaged(): boolean {
  return !process.execPath.includes('node')
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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取 Workflows 目录路径                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getWorkflowsDir(): string {
  // 打包后：API exe 在 resources/api/，workflows 在 resources/workflows/
  const pkgPath = join(dirname(process.execPath), '..', 'workflows')
  if (existsSync(pkgPath)) return pkgPath

  // 开发模式：相对于源码
  return join(__dirname, '../../../../workflows')
}

const WORKFLOWS_DIR = getWorkflowsDir()

const workflowCache = new Map<string, WorkflowDefinition>()

interface WorkflowYaml {
  name: string
  description: string
  icon?: string
  steps: WorkflowStep[]
  input?: Record<string, WorkflowInputParam>
  on_failure?: 'stop' | 'continue' | 'retry'
}

async function collectExistingWorkflowIds(): Promise<Set<string>> {
  const existingIds = new Set<string>()
  if (!existsSync(WORKFLOWS_DIR)) {
    return existingIds
  }

  const dirs = await readdir(WORKFLOWS_DIR, { withFileTypes: true })
  for (const dir of dirs) {
    if (dir.isDirectory()) {
      existingIds.add(dir.name)
    }
  }

  return existingIds
}

async function loadSingleWorkflow(workflowDir: string): Promise<WorkflowDefinition | null> {
  try {
    const workflowPath = join(WORKFLOWS_DIR, workflowDir)
    const yamlPath = join(workflowPath, 'workflow.yaml')

    if (!existsSync(yamlPath)) return null

    const yamlContent = await readFile(yamlPath, 'utf-8')
    const data = parseYaml(yamlContent) as WorkflowYaml

    return {
      id: workflowDir,
      name: data.name,
      description: data.description,
      icon: data.icon,
      steps: data.steps,
      input: data.input || {},
      on_failure: data.on_failure || 'stop',
    }
  } catch {
    return null
  }
}

export const loadWorkflow = {
  async byId(id: string): Promise<WorkflowDefinition | null> {
    if (workflowCache.has(id)) return workflowCache.get(id)!
    const workflow = await loadSingleWorkflow(id)
    if (workflow) workflowCache.set(id, workflow)
    return workflow
  },

  async listAll(): Promise<WorkflowDefinition[]> {
    if (!existsSync(WORKFLOWS_DIR)) {
      await mkdir(WORKFLOWS_DIR, { recursive: true })
      return []
    }

    const dirs = await readdir(WORKFLOWS_DIR, { withFileTypes: true })
    const workflows: WorkflowDefinition[] = []

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue
      const workflow = await this.byId(dir.name)
      if (workflow) workflows.push(workflow)
    }
    return workflows
  },

  async create(workflow: Omit<WorkflowDefinition, 'id'> & { id?: string }): Promise<WorkflowDefinition> {
    const normalizedName = normalizeCapabilityDisplayName(workflow.name)
    const idBase = workflow.id
      ? normalizeCapabilityId(workflow.id, 'workflow')
      : generateCapabilityId(normalizedName, 'workflow')

    const existingIds = await collectExistingWorkflowIds()
    const id = pickUniqueCapabilityId(idBase, existingIds)
    const workflowPath = join(WORKFLOWS_DIR, id)

    await mkdir(workflowPath, { recursive: true })

    const yamlData: WorkflowYaml = {
      name: normalizedName,
      description: workflow.description,
      icon: workflow.icon,
      steps: workflow.steps,
      input: workflow.input,
      on_failure: workflow.on_failure,
    }

    const yamlContent = stringifyYaml(yamlData)
    await writeFile(join(workflowPath, 'workflow.yaml'), yamlContent, 'utf-8')

    const newWorkflow: WorkflowDefinition = { ...workflow, id, name: normalizedName }
    workflowCache.set(id, newWorkflow)

    return newWorkflow
  },

  async update(id: string, workflow: Partial<WorkflowDefinition>): Promise<WorkflowDefinition | null> {
    const existing = await this.byId(id)
    if (!existing) return null

    const normalizedName = normalizeCapabilityDisplayName(workflow.name ?? existing.name)
    const updated: WorkflowDefinition = { ...existing, ...workflow, id, name: normalizedName }
    const workflowPath = join(WORKFLOWS_DIR, id)

    const yamlData: WorkflowYaml = {
      name: updated.name,
      description: updated.description,
      icon: updated.icon,
      steps: updated.steps,
      input: updated.input,
      on_failure: updated.on_failure,
    }

    const yamlContent = stringifyYaml(yamlData)
    await writeFile(join(workflowPath, 'workflow.yaml'), yamlContent, 'utf-8')

    workflowCache.set(id, updated)
    return updated
  },

  async delete(id: string): Promise<boolean> {
    const workflowPath = join(WORKFLOWS_DIR, id)
    if (!existsSync(workflowPath)) return false

    await rm(workflowPath, { recursive: true, force: true })
    workflowCache.delete(id)
    return true
  },

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                       安装工作流为技能                                     │
   * │  将工作流转化为技能，安装到用户 skills 目录                                 │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  async installAsSkill(workflowId: string): Promise<{ skillId: string }> {
    const workflow = await this.byId(workflowId)
    if (!workflow) {
      throw new Error(`工作流 "${workflowId}" 不存在`)
    }

    const userSkillsDir = getUserSkillsDir()
    const skillId = await convertWorkflowToSkill(workflow, userSkillsDir)

    return { skillId }
  },

  clearCache(): void {
    workflowCache.clear()
  },

  getWorkflowsDir(): string {
    return WORKFLOWS_DIR
  },

  async getHistory(): Promise<unknown[]> {
    // TODO: 从数据库获取工作流执行历史
    return []
  },

  async getRunDetail(runId: string): Promise<unknown | null> {
    // TODO: 从数据库获取单次执行详情
    return null
  },
}
