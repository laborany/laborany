import type { Session, SessionSource, WorkSummary } from '../types'

const WORK_RECORD_GROUP_WINDOW_MS = 20 * 60 * 1000

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

function parseUTCDateMs(dateStr: string): number {
  const value = (dateStr || '').trim()
  if (!value) return 0
  if (value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value)) {
    return Date.parse(value) || 0
  }
  return Date.parse(`${value}Z`) || 0
}

function normalizeQuery(query: string): string {
  return (query || '').replace(/\s+/g, ' ').trim()
}

function cleanupMarkdownMarkers(text: string): string {
  return text
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*]\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractBossRequest(query: string): string {
  const text = (query || '').trim()
  if (!text) return ''

  const bossRequestMarker = '## 老板原始需求'
  const bossIndex = text.indexOf(bossRequestMarker)
  if (bossIndex >= 0) {
    const remainder = text.slice(bossIndex + bossRequestMarker.length).trim()
    if (remainder) {
      const cleaned = cleanupMarkdownMarkers(remainder)
      if (cleaned) return cleaned
    }
  }

  return ''
}

function isInternalHandoffText(query: string): boolean {
  const text = (query || '').trim()
  if (!text) return false
  return text.includes('## 助理交接说明') || text.includes('## 助理已完成任务整理')
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

function getSessionWorkIdentity(session: Session): string {
  const bossRequest = extractBossRequest(session.query)
  if (bossRequest) return normalizeQuery(bossRequest)

  const normalized = normalizeQuery(session.query)
  if (!normalized) return ''
  if (isInternalHandoffText(normalized) || isControlInstructionText(normalized)) return ''
  return cleanupMarkdownMarkers(normalized)
}

function toWorkTitle(sessions: Session[]): string {
  const reversed = [...sessions].sort((a, b) => parseUTCDateMs(b.created_at) - parseUTCDateMs(a.created_at))

  for (const session of reversed) {
    const bossRequest = extractBossRequest(session.query)
    if (bossRequest) return bossRequest
  }

  for (const session of reversed) {
    const normalized = normalizeQuery(session.query)
    if (!normalized || isInternalHandoffText(normalized) || isControlInstructionText(normalized)) continue
    return cleanupMarkdownMarkers(normalized)
  }

  const fallback = normalizeQuery(reversed[0]?.query || '')
  return cleanupMarkdownMarkers(fallback) || '未命名工作'
}

function shouldMergeIntoRecord(recordSessions: Session[], candidate: Session): boolean {
  const latest = recordSessions[recordSessions.length - 1]
  if (!latest) return false

  const latestMs = parseUTCDateMs(latest.created_at)
  const candidateMs = parseUTCDateMs(candidate.created_at)
  if (!latestMs || !candidateMs) return false

  if (Math.abs(candidateMs - latestMs) > WORK_RECORD_GROUP_WINDOW_MS) return false

  const candidateIdentity = getSessionWorkIdentity(candidate)
  if (!candidateIdentity) return false

  const existingIdentities = new Set(
    recordSessions
      .map(getSessionWorkIdentity)
      .filter(Boolean),
  )

  if (existingIdentities.has(candidateIdentity)) return true

  for (const identity of existingIdentities) {
    if (identity.includes(candidateIdentity) || candidateIdentity.includes(identity)) {
      return true
    }
  }

  return false
}

function getLatestSession(sessions: Session[]): Session {
  return [...sessions].sort((a, b) => parseUTCDateMs(b.created_at) - parseUTCDateMs(a.created_at))[0] || sessions[0]
}

function getPrimarySession(sessions: Session[]): Session {
  const sorted = [...sessions].sort((a, b) => parseUTCDateMs(b.created_at) - parseUTCDateMs(a.created_at))
  return sorted.find((session) => session.skill_id !== '__converse__') || sorted[0]
}

function toEntryLabel(source?: SessionSource): string {
  if (source === 'cron') return '日历安排'
  if (source === 'feishu') return '飞书安排'
  if (source === 'qq') return 'QQ 安排'
  if (source === 'converse') return '助理接单'
  return '老板发起'
}

export function buildWorkRecordItems(
  sessions: Session[],
  getSkillName: (id?: string) => string,
): WorkRecordItem[] {
  const sorted = [...sessions].sort((a, b) => parseUTCDateMs(a.created_at) - parseUTCDateMs(b.created_at))
  const explicitGroups = new Map<string, Session[]>()
  const heuristicSessions: Session[] = []

  for (const session of sorted) {
    const workId = (session.work_id || '').trim()
    if (workId) {
      const current = explicitGroups.get(workId)
      if (current) {
        current.push(session)
      } else {
        explicitGroups.set(workId, [session])
      }
      continue
    }
    heuristicSessions.push(session)
  }

  const groups: Array<{ workId?: string; sessions: Session[] }> = []
  for (const [workId, workSessions] of explicitGroups.entries()) {
    groups.push({ workId, sessions: workSessions })
  }

  const heuristicGroups: Session[][] = []

  for (const session of heuristicSessions) {
    const current = heuristicGroups[heuristicGroups.length - 1]
    if (current && shouldMergeIntoRecord(current, session)) {
      current.push(session)
      continue
    }
    heuristicGroups.push([session])
  }

  heuristicGroups.forEach((item) => groups.push({ sessions: item }))

  return groups
    .map(({ workId, sessions: group }): WorkRecordItem => {
      const latest = getLatestSession(group)
      const primary = getPrimarySession(group)
      const assistantSession = group.find((session) => session.skill_id === '__converse__')
      const currentOwner = latest.skill_id === '__converse__'
        ? (assistantSession?.skill_id || latest.skill_id)
        : latest.skill_id
      const currentOwnerLabel = getSkillName(currentOwner)

      const nonAssistantSessions = group.filter((session) => session.skill_id !== '__converse__')
      const assigneeLabel = nonAssistantSessions.length > 0
        ? getSkillName(getLatestSession(nonAssistantSessions).skill_id)
        : ''
      const hasAssistantHandoff = Boolean(assistantSession && assigneeLabel)

      const stageSummary = hasAssistantHandoff
        ? `个人助理已安排${assigneeLabel}继续处理`
        : assistantSession
          ? '个人助理正在跟进这项工作'
          : `${currentOwnerLabel}正在负责这项工作`

      const workflowSummary = hasAssistantHandoff
        ? `这项工作先由个人助理整理，再交由${assigneeLabel}继续执行`
        : undefined

      const collaborationLabel = assistantSession && assigneeLabel && assigneeLabel !== '个人助理'
        ? `个人助理 -> ${assigneeLabel}`
        : undefined

      return {
        id: workId || primary.id,
        workId,
        title: toWorkTitle(group),
        primarySessionId: primary.id,
        createdAt: group[0]?.created_at || latest.created_at,
        status: latest.status,
        source: latest.source,
        currentOwnerSkillId: currentOwner,
        sessionCount: group.length,
        stageSummary,
        entryLabel: toEntryLabel(latest.source),
        workflowSummary,
        hasAssistantHandoff,
        collaborationLabel,
        sessions: [...group].sort((a, b) => parseUTCDateMs(b.created_at) - parseUTCDateMs(a.created_at)),
      }
    })
    .sort((a, b) => parseUTCDateMs(b.createdAt) - parseUTCDateMs(a.createdAt))
}

export function findWorkRecordBySessionId(
  sessions: Session[],
  sessionId: string,
  getSkillName: (id?: string) => string,
): WorkRecordItem | null {
  const records = buildWorkRecordItems(sessions, getSkillName)
  return records.find((record) => record.sessions.some((session) => session.id === sessionId)) || null
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
  return {
    id: work.id,
    workId: work.id,
    title: work.title || '未命名工作',
    primarySessionId: work.primary_session_id || sessions[0]?.id || work.latest_session_id || work.id,
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
