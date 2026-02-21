/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     多轮对话端点 - Converse Router                      ║
 * ║                                                                        ║
 * ║  职责：与用户多轮对话，理解任务 → 匹配能力 → 发出决策                   ║
 * ║  设计：复用 executeAgent（Claude Code CLI），统一执行链路               ║
 * ║  关键：只负责「对话+决策」，不负责执行                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Router, Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { copyFile, mkdir } from 'fs/promises'
import { existsSync, readdirSync } from 'fs'
import { basename, dirname, extname, join } from 'path'
import { executeAgent } from '../agent-executor.js'
import { buildConverseSystemPrompt } from '../converse-prompt.js'
import { memoryInjector } from '../memory/io.js'
import { loadCatalog } from '../catalog.js'
import { DATA_DIR } from '../paths.js'
import type { Skill } from 'laborany-shared'

const router = Router()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     SSE 工具函数                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function sseWrite(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

const FILE_ID_PATTERN = /\[(?:LABORANY_FILE_IDS|已上传文件 ID|Uploaded file IDs?)\s*:\s*([^\]]+)\]/gi

function getUploadsDir(): string {
  return join(dirname(DATA_DIR), 'uploads')
}

function resolveUploadedFileId(fileId: string): string | null {
  const uploadsDir = getUploadsDir()
  if (!existsSync(uploadsDir)) return null
  const files = readdirSync(uploadsDir)
  const matched = files.find((fileName) => fileName.startsWith(fileId))
  return matched ? join(uploadsDir, matched) : null
}

function sanitizeFileName(fileName: string): string {
  const normalized = (fileName || '').replace(/\\/g, '/').split('/').pop()?.trim() || ''
  const safe = normalized.replace(/[<>:"|?*\x00-\x1f]/g, '_')
  return safe || `upload-${Date.now()}`
}

function ensureUniqueTaskFileName(taskDir: string, preferredName: string): string {
  const safeName = sanitizeFileName(preferredName)
  const extension = extname(safeName)
  const baseName = safeName.slice(0, safeName.length - extension.length) || 'upload'

  let counter = 0
  while (true) {
    const suffix = counter === 0 ? '' : `-${counter}`
    const candidateName = `${baseName}${suffix}${extension}`
    if (!existsSync(join(taskDir, candidateName))) {
      return candidateName
    }
    counter += 1
  }
}

function extractFileIdsFromQuery(rawQuery: string): { query: string; fileIds: string[] } {
  const fileIds = new Set<string>()
  const matches = [...rawQuery.matchAll(FILE_ID_PATTERN)]
  for (const match of matches) {
    const ids = (match[1] || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    ids.forEach(id => fileIds.add(id))
  }

  const query = rawQuery.replace(FILE_ID_PATTERN, '').trim()
  return { query, fileIds: Array.from(fileIds) }
}

async function hydrateUploadsToTaskDir(fileIds: string[], taskDir: string): Promise<string[]> {
  if (fileIds.length === 0) return []

  const copiedFiles: string[] = []
  await mkdir(taskDir, { recursive: true })
  for (const fileId of fileIds) {
    const sourcePath = resolveUploadedFileId(fileId)
    if (!sourcePath) {
      console.warn(`[Converse] cannot resolve uploaded file id: ${fileId}`)
      continue
    }

    try {
      const sourceName = basename(sourcePath) || `${fileId}.bin`
      const targetName = ensureUniqueTaskFileName(taskDir, sourceName)
      await copyFile(sourcePath, join(taskDir, targetName))
      copiedFiles.push(targetName)
    } catch (error) {
      console.warn(`[Converse] failed to copy uploaded file ${fileId}:`, error)
    }
  }

  return copiedFiles
}

function buildConverseQuery(query: string, uploadedFiles: string[]): string {
  if (!uploadedFiles.length) return query
  const list = uploadedFiles.map((name) => `- ${name}`).join('\n')
  const baseQuery = query.trim() || '我上传了一些文件，请先读取文件再继续处理。'
  return `${baseQuery}\n\n[Uploaded files in current task directory]\n${list}\n\n这些文件都在当前任务工作目录下，请先读取这些文件，再处理用户请求。`
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     决策标记解析                                          │
 * │  从 agent 文本输出中提取 LABORANY_ACTION 决策                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */

const ACTION_PATTERN = /LABORANY_ACTION:\s*(\{[\s\S]*?\})/g
const ASK_USER_QUESTION_PATTERN = /AskU(?:ser|er)Question\(\s*([\s\S]*?)\s*\)/i

type ActionTargetType = 'skill'

type ConverseActionPayload =
  | {
      action: 'recommend_capability'
      targetType: ActionTargetType
      targetId: string
      query: string
      confidence?: number
      matchType?: 'exact' | 'candidate'
      reason?: string
    }
  | {
      action: 'execute_generic'
      query: string
      planSteps?: string[]
    }
  | {
      action: 'create_capability'
      mode: ActionTargetType
      seedQuery: string
    }
  | {
      action: 'setup_schedule'
      cronExpr: string
      tz?: string
      targetType?: ActionTargetType
      targetId?: string
      targetQuery: string
      name?: string
    }

interface ConverseQuestionOption {
  label: string
  description: string
}

interface ConverseQuestion {
  question: string
  header: string
  options: ConverseQuestionOption[]
  multiSelect: boolean
}

interface ConverseQuestionPayload {
  id: string
  toolUseId: string
  questions: ConverseQuestion[]
  missingFields?: string[]
  questionContext?: 'clarify' | 'schedule' | 'approval'
}

type ConversePhase =
  | 'clarify'
  | 'match'
  | 'choose_strategy'
  | 'plan_review'
  | 'schedule_wizard'
  | 'ready'

interface ConverseSessionState {
  phase: ConversePhase
  approvalRequired: boolean
  lastUpdatedAt: number
}

const sessionStateStore = new Map<string, ConverseSessionState>()

function setSessionState(
  sessionId: string,
  state: Pick<ConverseSessionState, 'phase' | 'approvalRequired'>,
): ConverseSessionState {
  const next: ConverseSessionState = {
    phase: state.phase,
    approvalRequired: state.approvalRequired,
    lastUpdatedAt: Date.now(),
  }
  sessionStateStore.set(sessionId, next)
  return next
}

function toQuestionPayload(
  questions: ConverseQuestion[],
  options?: Pick<ConverseQuestionPayload, 'missingFields' | 'questionContext'>,
): ConverseQuestionPayload {
  return {
    id: `question_${randomUUID()}`,
    toolUseId: `tool_${randomUUID()}`,
    questions,
    missingFields: options?.missingFields,
    questionContext: options?.questionContext,
  }
}

function isValidCronExpr(expr: string): boolean {
  const segments = expr.trim().split(/\s+/)
  return segments.length === 5
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asTargetType(value: unknown): ActionTargetType | null {
  return value === 'skill' ? value : null
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeQuestionPayload(
  toolInput: Record<string, unknown>,
  toolUseId?: string,
): ConverseQuestionPayload | null {
  const rawQuestions = Array.isArray(toolInput.questions)
    ? toolInput.questions
    : (() => {
      const singleQuestion = asString(toolInput.question)
      if (!singleQuestion) return null
      const rawOptions = Array.isArray(toolInput.options)
        ? toolInput.options
        : []
      return [{
        question: singleQuestion,
        header: asString(toolInput.header) || '问题',
        options: rawOptions,
        multiSelect: asBoolean(toolInput.multiSelect),
      }]
    })()

  if (!rawQuestions || !rawQuestions.length) return null

  const questions: ConverseQuestion[] = rawQuestions
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const obj = item as Record<string, unknown>
      const question = asString(obj.question)
      if (!question) return null

      const header = asString(obj.header) || '问题'
      const options = Array.isArray(obj.options)
        ? obj.options
          .map((opt) => {
            if (typeof opt === 'string') {
              const label = asString(opt)
              if (!label) return null
              return {
                label,
                description: '',
              }
            }
            if (!opt || typeof opt !== 'object') return null
            const optionObj = opt as Record<string, unknown>
            const label = asString(optionObj.label)
            if (!label) return null
            return {
              label,
              description: asString(optionObj.description),
            }
          })
          .filter((opt): opt is ConverseQuestionOption => Boolean(opt))
        : []

      return {
        question,
        header,
        options,
        multiSelect: asBoolean(obj.multiSelect),
      }
    })
    .filter((q): q is ConverseQuestion => Boolean(q))

  if (!questions.length) return null

  return {
    id: `question_${randomUUID()}`,
    toolUseId: toolUseId || `tool_${randomUUID()}`,
    questions,
    missingFields: Array.isArray(toolInput.missingFields)
      ? toolInput.missingFields.map(item => asString(item)).filter(Boolean)
      : undefined,
    questionContext: (() => {
      const ctx = asString(toolInput.questionContext)
      if (ctx === 'clarify' || ctx === 'schedule' || ctx === 'approval') {
        return ctx
      }
      return undefined
    })(),
  }
}

function parseQuestionCallFromText(text: string): ConverseQuestionPayload | null {
  const match = text.match(ASK_USER_QUESTION_PATTERN)
  if (!match?.[1]) return null
  try {
    const parsed = JSON.parse(match[1]) as Record<string, unknown>
    return normalizeQuestionPayload(parsed)
  } catch {
    return null
  }
}

function buildScheduleQuestion(
  partial: Partial<Extract<ConverseActionPayload, { action: 'setup_schedule' }>>,
  missing: string[],
): ConverseQuestionPayload {
  const questions: ConverseQuestion[] = []

  if (missing.includes('cronExpr')) {
    questions.push({
      header: '定时频率',
      question: '请选择执行频率（如需自定义可选“其他”并填写 cron）。',
      multiSelect: false,
      options: [
        { label: '每天 09:00', description: 'cron: 0 9 * * *' },
        { label: '每周一 09:00', description: 'cron: 0 9 * * 1' },
        { label: '每小时整点', description: 'cron: 0 * * * *' },
      ],
    })
  }

  if (missing.includes('tz')) {
    questions.push({
      header: '时区设置',
      question: '请选择任务执行时区。',
      multiSelect: false,
      options: [
        { label: 'Asia/Shanghai', description: '北京时间（UTC+8）' },
        { label: 'America/Los_Angeles', description: '太平洋时间（美国西海岸）' },
        { label: 'UTC', description: '协调世界时' },
      ],
    })
  }

  if (missing.includes('targetId')) {
    const expectedType = 'skill'
    questions.push({
      header: '执行目标 ID',
      question: `请提供要定时执行的 ${expectedType} ID。`,
      multiSelect: false,
      options: [],
    })
  }

  if (missing.includes('targetQuery')) {
    questions.push({
      header: '执行内容',
      question: '请明确定时任务每次执行时使用的任务描述。',
      multiSelect: false,
      options: [
        { label: '沿用当前需求', description: '直接复用这次对话需求作为 query' },
      ],
    })
  }

  return toQuestionPayload(questions, {
    questionContext: 'schedule',
    missingFields: missing,
  })
}

interface GuardResult {
  ok: boolean
  action?: ConverseActionPayload
  question?: ConverseQuestionPayload
  validationErrors?: string[]
  phase: ConversePhase
  approvalRequired: boolean
}

function guardAction(action: ConverseActionPayload): GuardResult {
  const catalog = loadCatalog()
  const findCapability = (type: ActionTargetType, id: string) =>
    catalog.some(item => item.type === type && item.id === id)

  if (action.action === 'recommend_capability') {
    if (!findCapability(action.targetType, action.targetId)) {
      const q = toQuestionPayload([
        {
          header: '能力校验',
          question: `未找到 ${action.targetType}「${action.targetId}」。请选择下一步。`,
          multiSelect: false,
          options: [
            { label: '用通用技能执行', description: '先完成一次任务' },
            { label: '创建新能力', description: '沉淀为 skill' },
            { label: '继续匹配', description: '让我重新匹配现有能力' },
          ],
        },
      ], { questionContext: 'clarify' })

      return {
        ok: false,
        question: q,
        validationErrors: [`能力不存在: ${action.targetType}/${action.targetId}`],
        phase: 'match',
        approvalRequired: false,
      }
    }

    return { ok: true, action, phase: 'match', approvalRequired: false }
  }

  if (action.action === 'setup_schedule') {
    const missing: string[] = []
    if (!action.cronExpr || !isValidCronExpr(action.cronExpr)) missing.push('cronExpr')
    if (!action.tz) missing.push('tz')
    if (!action.targetType) {
      action.targetType = 'skill'
    }
    if (!action.targetId) missing.push('targetId')
    if (!action.targetQuery) missing.push('targetQuery')

    if (!missing.length && action.targetType && action.targetId) {
      const exists = findCapability(action.targetType, action.targetId)
      if (!exists) {
        missing.push('targetId')
      }
    }

    if (missing.length) {
      return {
        ok: false,
        question: buildScheduleQuestion(action, missing),
        validationErrors: missing.map(field => `定时任务缺少或无效字段: ${field}`),
        phase: 'schedule_wizard',
        approvalRequired: false,
      }
    }

    return { ok: true, action, phase: 'schedule_wizard', approvalRequired: false }
  }

  if (action.action === 'execute_generic') {
    return { ok: true, action, phase: 'plan_review', approvalRequired: false }
  }

  if (action.action === 'create_capability') {
    return { ok: true, action, phase: 'choose_strategy', approvalRequired: false }
  }

  return { ok: true, action, phase: 'clarify', approvalRequired: false }
}

function normalizeAction(raw: Record<string, unknown>): ConverseActionPayload | null {
  const action = asString(raw.action)

  if (action === 'recommend_capability') {
    const targetType = asTargetType(raw.targetType)
    const targetId = asString(raw.targetId)
    const query = asString(raw.query)
    if (!targetType || !targetId || !query) return null
    const confidence = typeof raw.confidence === 'number' ? raw.confidence : undefined
    const matchType = raw.matchType === 'exact' || raw.matchType === 'candidate' ? raw.matchType : undefined
    return {
      action: 'recommend_capability',
      targetType,
      targetId,
      query,
      confidence,
      matchType,
      reason: asString(raw.reason) || undefined,
    }
  }

  if (action === 'execute_generic') {
    const query = asString(raw.query)
    if (!query) return null
    const planSteps = Array.isArray(raw.planSteps)
      ? raw.planSteps.map(item => asString(item)).filter(Boolean)
      : undefined
    return { action: 'execute_generic', query, planSteps }
  }

  if (action === 'create_capability') {
    const mode: ActionTargetType = 'skill'
    const seedQuery = asString(raw.seedQuery) || asString(raw.query)
    if (!seedQuery) return null
    return { action: 'create_capability', mode, seedQuery }
  }

  if (action === 'setup_schedule') {
    const cronExpr = asString(raw.cronExpr)
    const targetQuery = asString(raw.targetQuery) || asString(raw.query)
    if (!cronExpr || !targetQuery) return null
    return {
      action: 'setup_schedule',
      cronExpr,
      tz: asString(raw.tz) || undefined,
      targetType: 'skill',
      targetId: asString(raw.targetId) || undefined,
      targetQuery,
      name: asString(raw.name) || undefined,
    }
  }

  /* 兼容旧动作协议 */
  if (action === 'navigate_skill') {
    const targetId = asString(raw.skillId)
    const query = asString(raw.query)
    if (!targetId || !query) return null
    return {
      action: 'recommend_capability',
      targetType: 'skill',
      targetId,
      query,
      reason: '兼容旧动作: navigate_skill',
    }
  }

  // Legacy compatibility: historical clients may still emit `navigate_workflow`.
  // We normalize it to unified skill/capability routing semantics.
  if (action === 'navigate_workflow') {
    const targetId = asString(raw.workflowId)
    const query = asString(raw.query)
    if (!targetId || !query) return null
    return {
      action: 'recommend_capability',
      targetType: 'skill',
      targetId,
      query,
      reason: '兼容旧动作: navigate_workflow，按复合技能处理',
    }
  }

  if (action === 'create_skill') {
    const seedQuery = asString(raw.query)
    if (!seedQuery) return null
    return { action: 'create_capability', mode: 'skill', seedQuery }
  }

  if (action === 'setup_cron') {
    const cronExpr = asString(raw.cronSchedule)
    const targetQuery = asString(raw.cronTargetQuery) || asString(raw.query)
    if (!cronExpr || !targetQuery) return null
    return {
      action: 'setup_schedule',
      cronExpr,
      targetQuery,
    }
  }

  return null
}

function extractAction(text: string): ConverseActionPayload | null {
  let found: ConverseActionPayload | null = null
  for (const match of text.matchAll(ACTION_PATTERN)) {
    try {
      const raw = JSON.parse(match[1]) as Record<string, unknown>
      const normalized = normalizeAction(raw)
      if (normalized) {
        found = normalized
      }
    } catch {
    }
  }
  return found
}

function inferFallbackAction(query: string, fullText: string): ConverseActionPayload | null {
  const combined = `${query}\n${fullText}`

  const rejectCreate = /不想创建|不要创建|不创建|不需要创建|不要新技能|不用新技能|don't\s+create|do\s+not\s+create|no\s+new\s+skill/i.test(combined)
  const acceptCreate = /创建新技能|新建技能|创建一个技能|帮我创建|沉淀为技能|create\s+(a\s+)?new\s+skill|create_skill|create\s+capability/i.test(combined)
  const genericSignal = /直接做|直接执行|通用助手|generic/i.test(combined)

  if (acceptCreate && !rejectCreate) {
    return {
      action: 'create_capability',
      mode: 'skill',
      seedQuery: query || '请创建一个新技能来完成该任务',
    }
  }

  if (rejectCreate || genericSignal) {
    return {
      action: 'execute_generic',
      query: query || '请直接执行这个任务，不创建新技能',
      planSteps: [],
    }
  }

  return null
}

function detectDirectIntentAction(query: string): ConverseActionPayload | null {
  const text = query.trim()
  if (!text) return null

  const rejectCreate = /不想创建|不要创建|不创建|不需要创建|不要新技能|不用新技能|don't\s+create|do\s+not\s+create|no\s+new\s+skill/i.test(text)
  const acceptCreate = /创建新技能|新建技能|创建一个技能|帮我创建|沉淀为技能|create\s+(a\s+)?new\s+skill|create_skill|create\s+capability/i.test(text)
  const genericSignal = /直接做|直接执行|通用助手|generic/i.test(text)

  if (acceptCreate && !rejectCreate) {
    return {
      action: 'create_capability',
      mode: 'skill',
      seedQuery: text,
    }
  }

  if (rejectCreate || genericSignal) {
    return {
      action: 'execute_generic',
      query: text,
      planSteps: [],
    }
  }

  return null
}

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     POST /  —— 多轮对话主入口                           ║
 * ║                                                                        ║
 * ║  SSE 事件流：                                                           ║
 * ║    session → 返回 sessionId                                            ║
 * ║    text    → 流式文本                                                   ║
 * ║    action  → 决策动作（前端据此跳转或执行）                              ║
 * ║    done    → 对话轮次结束                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

router.post('/', async (req: Request, res: Response) => {
  const { sessionId: incomingId, messages: rawMessages } = req.body

  if (!rawMessages || !Array.isArray(rawMessages) || !rawMessages.length) {
    res.status(400).json({ error: '缺少 messages 参数' })
    return
  }

  /* ── SSE 初始化 ── */
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const sessionId = incomingId || randomUUID()
  sseWrite(res, 'session', { sessionId })
  const currentState = setSessionState(sessionId, {
    phase: 'clarify',
    approvalRequired: false,
  })
  sseWrite(res, 'state', currentState)

  /* ── 提取最新用户消息（CLI 通过 --continue 维护历史） ── */
  const latestMsg = rawMessages[rawMessages.length - 1]
  const rawQuery = typeof latestMsg?.content === 'string' ? latestMsg.content : ''
  const extracted = extractFileIdsFromQuery(rawQuery)
  const baseQuery = extracted.query || rawQuery.trim()

  const directAction = detectDirectIntentAction(baseQuery)
  if (directAction) {
    const guard = guardAction(directAction)
    const state = setSessionState(sessionId, {
      phase: guard.phase,
      approvalRequired: guard.approvalRequired,
    })
    sseWrite(res, 'state', {
      ...state,
      validationErrors: guard.validationErrors || [],
    })
    if (guard.ok && guard.action) {
      sseWrite(res, 'action', guard.action)
    } else if (guard.question) {
      sseWrite(res, 'question', guard.question)
    }
    sseWrite(res, 'done', {})
    res.end()
    return
  }

  /* ── 中止控制器（需在 try 外声明，finally 中清理） ── */
  const abortController = new AbortController()
  const onClientClose = () => {
    if (!abortController.signal.aborted) {
      abortController.abort()
    }
  }
  res.on('close', onClientClose)

  try {
    const taskDir = join(DATA_DIR, 'tasks', sessionId)
    const uploadedFiles = await hydrateUploadsToTaskDir(extracted.fileIds, taskDir)
    if (extracted.fileIds.length > 0 && uploadedFiles.length === 0) {
      sseWrite(res, 'warning', { content: '未能解析上传文件，请重新上传后重试。' })
    }
    const query = buildConverseQuery(baseQuery, uploadedFiles)
    /* ── 构建 converse skill ── */
    const memoryCtx = memoryInjector.buildContext({
      skillId: '__converse__',
      userQuery: query,
    })
    const systemPrompt = buildConverseSystemPrompt(memoryCtx)

    const skill = {
      meta: { id: '__converse__', name: '对话助手', description: '多轮对话', kind: 'skill' as const },
      systemPrompt,
      scriptsDir: '',
      tools: [],
    } as Skill

    /* ── 通过 CLI 执行对话 ── */
    let fullText = ''
    let hasPendingQuestion = false

    await executeAgent({
      skill,
      query,
      sessionId,
      signal: abortController.signal,
      onEvent: (event) => {
        if (event.type === 'tool_use') {
          if (/^AskU(?:ser|er)Question$/i.test(event.toolName || '')) {
            const questionPayload = normalizeQuestionPayload(
              event.toolInput || {},
              event.toolUseId,
            )
            if (questionPayload) {
              hasPendingQuestion = true
              sseWrite(res, 'question', questionPayload)
              abortController.abort()
              return
            }

            const fallbackQuestion = toQuestionPayload([
              {
                header: '信息补充',
                question: asString((event.toolInput || {}).question) || '请补充本轮缺失信息，以便我继续执行。',
                options: [],
                multiSelect: false,
              },
            ], { questionContext: 'clarify' })
            hasPendingQuestion = true
            sseWrite(res, 'question', fallbackQuestion)
            abortController.abort()
            return
          }

          sseWrite(res, 'tool_use', {
            toolName: event.toolName,
            toolInput: event.toolInput || {},
            toolUseId: event.toolUseId || null,
          })
          return
        }

        if (event.type === 'tool_result') {
          sseWrite(res, 'tool_result', {
            toolResult: event.toolResult || event.content || '',
            toolUseId: event.toolUseId || null,
          })
          return
        }

        if (event.type === 'text' && event.content) {
          fullText += event.content
          sseWrite(res, 'text', { content: event.content })
        }

        if (event.type === 'status' && event.content) {
          sseWrite(res, 'status', { content: event.content })
        }

        if (event.type === 'stopped') {
          if (hasPendingQuestion) {
            sseWrite(res, 'done', {})
          }
          return
        }

        if (event.type === 'done') {
          if (hasPendingQuestion) {
            sseWrite(res, 'done', {})
            return
          }

          const textQuestionPayload = parseQuestionCallFromText(fullText)
          if (textQuestionPayload) {
            hasPendingQuestion = true
            const state = setSessionState(sessionId, {
              phase: textQuestionPayload.questionContext === 'schedule' ? 'schedule_wizard' : 'clarify',
              approvalRequired: false,
            })
            sseWrite(res, 'state', state)
            sseWrite(res, 'question', textQuestionPayload)
            sseWrite(res, 'done', {})
            return
          }

          /* ── 从累积文本中提取决策标记 ── */
          const action = extractAction(fullText) || inferFallbackAction(query, fullText)
          if (action) {
            const guard = guardAction(action)

            const state = setSessionState(sessionId, {
              phase: guard.phase,
              approvalRequired: guard.approvalRequired,
            })
            sseWrite(res, 'state', {
              ...state,
              validationErrors: guard.validationErrors || [],
            })

            if (guard.ok && guard.action) {
              sseWrite(res, 'action', guard.action)
            } else if (guard.question) {
              hasPendingQuestion = true
              sseWrite(res, 'question', guard.question)
            } else if (guard.validationErrors?.length) {
              sseWrite(res, 'error', { message: guard.validationErrors.join('; ') })
            }
          }
          if (!action && !fullText.trim() && !hasPendingQuestion) {
            sseWrite(res, 'text', {
              content: '我还缺少一些关键信息，请再描述一次目标，或告诉我你希望先澄清哪一步。',
            })
          }
          sseWrite(res, 'done', {})
        }
        if (event.type === 'error') {
          if (hasPendingQuestion) {
            const msg = asString(event.content)
            if (!msg || /abort|aborted|中止|stopped/i.test(msg)) {
              return
            }
          }
          sseWrite(res, 'error', { message: event.content })
        }
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : '对话服务异常'
    console.error('[Converse] 错误:', err)
    sseWrite(res, 'error', { message: msg })
  } finally {
    res.off('close', onClientClose)
    if (!res.writableEnded) {
      res.end()
    }
  }
})

export const converseRouter = router
