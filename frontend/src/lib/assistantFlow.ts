import type { HomePhase } from '../components/home/ExecutingViews'

export function isAssistantExecutionPhase(phase: HomePhase): boolean {
  return (
    phase === 'executing'
    || phase === 'fallback_general'
    || phase === 'creating_proposal'
    || phase === 'creating_confirm'
    || phase === 'installing'
    || phase === 'routing'
  )
}

export function getAssistantPhaseHint(phase: HomePhase): string {
  switch (phase) {
    case 'analyzing':
      return '个人助理正在理解老板需求，并判断是否需要安排同事处理。'
    case 'candidate_found':
      return '个人助理已找到更适合负责这项工作的同事，等待老板确认。'
    case 'plan_review':
      return '个人助理先整理了一版执行计划，确认后就开始安排。'
    case 'fallback_general':
      return '这项工作先由个人助理直接处理，如有需要会再调用其他同事配合。'
    case 'creating_proposal':
    case 'creating_confirm':
      return 'HR 正在整理岗位需求，准备招聘或升级同事。'
    case 'installing':
      return '公司正在办理新同事入职，请稍候。'
    default:
      return ''
  }
}

