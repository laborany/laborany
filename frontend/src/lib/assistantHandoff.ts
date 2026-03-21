interface AssistantHandoffParams {
  bossRequest: string
  assigneeName?: string
  mode: 'assistant' | 'employee' | 'hr'
  reason?: string
  planSteps?: string[]
  preparedTask?: string
}

function normalizeAssigneeLabel(params: AssistantHandoffParams): string {
  if (params.mode === 'employee') return params.assigneeName || '对应同事'
  if (params.mode === 'hr') return 'HR'
  return '个人助理'
}

export function buildAssistantHandoffCardText(params: AssistantHandoffParams): string {
  const lines: string[] = [
    '## 助理已完成任务整理',
    '',
    `- 负责人：${normalizeAssigneeLabel(params)}`,
  ]

  if (params.reason?.trim()) {
    lines.push(`- 安排理由：${params.reason.trim()}`)
  }

  if (params.planSteps && params.planSteps.length > 0) {
    lines.push(`- 已整理 ${params.planSteps.length} 个执行步骤`)
  }

  if (params.preparedTask?.trim()) {
    lines.push(`- 已整理的任务重点：${params.preparedTask.trim()}`)
  }

  lines.push('- 老板原始需求已整理为内部执行说明，后续由负责人继续处理。')

  return lines.join('\n')
}

export function buildAssistantHandoffQuery(params: AssistantHandoffParams): string {
  const bossRequest = params.bossRequest.trim()
  if (!bossRequest) return ''

  const lines: string[] = [
    '## 助理交接说明',
    '',
  ]

  if (params.mode === 'employee') {
    lines.push(`- 本次由个人助理整理需求后，安排给${params.assigneeName || '对应同事'}负责。`)
  } else if (params.mode === 'hr') {
    lines.push('- 本次由个人助理整理需求后，转交给 HR 处理招聘或员工升级。')
  } else {
    lines.push('- 本次工作先由个人助理直接处理。')
  }

  if (params.reason?.trim()) {
    lines.push(`- 安排理由：${params.reason.trim()}`)
  }

  if (params.preparedTask?.trim()) {
    lines.push('- 助理整理后的任务要求：')
    lines.push(params.preparedTask.trim())
  }

  if (params.planSteps && params.planSteps.length > 0) {
    lines.push('- 助理已整理的执行安排：')
    params.planSteps.forEach((step, index) => {
      lines.push(`  ${index + 1}. ${step}`)
    })
  }

  lines.push('', '## 老板原始需求', '', bossRequest)

  return lines.join('\n').trim()
}
