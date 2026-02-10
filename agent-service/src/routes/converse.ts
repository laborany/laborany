/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     多轮对话端点 - Converse Router                      ║
 * ║                                                                        ║
 * ║  职责：与用户多轮对话，理解任务 → 匹配能力 → 发出决策                   ║
 * ║  设计：复用 executeAgent（Claude Code CLI），统一执行链路               ║
 * ║  关键：只负责「对话+决策」，不负责执行                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Router, Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { executeAgent } from '../agent-executor.js'
import { buildConverseSystemPrompt } from './converse-prompt.js'
import { memoryInjector } from '../memory/injector.js'
import { loadCatalog } from '../catalog.js'
import type { Skill } from 'laborany-shared'

const router = Router()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     SSE 工具函数                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function sseWrite(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     决策标记解析                                          │
 * │  从 agent 文本输出中提取 LABORANY_ACTION 决策                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */

const ACTION_PATTERN = /LABORANY_ACTION:\s*(\{[\s\S]*?\})\s*$/
const ASK_USER_QUESTION_PATTERN = /AskU(?:ser|er)Question\(\s*([\s\S]*?)\s*\)/i

type ActionTargetType = 'skill' | 'workflow'

type ConverseActionPayload =
  | {
      action: 'recommend_capability'
      targetType: ActionTargetType
      targetId: string
      query: string
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
  return value === 'skill' || value === 'workflow' ? value : null
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

  if (missing.includes('targetType')) {
    questions.push({
      header: '执行目标类型',
      question: '这个定时任务应执行 skill 还是 workflow？',
      multiSelect: false,
      options: [
        { label: 'skill', description: '执行某个技能' },
        { label: 'workflow', description: '执行某个工作流' },
      ],
    })
  }

  if (missing.includes('targetId')) {
    const expectedType = partial.targetType || 'skill'
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
            { label: '创建新能力', description: '沉淀为 skill/workflow' },
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

    return { ok: true, action, phase: 'ready', approvalRequired: true }
  }

  if (action.action === 'setup_schedule') {
    const missing: string[] = []
    if (!action.cronExpr || !isValidCronExpr(action.cronExpr)) missing.push('cronExpr')
    if (!action.tz) missing.push('tz')
    if (!action.targetType) missing.push('targetType')
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

    return { ok: true, action, phase: 'ready', approvalRequired: true }
  }

  if (action.action === 'execute_generic') {
    return { ok: true, action, phase: 'plan_review', approvalRequired: true }
  }

  if (action.action === 'create_capability') {
    return { ok: true, action, phase: 'choose_strategy', approvalRequired: true }
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
    return {
      action: 'recommend_capability',
      targetType,
      targetId,
      query,
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
    const mode = asTargetType(raw.mode) || 'skill'
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
      targetType: asTargetType(raw.targetType) || undefined,
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

  if (action === 'navigate_workflow') {
    const targetId = asString(raw.workflowId)
    const query = asString(raw.query)
    if (!targetId || !query) return null
    return {
      action: 'recommend_capability',
      targetType: 'workflow',
      targetId,
      query,
      reason: '兼容旧动作: navigate_workflow',
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
  const match = text.match(ACTION_PATTERN)
  if (!match) return null
  try {
    const raw = JSON.parse(match[1]) as Record<string, unknown>
    return normalizeAction(raw)
  } catch {
    return null
  }
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
  const query = typeof latestMsg?.content === 'string' ? latestMsg.content : ''

  try {
    /* ── 构建 converse skill ── */
    const memoryCtx = memoryInjector.buildContext({
      skillId: '__converse__',
      userQuery: query,
    })
    const systemPrompt = buildConverseSystemPrompt(memoryCtx)

    const skill = {
      meta: { id: '__converse__', name: '对话助手', description: '多轮对话' },
      systemPrompt,
      scriptsDir: '',
      tools: [],
    } as Skill

    /* ── 通过 CLI 执行对话 ── */
    const abortController = new AbortController()
    const onClientClose = () => {
      if (!abortController.signal.aborted) {
        abortController.abort()
      }
    }
    res.on('close', onClientClose)
    let fullText = ''
    let hasPendingQuestion = false

    await executeAgent({
      skill,
      query,
      sessionId,
      signal: abortController.signal,
      timeoutMs: 2 * 60 * 1000,
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
          const action = extractAction(fullText)
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
