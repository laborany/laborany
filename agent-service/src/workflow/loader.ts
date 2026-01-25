/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流加载器                                       ║
 * ║                                                                          ║
 * ║  职责：读取 workflows 目录下的 workflow.yaml                               ║
 * ║  设计：单例模式，缓存已加载的工作流                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { readFile, readdir, mkdir, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { WorkflowDefinition, WorkflowInputParam, WorkflowStep } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WORKFLOWS_DIR = join(__dirname, '../../../workflows')

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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       加载单个工作流                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function loadSingleWorkflow(workflowDir: string): Promise<WorkflowDefinition | null> {
  try {
    const workflowPath = join(WORKFLOWS_DIR, workflowDir)
    const yamlPath = join(workflowPath, 'workflow.yaml')

    if (!existsSync(yamlPath)) {
      return null
    }

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

  // 列出所有可用工作流
  async listAll(): Promise<WorkflowDefinition[]> {
    // 确保目录存在
    if (!existsSync(WORKFLOWS_DIR)) {
      await mkdir(WORKFLOWS_DIR, { recursive: true })
      return []
    }

    const dirs = await readdir(WORKFLOWS_DIR, { withFileTypes: true })
    const workflows: WorkflowDefinition[] = []

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue
      const workflow = await this.byId(dir.name)
      if (workflow) {
        workflows.push(workflow)
      }
    }
    return workflows
  },

  // 创建新工作流
  async create(workflow: Omit<WorkflowDefinition, 'id'> & { id?: string }): Promise<WorkflowDefinition> {
    const id = workflow.id || generateWorkflowId(workflow.name)
    const workflowPath = join(WORKFLOWS_DIR, id)

    // 确保目录存在
    await mkdir(workflowPath, { recursive: true })

    const yamlData: WorkflowYaml = {
      name: workflow.name,
      description: workflow.description,
      icon: workflow.icon,
      steps: workflow.steps,
      input: workflow.input,
      on_failure: workflow.on_failure,
    }

    const yamlContent = stringifyYaml(yamlData)
    await writeFile(join(workflowPath, 'workflow.yaml'), yamlContent, 'utf-8')

    const newWorkflow: WorkflowDefinition = { ...workflow, id }
    workflowCache.set(id, newWorkflow)

    return newWorkflow
  },

  // 更新工作流
  async update(id: string, workflow: Partial<WorkflowDefinition>): Promise<WorkflowDefinition | null> {
    const existing = await this.byId(id)
    if (!existing) return null

    const updated: WorkflowDefinition = { ...existing, ...workflow, id }
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
function generateWorkflowId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || `workflow-${Date.now()}`
}
