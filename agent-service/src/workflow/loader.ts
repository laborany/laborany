/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流加载器                                       ║
 * ║                                                                          ║
 * ║  职责：读取 workflows 目录下的 workflow.yaml                               ║
 * ║  设计：单例模式，缓存已加载的工作流                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { readFile, readdir, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { WorkflowDefinition, WorkflowInputParam, WorkflowStep } from './types.js'
import { WORKFLOWS_DIR, BUILTIN_WORKFLOWS_DIR } from '../paths.js'
import {
  generateCapabilityId,
  normalizeCapabilityDisplayName,
  normalizeCapabilityId,
  pickUniqueCapabilityId,
} from 'laborany-shared'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     工作流搜索路径                                         │
 * │                                                                          │
 * │  用户目录优先，内置目录兜底                                               │
 * │  开发模式下两者相同，自然去重                                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const SEARCH_DIRS = WORKFLOWS_DIR === BUILTIN_WORKFLOWS_DIR
  ? [WORKFLOWS_DIR]
  : [WORKFLOWS_DIR, BUILTIN_WORKFLOWS_DIR]

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           工作流缓存                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const workflowCache = new Map<string, WorkflowDefinition>()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       YAML 文件结构                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
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

  if (existsSync(WORKFLOWS_DIR)) {
    const dirs = await readdir(WORKFLOWS_DIR, { withFileTypes: true })
    for (const dir of dirs) {
      if (dir.isDirectory()) {
        existingIds.add(dir.name)
      }
    }
  }

  if (BUILTIN_WORKFLOWS_DIR !== WORKFLOWS_DIR && existsSync(BUILTIN_WORKFLOWS_DIR)) {
    const dirs = await readdir(BUILTIN_WORKFLOWS_DIR, { withFileTypes: true })
    for (const dir of dirs) {
      if (dir.isDirectory()) {
        existingIds.add(dir.name)
      }
    }
  }

  return existingIds
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       在搜索路径中定位工作流 YAML                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function findWorkflowYaml(workflowId: string): string | null {
  for (const dir of SEARCH_DIRS) {
    const yamlPath = join(dir, workflowId, 'workflow.yaml')
    if (existsSync(yamlPath)) return yamlPath
  }
  return null
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       加载单个工作流                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function loadSingleWorkflow(workflowId: string): Promise<WorkflowDefinition | null> {
  try {
    const yamlPath = findWorkflowYaml(workflowId)
    if (!yamlPath) return null

    const yamlContent = await readFile(yamlPath, 'utf-8')
    const data = parseYaml(yamlContent) as WorkflowYaml

    return {
      id: workflowId,
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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       导出的加载器对象                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const loadWorkflow = {
  // 根据 ID 加载工作流
  async byId(id: string): Promise<WorkflowDefinition | null> {
    if (workflowCache.has(id)) {
      return workflowCache.get(id)!
    }
    const workflow = await loadSingleWorkflow(id)
    if (workflow) {
      workflowCache.set(id, workflow)
    }
    return workflow
  },

  // 列出所有可用工作流（用户目录优先，同 ID 覆盖内置）
  async listAll(): Promise<WorkflowDefinition[]> {
    const seen = new Map<string, WorkflowDefinition>()

    for (const baseDir of SEARCH_DIRS) {
      if (!existsSync(baseDir)) continue
      const dirs = await readdir(baseDir, { withFileTypes: true })
      for (const dir of dirs) {
        if (!dir.isDirectory() || seen.has(dir.name)) continue
        const workflow = await this.byId(dir.name)
        if (workflow) seen.set(dir.name, workflow)
      }
    }
    return [...seen.values()]
  },

  // 创建新工作流
  async create(workflow: Omit<WorkflowDefinition, 'id'> & { id?: string }): Promise<WorkflowDefinition> {
    const normalizedName = normalizeCapabilityDisplayName(workflow.name)
    const idBase = workflow.id
      ? normalizeCapabilityId(workflow.id, 'workflow')
      : generateCapabilityId(normalizedName, 'workflow')

    const existingIds = await collectExistingWorkflowIds()
    const id = pickUniqueCapabilityId(idBase, existingIds)
    const workflowPath = join(WORKFLOWS_DIR, id)

    // 确保目录存在
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

  // 更新工作流
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

  // 删除工作流
  async delete(id: string): Promise<boolean> {
    const workflowPath = join(WORKFLOWS_DIR, id)
    if (!existsSync(workflowPath)) return false

    const { rm } = await import('fs/promises')
    await rm(workflowPath, { recursive: true, force: true })
    workflowCache.delete(id)
    return true
  },

  // 清除缓存
  clearCache(): void {
    workflowCache.clear()
  },

  // 获取工作流目录路径
  getWorkflowsDir(): string {
    return WORKFLOWS_DIR
  },
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       生成工作流 ID                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
