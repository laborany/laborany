import type { GenerativeWidgetSupport } from 'laborany-shared'

export interface ConverseWidgetRuntimePlan {
  mode: 'disabled' | 'cli'
  canRenderWidgets: boolean
  reason: string | null
}

const WIDGET_EXPLANATION_PATTERN = /可视化|图解|图表|流程图|示意图|示意|画图|渲染|交互式|计算器|仪表盘|widget|diagram|flow.?chart|chart|visuali[sz]e|interactive|calculator|dashboard|svg/i
const EXPLANATION_INTENT_PATTERN = /解释|说明|讲解|展示|演示|理解|illustrate|walk me through|explain|teach/i
const EXECUTION_ARTIFACT_PATTERN = /修复|实现|重构|写代码|编程|代码|项目|仓库|repo|repository|脚本|命令|测试|提交|commit|build|fix|implement|refactor|create file|write file|edit file/i

export function shouldEnableWidgetRuntimeForQuery(query: string): boolean {
  const text = query.trim()
  if (!text) return false
  const asksForVisual = WIDGET_EXPLANATION_PATTERN.test(text)
  const asksToExplain = EXPLANATION_INTENT_PATTERN.test(text)
  const looksLikeBuildTask = EXECUTION_ARTIFACT_PATTERN.test(text)
  return asksForVisual && (asksToExplain || !looksLikeBuildTask)
}

export function planConverseWidgetRuntime(
  query: string,
  widgetSupport: GenerativeWidgetSupport,
): ConverseWidgetRuntimePlan {
  if (!widgetSupport.enabled) {
    return {
      mode: 'disabled',
      canRenderWidgets: false,
      reason: widgetSupport.reasonMessage,
    }
  }

  if (widgetSupport.runtime === 'claude_cli_mcp' && shouldEnableWidgetRuntimeForQuery(query)) {
    return {
      mode: 'cli',
      canRenderWidgets: true,
      reason: null,
    }
  }

  return {
    mode: 'disabled',
    canRenderWidgets: false,
    reason: 'Current turn does not explicitly ask for a visual explanation.',
  }
}
