import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { stringify as stringifyYaml } from 'yaml'
import {
  generateCapabilityId,
  normalizeCapabilityId,
} from 'laborany-shared'

export interface CompositeStep {
  skill: string
  name: string
  prompt: string
}

export interface CompositeInputParam {
  type: 'string' | 'number' | 'boolean'
  description: string
  required?: boolean
  default?: string | number | boolean
}

export interface CompositeSkillDraft {
  id: string
  name: string
  description: string
  icon?: string
  steps: CompositeStep[]
  input: Record<string, CompositeInputParam>
  on_failure: 'stop' | 'continue' | 'retry'
}

export function generateSkillMd(draft: CompositeSkillDraft): string {
  const lines: string[] = []

  lines.push(`# ${draft.name}`)
  lines.push('')
  lines.push(draft.description || '这是一个复合 skill。')
  lines.push('')

  lines.push('## 复合能力概览')
  lines.push('')
  lines.push(`本能力包含 ${draft.steps.length} 个执行步骤：`)
  lines.push('')
  draft.steps.forEach((step, i) => {
    lines.push(`${i + 1}. **${step.name}** - 调用 \`${step.skill}\``)
  })
  lines.push('')

  if (Object.keys(draft.input).length > 0) {
    lines.push('## 输入参数')
    lines.push('')
    for (const [key, param] of Object.entries(draft.input)) {
      const required = param.required ? '（必填）' : '（可选）'
      lines.push(`- **${key}**${required}: ${param.description || '无描述'}`)
    }
    lines.push('')
  }

  lines.push('## 执行原则')
  lines.push('')
  lines.push('1. 先确认输入参数完整')
  lines.push('2. 严格按步骤顺序执行')
  lines.push('3. 每步完成后同步进度')
  lines.push('4. 最后输出执行总结')
  lines.push('')

  lines.push('## 步骤详情')
  lines.push('')
  draft.steps.forEach((step, i) => {
    lines.push(`### 步骤 ${i + 1}: ${step.name}`)
    lines.push('')
    lines.push(`**调用技能**: \`${step.skill}\``)
    lines.push('')
    if (step.prompt) {
      lines.push('**提示词模板**:')
      lines.push('```')
      lines.push(step.prompt)
      lines.push('```')
      lines.push('')
    }
  })

  return lines.join('\n')
}

export function generateSkillYaml(draft: CompositeSkillDraft): string {
  const skillYaml = {
    name: draft.name,
    description: draft.description,
    icon: draft.icon || '🔀',
    kind: 'composite',
    steps: draft.steps.map((step) => ({
      name: step.name,
      skill: step.skill,
      prompt: step.prompt,
    })),
    input: draft.input,
    on_failure: draft.on_failure || 'stop',
  }

  return stringifyYaml(skillYaml)
}

export async function convertCompositeDraftToSkill(
  draft: CompositeSkillDraft,
  targetSkillsDir: string,
): Promise<string> {
  const normalizedName = draft.name.trim() || draft.id || 'composite-skill'
  const idBase = draft.id ? normalizeCapabilityId(draft.id, 'composite') : generateCapabilityId(normalizedName, 'composite')
  const skillId = idBase
  const skillDir = join(targetSkillsDir, skillId)

  await mkdir(skillDir, { recursive: true })
  await writeFile(join(skillDir, 'SKILL.md'), generateSkillMd({ ...draft, id: skillId }), 'utf-8')
  await writeFile(join(skillDir, 'skill.yaml'), generateSkillYaml({ ...draft, id: skillId }), 'utf-8')

  return skillId
}
