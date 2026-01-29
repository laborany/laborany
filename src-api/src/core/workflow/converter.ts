/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    工作流转技能转化器                                      ║
 * ║                                                                          ║
 * ║  核心思想：工作流本质上是一个「元技能」                                      ║
 * ║  创建阶段：画布拖拽 → workflow.yaml                                        ║
 * ║  安装阶段：workflow.yaml → SKILL.md + skill.yaml                          ║
 * ║  使用阶段：和普通技能一致，支持对话交互                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { stringify as stringifyYaml } from 'yaml'
import type { WorkflowDefinition, WorkflowStep, WorkflowInputParam } from './types.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       生成 SKILL.md 内容                                  │
 * │  告诉 Claude 这是一个多步骤工作流，每步需要确认                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function generateSkillMd(workflow: WorkflowDefinition): string {
  const lines: string[] = []

  // 标题和描述
  lines.push(`# ${workflow.name}`)
  lines.push('')
  lines.push(workflow.description || '这是一个多步骤工作流技能。')
  lines.push('')

  // 工作流概述
  lines.push('## 工作流概述')
  lines.push('')
  lines.push(`本技能包含 ${workflow.steps.length} 个执行步骤，按顺序完成以下任务：`)
  lines.push('')
  workflow.steps.forEach((step, i) => {
    lines.push(`${i + 1}. **${step.name}** - 使用 \`${step.skill}\` 技能`)
  })
  lines.push('')

  // 输入参数说明
  if (Object.keys(workflow.input).length > 0) {
    lines.push('## 输入参数')
    lines.push('')
    for (const [key, param] of Object.entries(workflow.input)) {
      const required = param.required ? '（必填）' : '（可选）'
      lines.push(`- **${key}**${required}: ${param.description || '无描述'}`)
    }
    lines.push('')
  }

  // 执行指南
  lines.push('## 执行指南')
  lines.push('')
  lines.push('作为工作流执行助手，你需要：')
  lines.push('')
  lines.push('1. **收集输入**：在开始前，确认用户已提供所有必要的输入参数')
  lines.push('2. **分步执行**：按顺序执行每个步骤，每完成一步向用户报告进度')
  lines.push('3. **交互确认**：用户可以在任何步骤后要求修正、重试或跳过')
  lines.push('4. **结果汇总**：所有步骤完成后，提供完整的执行摘要')
  lines.push('')

  // 步骤详情
  lines.push('## 步骤详情')
  lines.push('')
  workflow.steps.forEach((step, i) => {
    lines.push(`### 步骤 ${i + 1}: ${step.name}`)
    lines.push('')
    lines.push(`**使用技能**: \`${step.skill}\``)
    lines.push('')
    if (step.prompt) {
      lines.push('**提示词模板**:')
      lines.push('```')
      lines.push(step.prompt)
      lines.push('```')
      lines.push('')
    }
  })

  // 失败策略
  lines.push('## 失败处理')
  lines.push('')
  const failureDesc = {
    stop: '如果某个步骤失败，立即停止执行并报告错误',
    continue: '如果某个步骤失败，记录错误但继续执行后续步骤',
    retry: '如果某个步骤失败，询问用户是否重试',
  }
  lines.push(failureDesc[workflow.on_failure] || failureDesc.stop)
  lines.push('')

  // 文件输出规范（工作流步骤隔离）
  lines.push('## 文件输出规范')
  lines.push('')
  lines.push('### 输出目录')
  lines.push('')
  lines.push('每个步骤的产出文件必须放入对应的子目录：')
  lines.push('')
  workflow.steps.forEach((step, i) => {
    lines.push(`- 步骤 ${i + 1} → \`step-${i}-${step.name}/\``)
  })
  lines.push('')
  lines.push('### 引用前序步骤的产出')
  lines.push('')
  lines.push('后续步骤需要读取前面步骤的文件时，按以下路径查找：')
  lines.push('')
  workflow.steps.forEach((step, i) => {
    if (i > 0) {
      const prevSteps = workflow.steps.slice(0, i)
      const refs = prevSteps.map((ps, pi) => `\`step-${pi}-${ps.name}/\``).join('、')
      lines.push(`- 步骤 ${i + 1} 可引用：${refs}`)
    }
  })
  if (workflow.steps.length > 1) {
    lines.push('')
    lines.push('**重要**：执行每个步骤前，先检查前序步骤的输出目录，确认所需文件存在。')
  }
  lines.push('')

  // 交互原则
  lines.push('## 交互原则')
  lines.push('')
  lines.push('- 每完成一个步骤，简要报告结果并询问是否继续')
  lines.push('- 如果用户要求修改某个步骤的输出，重新执行该步骤')
  lines.push('- 保持���话的连贯性，记住之前步骤的上下文')
  lines.push('- 最终输出应整合所有步骤的结果')
  lines.push('')

  return lines.join('\n')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       skill.yaml 元数据结构                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface SkillYamlData {
  name: string
  description: string
  icon?: string
  category: string
  source: 'workflow'
  workflow: {
    id: string
    steps: WorkflowStep[]
    input: Record<string, WorkflowInputParam>
    on_failure: 'stop' | 'continue' | 'retry'
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       生成 skill.yaml 内容                                │
 * │  保留原始 workflow 定义，支持从技能还原工作流编辑                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function generateSkillYaml(workflow: WorkflowDefinition): string {
  const data: SkillYamlData = {
    name: workflow.name,
    description: workflow.description,
    icon: workflow.icon,
    category: '工作流',
    source: 'workflow',
    workflow: {
      id: workflow.id,
      steps: workflow.steps,
      input: workflow.input,
      on_failure: workflow.on_failure,
    },
  }

  return stringifyYaml(data)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       转化工作流为技能                                     │
 * │  在指定目录创建 SKILL.md 和 skill.yaml                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export async function convertWorkflowToSkill(
  workflow: WorkflowDefinition,
  outputDir: string
): Promise<string> {
  const skillId = `workflow-${workflow.id}`
  const skillDir = join(outputDir, skillId)

  // 创建技能目录
  await mkdir(skillDir, { recursive: true })

  // 生成并写入 SKILL.md
  const skillMd = generateSkillMd(workflow)
  await writeFile(join(skillDir, 'SKILL.md'), skillMd, 'utf-8')

  // 生成并写入 skill.yaml
  const skillYaml = generateSkillYaml(workflow)
  await writeFile(join(skillDir, 'skill.yaml'), skillYaml, 'utf-8')

  return skillId
}
