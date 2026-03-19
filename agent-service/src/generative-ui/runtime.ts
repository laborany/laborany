import type { GenerativeWidgetSupport } from 'laborany-shared'

export interface ConverseWidgetRuntimePlan {
  mode: 'disabled' | 'cli'
  canRenderWidgets: boolean
  forceDirectMode: boolean
  reason: string | null
}

const ALWAYS_ENABLE_WIDGETS = process.env.LABORANY_ALWAYS_ENABLE_WIDGETS === 'true'

const WIDGET_EXPLANATION_PATTERN = /可视化|图解|图表|流程图|示意图|示意|画图|渲染|交互式|计算器|仪表盘|widget|diagram|flow.?chart|chart|visuali[sz]e|interactive|calculator|dashboard|svg/i
const EXPLANATION_INTENT_PATTERN = /解释|说明|讲解|展示|演示|理解|illustrate|walk me through|explain|teach/i
const VISUALIZE_REWRITE_PATTERN = /改为可视化组件解释|改成可视化组件解释|改为可视化解释|改成可视化解释|改成一个可视化组件|改为一个可视化组件/i
const NO_FILE_PATTERN = /不要写文件|不要创建文件|不要生成文件|不要落地文件|不要改代码|不要实现|不要打开浏览器|直接回答|直接解释|直接用|just explain|do not write files?|don't write files?/i
const EXECUTION_ARTIFACT_PATTERN = /修复|实现|重构|写代码|编程|代码|项目|仓库|repo|repository|脚本|命令|测试|提交|commit|build|fix|implement|refactor|create file|write file|edit file/i

export function shouldEnableWidgetRuntimeForQuery(query: string): boolean {
  const text = query.trim()
  if (!text) return false
  const asksForVisual = WIDGET_EXPLANATION_PATTERN.test(text)
  const asksToExplain = EXPLANATION_INTENT_PATTERN.test(text)
  const looksLikeBuildTask = EXECUTION_ARTIFACT_PATTERN.test(text)
  return asksForVisual && (asksToExplain || !looksLikeBuildTask)
}

export function shouldForceConverseWidgetDirectMode(query: string): boolean {
  const text = query.trim()
  if (!text) return false

  const asksForVisual = WIDGET_EXPLANATION_PATTERN.test(text)
  const asksToExplain = EXPLANATION_INTENT_PATTERN.test(text)
  const rewritesToVisual = VISUALIZE_REWRITE_PATTERN.test(text)
  const forbidsArtifacts = NO_FILE_PATTERN.test(text)
  const looksLikeBuildTask = EXECUTION_ARTIFACT_PATTERN.test(text)

  if (rewritesToVisual) return true
  if (asksForVisual && asksToExplain) return true
  if (asksForVisual && forbidsArtifacts) return true
  if (asksForVisual && !looksLikeBuildTask) return true

  return false
}

export function buildConverseWidgetDirectQuery(query: string): string {
  const trimmed = query.trim()
  if (!trimmed) return query

  return [
    '这是一个需要在当前对话里直接完成的可视化解释请求。',
    '最高优先级规则：',
    '- 不要推荐 skill，不要输出 LABORANY_ACTION，不要把任务路由到执行流。',
    '- 不要写文件，不要创建或打开 HTML 页面，不要使用 Bash/Write/Edit/Read/Glob/Grep/Skill 来替代 widget。',
    '- 不要去查找 guideline 文件；如果需要设计规范，只能调用当前会话提供的 MCP widget 工具。',
    '- 如果工具列表里存在 mcp__generative-ui__load_guidelines 和 mcp__generative-ui__show_widget，请直接先调前者，再调后者。',
    '- 如果最终无法渲染 widget，就直接给出简洁文本解释；不要向用户暴露“没有 show_widget 工具”之类的内部限制。',
    '',
    '原始用户请求：',
    trimmed,
  ].join('\n')
}

export function planConverseWidgetRuntime(
  query: string,
  widgetSupport: GenerativeWidgetSupport,
): ConverseWidgetRuntimePlan {
  if (!widgetSupport.enabled) {
    return {
      mode: 'disabled',
      canRenderWidgets: false,
      forceDirectMode: false,
      reason: widgetSupport.reasonMessage,
    }
  }

  const shouldEnable = ALWAYS_ENABLE_WIDGETS || shouldEnableWidgetRuntimeForQuery(query)
  const forceDirectMode = shouldForceConverseWidgetDirectMode(query)

  if (widgetSupport.runtime === 'claude_cli_mcp' && shouldEnable) {
    return {
      mode: 'cli',
      canRenderWidgets: true,
      forceDirectMode,
      reason: null,
    }
  }

  return {
    mode: 'disabled',
    canRenderWidgets: false,
    forceDirectMode: false,
    reason: 'Current turn does not explicitly ask for a visual explanation.',
  }
}
