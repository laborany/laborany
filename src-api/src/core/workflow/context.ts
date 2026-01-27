/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流上下文管理                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { WorkflowContext, StepResult } from './types.js'

export function createContext(input: Record<string, unknown>): WorkflowContext {
  return { input, steps: [], current: 0, files: [] }
}

export function addStepResult(context: WorkflowContext, result: StepResult): WorkflowContext {
  return {
    ...context,
    steps: [...context.steps, result],
    current: context.current + 1,
    files: [...context.files, ...result.files],
  }
}

export function renderPrompt(template: string, context: WorkflowContext): string {
  const data: Record<string, unknown> = {
    input: context.input,
    steps: context.steps,
    files: context.files,
    prev: context.steps.length > 0 ? context.steps[context.steps.length - 1] : null,
  }

  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const value = getNestedValue(data, path.trim())
    if (value === undefined || value === null) return match
    if (typeof value === 'object') return JSON.stringify(value, null, 2)
    return String(value)
  })
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(/\.|\[|\]/).filter(Boolean)
  let current: unknown = obj

  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

export function buildStepPrompt(
  stepPrompt: string,
  context: WorkflowContext,
  stepIndex: number,
  totalSteps: number
): string {
  const renderedPrompt = renderPrompt(stepPrompt, context)
  const contextSummary = buildContextSummary(context, stepIndex, totalSteps)
  return `${contextSummary}\n\n---\n\n${renderedPrompt}`
}

function buildContextSummary(
  context: WorkflowContext,
  stepIndex: number,
  totalSteps: number
): string {
  const lines: string[] = [
    `## 工作流执行上下文`,
    ``,
    `当前步骤：${stepIndex + 1} / ${totalSteps}`,
  ]

  if (Object.keys(context.input).length > 0) {
    lines.push(``, `### 输入参数`)
    for (const [key, value] of Object.entries(context.input)) {
      lines.push(`- ${key}: ${JSON.stringify(value)}`)
    }
  }

  if (context.steps.length > 0) {
    lines.push(``, `### 前序步骤结果`)
    for (const step of context.steps) {
      const statusIcon = step.status === 'completed' ? '✓' : '✗'
      lines.push(``, `**步骤 ${step.stepIndex + 1}** [${statusIcon}]`)
      const outputSummary = step.output.length > 500
        ? step.output.slice(0, 500) + '...'
        : step.output
      lines.push(outputSummary)
      if (step.files.length > 0) {
        lines.push(``, `生成文件: ${step.files.join(', ')}`)
      }
    }
  }

  return lines.join('\n')
}
