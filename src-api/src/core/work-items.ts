import { v4 as uuid } from 'uuid'
import { dbHelper } from './database.js'

export type WorkSource = 'desktop' | 'converse' | 'cron' | 'feishu' | 'qq'

export interface WorkRow {
  id: string
  user_id: string
  title: string
  summary: string | null
  status: string
  phase: string
  source: WorkSource
  current_owner_skill_id: string | null
  primary_session_id: string | null
  latest_session_id: string | null
  created_at: string
  updated_at: string
}

export interface WorkSessionRow {
  id: string
  user_id: string
  cost: number
  skill_id: string
  query: string
  status: string
  source?: string | null
  created_at: string
  updated_at?: string | null
  work_id?: string | null
}

export interface WorkListItem extends WorkRow {
  session_count: number
}

export interface WorkSessionLinks {
  assistant_session_id: string | null
  latest_employee_session_id: string | null
  entry_session_id: string | null
}

type WorkOwnerKind = 'assistant' | 'employee'

function normalizeQuery(query: string): string {
  return (query || '').replace(/\s+/g, ' ').trim()
}

function createWorkId(): string {
  return `work_${uuid()}`
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

  const marker = '## 老板原始需求'
  const index = text.indexOf(marker)
  if (index < 0) return ''

  const remainder = text.slice(index + marker.length).trim()
  if (!remainder) return ''

  const nextSectionIndex = remainder.search(/\n##\s+/)
  const sectionText = nextSectionIndex >= 0
    ? remainder.slice(0, nextSectionIndex).trim()
    : remainder

  return cleanupMarkdownMarkers(sectionText)
}

function extractInlineOriginalRequest(query: string): string {
  const text = (query || '').trim()
  if (!text) return ''

  const inlineMarkerMatch = text.match(/\n+用户原始需求[:：]\s*\n+/)
  if (!inlineMarkerMatch || inlineMarkerMatch.index === undefined) return ''

  const markerIndex = inlineMarkerMatch.index
  const before = text.slice(0, markerIndex).trim()
  const after = text.slice(markerIndex + inlineMarkerMatch[0].length).trim()

  if (before) return cleanupMarkdownMarkers(before)
  if (after) return cleanupMarkdownMarkers(after)
  return ''
}

function isInternalHandoffText(query: string): boolean {
  const text = (query || '').trim()
  if (!text) return false
  return text.includes('## 助理交接说明') || text.includes('## 助理已完成任务整理')
}

function isControlInstructionText(query: string): boolean {
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

function isAssistantSession(session: WorkSessionRow | null | undefined): boolean {
  return session?.skill_id === '__converse__'
}

function normalizeWorkStatus(status: string | null | undefined): string {
  if (status === 'running' || status === 'waiting_input' || status === 'completed' || status === 'failed') {
    return status
  }
  return 'stopped'
}

function isActiveWorkStatus(status: string | null | undefined): boolean {
  return normalizeWorkStatus(status) === 'running' || normalizeWorkStatus(status) === 'waiting_input'
}

function extractVisibleWorkText(query: string): string {
  const bossRequest = extractBossRequest(query)
  if (bossRequest) return bossRequest

  const inlineOriginalRequest = extractInlineOriginalRequest(query)
  if (inlineOriginalRequest) return inlineOriginalRequest

  const normalized = normalizeQuery(query)
  if (!normalized || isInternalHandoffText(normalized) || isControlInstructionText(normalized)) {
    return ''
  }

  return cleanupMarkdownMarkers(normalized)
}

function toSessionTimestampMs(session: WorkSessionRow): number {
  const value = (session.updated_at || session.created_at || '').trim()
  if (!value) return 0
  if (value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value)) {
    return Date.parse(value) || 0
  }
  return Date.parse(`${value.replace(' ', 'T')}Z`) || 0
}

function getLatestSession(sessions: WorkSessionRow[]): WorkSessionRow | null {
  if (!sessions.length) return null
  return [...sessions].sort((a, b) => toSessionTimestampMs(b) - toSessionTimestampMs(a))[0] || null
}

function findLatestSession(
  sessions: WorkSessionRow[],
  predicate: (session: WorkSessionRow) => boolean,
): WorkSessionRow | null {
  return [...sessions]
    .sort((a, b) => toSessionTimestampMs(b) - toSessionTimestampMs(a))
    .find(predicate) || null
}

function getPrimarySession(sessions: WorkSessionRow[], preferredId?: string): WorkSessionRow | null {
  if (!sessions.length) return null
  if (preferredId) {
    const matched = sessions.find((session) => session.id === preferredId)
    if (matched) return matched
  }
  return [...sessions].sort((a, b) => toSessionTimestampMs(a) - toSessionTimestampMs(b))[0] || null
}

function deriveWorkTitle(sessions: WorkSessionRow[]): string {
  const sorted = [...sessions].sort((a, b) => toSessionTimestampMs(a) - toSessionTimestampMs(b))

  for (const session of sorted) {
    const visibleText = extractVisibleWorkText(session.query)
    if (visibleText) return visibleText
  }

  const fallback = sorted[0]?.query || sessions[0]?.query || ''
  return cleanupMarkdownMarkers(normalizeQuery(fallback)) || '未命名工作'
}

function deriveWorkSummary(sessions: WorkSessionRow[]): string | null {
  const latestEmployeeInstruction = findLatestSession(
    sessions,
    (session) => !isAssistantSession(session) && Boolean(extractVisibleWorkText(session.query)),
  )
  if (latestEmployeeInstruction) {
    return extractVisibleWorkText(latestEmployeeInstruction.query).slice(0, 200)
  }

  const latestVisibleInstruction = findLatestSession(
    sessions,
    (session) => Boolean(extractVisibleWorkText(session.query)),
  )
  if (latestVisibleInstruction) {
    return extractVisibleWorkText(latestVisibleInstruction.query).slice(0, 200)
  }

  const fallbackTitle = deriveWorkTitle(sessions)
  return fallbackTitle ? fallbackTitle.slice(0, 200) : null
}

function deriveCurrentOwnerSession(sessions: WorkSessionRow[]): WorkSessionRow | null {
  const latestActiveEmployee = findLatestSession(
    sessions,
    (session) => !isAssistantSession(session) && isActiveWorkStatus(session.status),
  )
  if (latestActiveEmployee) return latestActiveEmployee

  const latestActiveAssistant = findLatestSession(
    sessions,
    (session) => isAssistantSession(session) && isActiveWorkStatus(session.status),
  )
  if (latestActiveAssistant) return latestActiveAssistant

  const latestEmployee = findLatestSession(sessions, (session) => !isAssistantSession(session))
  if (latestEmployee) return latestEmployee

  const latestAssistant = findLatestSession(sessions, (session) => isAssistantSession(session))
  if (latestAssistant) return latestAssistant

  return getLatestSession(sessions)
}

function deriveWorkOwnerKind(session: WorkSessionRow | null): WorkOwnerKind {
  return isAssistantSession(session) ? 'assistant' : 'employee'
}

function deriveWorkPhase(sessions: WorkSessionRow[]): string {
  const currentOwnerSession = deriveCurrentOwnerSession(sessions)
  if (!currentOwnerSession) return 'idle'

  const ownerKind = deriveWorkOwnerKind(currentOwnerSession)
  const normalizedStatus = normalizeWorkStatus(currentOwnerSession.status)

  if (normalizedStatus === 'waiting_input') {
    return ownerKind === 'assistant' ? 'assistant_waiting' : 'employee_waiting'
  }
  if (normalizedStatus === 'running') {
    return ownerKind === 'assistant' ? 'assistant_running' : 'employee_running'
  }
  if (normalizedStatus === 'completed') {
    return ownerKind === 'assistant' ? 'assistant_completed' : 'employee_completed'
  }
  if (normalizedStatus === 'failed') {
    return ownerKind === 'assistant' ? 'assistant_failed' : 'employee_failed'
  }
  return ownerKind === 'assistant' ? 'assistant_stopped' : 'employee_stopped'
}

function deriveWorkStatus(sessions: WorkSessionRow[]): string {
  return normalizeWorkStatus(deriveCurrentOwnerSession(sessions)?.status)
}

function deriveWorkSource(sessions: WorkSessionRow[]): WorkSource {
  const earliest = getPrimarySession(sessions)
  const source = (earliest?.source || '').trim()
  if (source === 'converse' || source === 'cron' || source === 'feishu' || source === 'qq') {
    return source
  }
  return 'desktop'
}

function deriveCurrentOwnerSkillId(sessions: WorkSessionRow[]): string | null {
  return deriveCurrentOwnerSession(sessions)?.skill_id || null
}

function deriveWorkSessionLinks(work: WorkRow | null, sessions: WorkSessionRow[]): WorkSessionLinks {
  const assistantSession = sessions.find((session) => session.skill_id === '__converse__') || null
  const employeeSessions = sessions.filter((session) => session.skill_id !== '__converse__')
  const latestEmployeeSession = employeeSessions.length > 0
    ? employeeSessions[employeeSessions.length - 1]
    : null
  const latestSession = getLatestSession(sessions)

  return {
    assistant_session_id: assistantSession?.id || null,
    latest_employee_session_id: latestEmployeeSession?.id || null,
    entry_session_id: latestEmployeeSession?.id
      || work?.latest_session_id
      || work?.primary_session_id
      || latestSession?.id
      || null,
  }
}

export function ensureWorkForSession(params: {
  sessionId: string
  userId?: string
  query: string
  source?: string
  workId?: string | null
}): string {
  const existingSession = dbHelper.get<{
    user_id?: string
    work_id?: string | null
  }>(
    `SELECT user_id, work_id FROM sessions WHERE id = ?`,
    [params.sessionId],
  )

  const requestedWorkId = (params.workId || '').trim()
  const existingWorkId = (existingSession?.work_id || '').trim()
  const effectiveWorkId = requestedWorkId || existingWorkId || createWorkId()
  const userId = (params.userId || existingSession?.user_id || 'default').trim() || 'default'
  const title = cleanupMarkdownMarkers(extractBossRequest(params.query) || normalizeQuery(params.query) || '未命名工作')

  const existingWork = dbHelper.get<{ id: string }>(
    `SELECT id FROM works WHERE id = ?`,
    [effectiveWorkId],
  )

  if (!existingWork) {
    dbHelper.run(
      `INSERT INTO works (
        id, user_id, title, summary, status, phase, source, current_owner_skill_id,
        primary_session_id, latest_session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        effectiveWorkId,
        userId,
        title || '未命名工作',
        title || null,
        'running',
        'assistant_running',
        ((params.source || 'desktop').trim() || 'desktop'),
        null,
        params.sessionId,
        params.sessionId,
      ],
    )
  }

  dbHelper.run(
    `UPDATE sessions
     SET work_id = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [effectiveWorkId, params.sessionId],
  )

  refreshWork(effectiveWorkId)
  return effectiveWorkId
}

export function refreshWork(workId: string): void {
  const sessions = dbHelper.query<WorkSessionRow>(
    `SELECT id, user_id, cost, skill_id, query, status, source, created_at, updated_at, work_id
     FROM sessions
     WHERE work_id = ?
     ORDER BY created_at ASC`,
    [workId],
  )

  if (!sessions.length) {
    dbHelper.run(`DELETE FROM works WHERE id = ?`, [workId])
    return
  }

  const title = deriveWorkTitle(sessions)
  const summary = deriveWorkSummary(sessions)
  const status = deriveWorkStatus(sessions)
  const phase = deriveWorkPhase(sessions)
  const source = deriveWorkSource(sessions)
  const currentOwnerSkillId = deriveCurrentOwnerSkillId(sessions)
  const primarySession = getPrimarySession(sessions)
  const latestSession = getLatestSession(sessions)

  const existing = dbHelper.get<{ id: string }>(
    `SELECT id FROM works WHERE id = ?`,
    [workId],
  )

  if (!existing) {
    dbHelper.run(
      `INSERT INTO works (
        id, user_id, title, summary, status, phase, source, current_owner_skill_id,
        primary_session_id, latest_session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        workId,
        sessions[0]?.user_id || 'default',
        title,
        summary,
        status,
        phase,
        source,
        currentOwnerSkillId,
        primarySession?.id || null,
        latestSession?.id || null,
      ],
    )
    return
  }

  dbHelper.run(
    `UPDATE works
     SET title = ?, summary = ?, status = ?, phase = ?, source = ?, current_owner_skill_id = ?,
         primary_session_id = ?, latest_session_id = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [
      title,
      summary,
      status,
      phase,
      source,
      currentOwnerSkillId,
      primarySession?.id || null,
      latestSession?.id || null,
      workId,
    ],
  )
}

export function refreshWorkBySessionId(sessionId: string): void {
  const record = dbHelper.get<{ work_id?: string | null }>(
    `SELECT work_id FROM sessions WHERE id = ?`,
    [sessionId],
  )
  const workId = (record?.work_id || '').trim()
  if (!workId) return
  refreshWork(workId)
}

export function listWorks(limit = 100): WorkListItem[] {
  return dbHelper.query<WorkListItem>(
    `SELECT
       works.*,
       COUNT(sessions.id) as session_count
     FROM works
     LEFT JOIN sessions ON sessions.work_id = works.id
     GROUP BY works.id
     ORDER BY works.updated_at DESC
     LIMIT ?`,
    [limit],
  )
}

export function getWorkDetail(workId: string): {
  work: WorkRow | null
  sessions: WorkSessionRow[]
  session_links: WorkSessionLinks
} {
  const work = dbHelper.get<WorkRow>(
    `SELECT * FROM works WHERE id = ?`,
    [workId],
  ) || null

  const sessions = dbHelper.query<WorkSessionRow>(
    `SELECT id, user_id, cost, skill_id, query, status, source, created_at, updated_at, work_id
     FROM sessions
     WHERE work_id = ?
     ORDER BY created_at ASC`,
    [workId],
  )

  return {
    work,
    sessions,
    session_links: deriveWorkSessionLinks(work, sessions),
  }
}

export function findWorkIdBySessionId(sessionId: string): string | null {
  const row = dbHelper.get<{ work_id?: string | null }>(
    `SELECT work_id FROM sessions WHERE id = ?`,
    [sessionId],
  )
  const workId = (row?.work_id || '').trim()
  return workId || null
}
