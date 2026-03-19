import {
  resolveExecuteGenerativeWidgetSupport,
  resolveGenerativeWidgetSupport,
  type GenerativeWidgetSupport,
} from '../../../shared/src/generative-widgets.ts'
import type { ModelProfile } from '../contexts/ModelProfileContext'

export type WidgetSupportTone = 'success' | 'warning' | 'neutral'

export interface WidgetSupportDisplay {
  label: string
  shortLabel: string
  tone: WidgetSupportTone
  detail: string
}

export function getGenerativeWidgetSupport(
  profile: ModelProfile | null | undefined,
): GenerativeWidgetSupport {
  return resolveGenerativeWidgetSupport({
    requested: true,
    interfaceType: profile?.interfaceType,
    model: profile?.model,
    baseUrl: profile?.baseUrl,
  })
}

export function supportsGenerativeWidgets(profile: ModelProfile | null | undefined): boolean {
  return getGenerativeWidgetSupport(profile).enabled
}

export function getExecuteGenerativeWidgetSupport(
  profile: ModelProfile | null | undefined,
): GenerativeWidgetSupport {
  return resolveExecuteGenerativeWidgetSupport({
    requested: true,
    interfaceType: profile?.interfaceType,
    model: profile?.model,
    baseUrl: profile?.baseUrl,
  })
}

export function supportsExecuteGenerativeWidgets(profile: ModelProfile | null | undefined): boolean {
  return getExecuteGenerativeWidgetSupport(profile).enabled
}

export function getConverseWidgetSupportDisplay(
  profile: ModelProfile | null | undefined,
): WidgetSupportDisplay {
  const support = getGenerativeWidgetSupport(profile)

  if (!support.enabled) {
    return {
      label: '对话: 文本模式',
      shortLabel: '文本',
      tone: 'neutral',
      detail: support.reasonMessage || '当前模型在首页对话按文本模式运行。',
    }
  }

  if (support.capability === 'full_stream') {
    return {
      label: '对话: 实时流式',
      shortLabel: '流式',
      tone: 'success',
      detail: '首页对话支持内联流式 widget 渲染。',
    }
  }

  return {
    label: '对话: 完成后显示',
    shortLabel: '完成后',
    tone: 'warning',
    detail: '首页对话支持内联 widget，但兼容 profile 往往只会在生成后集中提交。',
  }
}

export function getExecuteWidgetSupportDisplay(
  profile: ModelProfile | null | undefined,
): WidgetSupportDisplay {
  const support = getExecuteGenerativeWidgetSupport(profile)

  if (!support.enabled) {
    return {
      label: '执行: 文本模式',
      shortLabel: '文本',
      tone: support.reason === 'unsupported_surface' ? 'warning' : 'neutral',
      detail: support.reasonMessage || 'execute 页面当前按文本模式运行。',
    }
  }

  if (support.capability === 'full_stream') {
    return {
      label: '执行: 实时流式',
      shortLabel: '流式',
      tone: 'success',
      detail: 'execute 页面支持流式 widget 渲染。',
    }
  }

  return {
    label: '执行: 完成后显示',
    shortLabel: '完成后',
    tone: 'warning',
    detail: 'execute 页面支持 widget，但兼容 profile 通常会在生成完成后集中提交。',
  }
}

export function getProfileWidgetSupportDescription(
  profile: ModelProfile | null | undefined,
): string {
  const converse = getGenerativeWidgetSupport(profile)
  const execute = getExecuteGenerativeWidgetSupport(profile)

  if (converse.enabled && converse.capability === 'full_stream' && execute.enabled) {
    return '首页对话和 execute 页面都可使用内联流式 widget。'
  }

  if (converse.enabled && execute.enabled) {
    return '首页对话和 execute 页面都支持 widget；兼容 profile 通常会在生成完成后显示。'
  }

  if (converse.enabled) {
    return '首页对话支持内联 widget；当前 execute 页面按文本模式运行。'
  }

  return converse.reasonMessage || execute.reasonMessage || '当前 profile 暂按文本模式运行。'
}

export function getHomeWidgetRuntimeNotice(
  profile: ModelProfile | null | undefined,
): { tone: 'warning' | 'neutral'; message: string } | null {
  if (!profile) return null

  const converse = getGenerativeWidgetSupport(profile)
  const execute = getExecuteGenerativeWidgetSupport(profile)

  if (!converse.enabled) {
    return {
      tone: 'neutral',
      message: `当前模型 ${profile.name} 按文本模式运行。${converse.reasonMessage || ''}`.trim(),
    }
  }

  if (converse.capability === 'full_stream' && execute.enabled) {
    return null
  }

  if (converse.enabled && execute.enabled) {
    return null
  }

  return {
    tone: 'warning',
    message: `当前模型 ${profile.name} 支持首页对话内联可视化；当前 execute 页面仍以文本解释为主。`,
  }
}
