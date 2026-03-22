import type { Session, SessionSource } from '../types'

const WORK_RECORD_GROUP_WINDOW_MS = 20 * 60 * 1000

export interface WorkRecordItem {
  id: string
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
  const groups: Session[][] = []

  for (const session of sorted) {
    const current = groups[groups.length - 1]
    if (current && shouldMergeIntoRecord(current, session)) {
      current.push(session)
      continue
    }
    groups.push([session])
  }

  return groups
    .map((group): WorkRecordItem => {
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
        id: primary.id,
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
