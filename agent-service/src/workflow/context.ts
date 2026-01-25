/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流上下文管理                                   ║
 * ║                                                                          ║
 * ║  职责：管理工作流执行上下文，渲染 Prompt 模板                               ║
 * ║  设计：数据自动传递，无需显式映射                                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { WorkflowContext, StepResult } from './types.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       创建初始上下文                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function createContext(input: Record<string, unknown>): WorkflowContext {
  return {
    input,
    steps: [],
    current: 0,
    files: [],
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       更新上下文（添加步骤结果）                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function addStepResult(context: WorkflowContext, result: StepResult): WorkflowContext {
  return {
    ...context,
    steps: [...context.steps, result],
    current: context.current + 1,
    files: [...context.files, ...result.files],
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       渲染 Prompt 模板                                    │
 * │                                                                          │
 * │  支持的模板语法：                                                          │
 * │  - {{input.xxx}}     访问用户输入参数                                      │
 * │  - {{steps[n].output}} 访问第 n 步的输出                                  │
 * │  - {{prev.output}}   访问上一步的输出（语法糖）                             │
 * │  - {{files}}         所有生成的文件列表                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function renderPrompt(template: string, context: WorkflowContext): string {
  // 构建模板数据
  const data: Record<string, unknown> = {
    input: context.input,
    steps: context.steps,
    files: context.files,
    prev: context.steps.length > 0 ? context.steps[context.steps.length - 1] : null,
  }

  // 替换模板变量
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const value = getNestedValue(data, path.trim())
    if (value === undefined || value === null) {
      return match // 保留原始模板（未找到值）
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2)
    }
    return String(value)
  })
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取嵌套属性值                                       │
 * │                                                                          │
 * │  支持路径格式：                                                            │
 * │  - input.stock_code                                                      │
 * │  - steps[0].output                                                       │
 * │  - prev.files                                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(/\.|\[|\]/).filter(Boolean)
  let current: unknown = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    if (typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       构建步骤的完整 Prompt                                │
 * │                                                                          │
 * │  自动注入上下文信息，让 Skill 了解工作流状态                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function buildStepPrompt(
  stepPrompt: string,
  context: WorkflowContext,
  stepIndex: number,
  totalSteps: number
): string {
  // 渲染用户定义的 prompt
  const renderedPrompt = renderPrompt(stepPrompt, context)

  // 构建上下文摘要
  const contextSummary = buildContextSummary(context, stepIndex, totalSteps)

  return `${contextSummary}\n\n---\n\n${renderedPrompt}`
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       构建上下文摘要                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
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

  // 添加输入参数
  if (Object.keys(context.input).length > 0) {
    lines.push(``, `### 输入参数`)
    for (const [key, value] of Object.entries(context.input)) {
      lines.push(`- ${key}: ${JSON.stringify(value)}`)
    }
  }

  // 添加前序步骤摘要
  if (context.steps.length > 0) {
    lines.push(``, `### 前序步骤结果`)
    for (const step of context.steps) {
      const statusIcon = step.status === 'completed' ? '✓' : '✗'
      lines.push(``, `**步骤 ${step.stepIndex + 1}** [${statusIcon}]`)
      // 截取输出摘要（最多 500 字符）
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
