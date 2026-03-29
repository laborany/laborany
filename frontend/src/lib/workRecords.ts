import type { Session, SessionSource, WorkSummary } from '../types'

export interface WorkRecordItem {
  id: string
  workId?: string
  title: string
  primarySessionId: string
  createdAt: string
  status: string
  source?: SessionSource
  currentOwnerSkillId: string
  sessionCount: number
  stageSummary: string
  entryLabel: string
  workflowSummary?: string
  hasAssistantHandoff: boolean
  collaborationLabel?: string
  sessions: Session[]
}

function normalizeQuery(query: string): string {
  return (query || '').replace(/\s+/g, ' ').trim()
}

export function isControlInstructionText(query: string): boolean {
  const text = normalizeQuery(query)
  if (!text) return false

  return (
    text.includes('先不要安排给其他同事')
    || text.includes('先不要继续分派')
    || (
      text.includes('你先自己分析并直接给我一个结果')
      && text.includes('继续分派')
    )
  )
}

function toEntryLabel(source?: SessionSource): string {
  if (source === 'cron') return '日历安排'
  if (source === 'feishu') return '飞书安排'
  if (source === 'qq') return 'QQ 安排'
  if (source === 'converse') return '助理接单'
  return '老板发起'
}

function toStageSummary(work: WorkSummary, getSkillName: (id?: string) => string): string {
  const currentOwnerLabel = getSkillName(work.current_owner_skill_id || undefined)
  if (work.phase === 'assistant_running') return '个人助理正在跟进这项工作'
  if (work.phase === 'assistant_waiting') return '个人助理正在等待老板补充信息'
  if (work.phase === 'employee_running') return `${currentOwnerLabel}正在负责这项工作`
  if (work.phase === 'employee_waiting') return `${currentOwnerLabel}正在等待补充信息`
  if (work.phase === 'employee_completed') return `${currentOwnerLabel}已完成当前工作`
  if (work.phase === 'assistant_completed') return '个人助理已完成当前工作'
  if (work.phase === 'employee_failed') return `${currentOwnerLabel}处理这项工作时失败`
  if (work.phase === 'assistant_failed') return '个人助理处理这项工作时失败'
  return currentOwnerLabel ? `${currentOwnerLabel}正在负责这项工作` : '这项工作正在处理中'
}

export function buildWorkRecordFromWorkSummary(
  work: WorkSummary,
  sessions: Session[],
  getSkillName: (id?: string) => string,
): WorkRecordItem {
  const openSessionId = work.latest_session_id || work.primary_session_id || sessions[0]?.id || work.id

  return {
    id: work.id,
    workId: work.id,
    title: work.title || '未命名工作',
    primarySessionId: openSessionId,
    createdAt: work.created_at,
    status: work.status,
    source: work.source,
    currentOwnerSkillId: work.current_owner_skill_id || '',
    sessionCount: work.session_count || sessions.length || 1,
    stageSummary: toStageSummary(work, getSkillName),
    entryLabel: toEntryLabel(work.source),
    workflowSummary: work.summary || undefined,
    hasAssistantHandoff: sessions.some((session) => session.skill_id === '__converse__')
      && sessions.some((session) => session.skill_id !== '__converse__'),
    collaborationLabel: sessions.some((session) => session.skill_id === '__converse__')
      && sessions.some((session) => session.skill_id !== '__converse__')
      ? `个人助理 -> ${getSkillName(work.current_owner_skill_id || undefined)}`
      : undefined,
    sessions,
  }
}
