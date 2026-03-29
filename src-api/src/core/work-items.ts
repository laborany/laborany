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

  const marker = '## 老板原始需求'
  const index = text.indexOf(marker)
  if (index < 0) return ''

  const remainder = text.slice(index + marker.length).trim()
  if (!remainder) return ''
  return cleanupMarkdownMarkers(remainder)
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

function getPrimarySession(sessions: WorkSessionRow[], preferredId?: string): WorkSessionRow | null {
  if (!sessions.length) return null
  if (preferredId) {
    const matched = sessions.find((session) => session.id === preferredId)
    if (matched) return matched
  }
  return [...sessions].sort((a, b) => toSessionTimestampMs(a) - toSessionTimestampMs(b))[0] || null
}

function deriveWorkTitle(sessions: WorkSessionRow[]): string {
  const sorted = [...sessions].sort((a, b) => toSessionTimestampMs(b) - toSessionTimestampMs(a))

  for (const session of sorted) {
    const bossRequest = extractBossRequest(session.query)
    if (bossRequest) return bossRequest
  }

  for (const session of sorted) {
    const normalized = normalizeQuery(session.query)
    if (!normalized || isInternalHandoffText(normalized) || isControlInstructionText(normalized)) continue
    return cleanupMarkdownMarkers(normalized)
  }

  return cleanupMarkdownMarkers(normalizeQuery(sorted[0]?.query || '')) || '未命名工作'
}

function deriveWorkSummary(sessions: WorkSessionRow[]): string | null {
  const latest = getLatestSession(sessions)
  if (!latest) return null

  const bossRequest = extractBossRequest(latest.query)
  if (bossRequest) return bossRequest.slice(0, 200)

  const cleaned = cleanupMarkdownMarkers(normalizeQuery(latest.query || ''))
  return cleaned ? cleaned.slice(0, 200) : null
}

function deriveWorkPhase(sessions: WorkSessionRow[]): string {
  const latest = getLatestSession(sessions)
  if (!latest) return 'idle'

  const isAssistant = latest.skill_id === '__converse__'
  if (latest.status === 'waiting_input') {
    return isAssistant ? 'assistant_waiting' : 'employee_waiting'
  }
  if (latest.status === 'running') {
    return isAssistant ? 'assistant_running' : 'employee_running'
  }
  if (latest.status === 'completed') {
    return isAssistant ? 'assistant_completed' : 'employee_completed'
  }
  if (latest.status === 'failed') {
    return isAssistant ? 'assistant_failed' : 'employee_failed'
  }
  return isAssistant ? 'assistant_stopped' : 'employee_stopped'
}

function deriveWorkStatus(sessions: WorkSessionRow[]): string {
  const latest = getLatestSession(sessions)
  return latest?.status || 'running'
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
  const latest = getLatestSession(sessions)
  return latest?.skill_id || null
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

  const effectiveWorkId = (params.workId || existingSession?.work_id || params.sessionId).trim()
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
  const primarySession = getPrimarySession(sessions, workId)
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

  return { work, sessions }
}

export function findWorkIdBySessionId(sessionId: string): string | null {
  const row = dbHelper.get<{ work_id?: string | null }>(
    `SELECT work_id FROM sessions WHERE id = ?`,
    [sessionId],
  )
  const workId = (row?.work_id || '').trim()
  return workId || null
}
