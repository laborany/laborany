import { randomUUID } from 'crypto'

const ASK_USER_QUESTION_PATTERN = /AskU(?:ser|er)Question\(\s*([\s\S]*?)\s*\)/i
const ASK_USER_QUESTION_CLEAN_RE = /AskU(?:ser|er)Question\(\s*[\s\S]*?\s*\)\s*/gi

export interface SkillQuestionOption {
  label: string
  description: string
}

export interface SkillQuestion {
  question: string
  header: string
  options: SkillQuestionOption[]
  multiSelect: boolean
}

export interface SkillQuestionPayload {
  id: string
  toolUseId: string
  questions: SkillQuestion[]
  missingFields?: string[]
  questionContext?: 'clarify' | 'schedule' | 'approval'
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function looksLikeWaitingInputMessage(content?: string | null): boolean {
  const text = (content || '').trim()
  if (!text) return false
  if (/有什么需要(调整|补充|修改)|是否需要我继续|要不要我继续|如果你需要.*我可以|还想看哪部分/.test(text)) {
    return false
  }
  return /(请(补充|提供|确认|选择|输入|告诉|说明|回复)|还缺少|需要补充|请再|执行时间|开始时间|结束时间|频率|时区|补充信息|告诉我|请给出|请填写|继续执行前)/.test(text)
}

export function buildSkillQuestionSummary(payload: SkillQuestionPayload): string {
  const lines: string[] = []
  for (const item of payload.questions) {
    const header = item.header?.trim() || '需要补充信息'
    const question = item.question?.trim() || ''
    lines.push(`${header}: ${question}`.trim())
  }
  return lines.filter(Boolean).join('\n')
}

export function normalizeSkillQuestionPayload(
  toolInput: Record<string, unknown>,
  toolUseId?: string,
): SkillQuestionPayload | null {
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

  const questions: SkillQuestion[] = rawQuestions
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const obj = item as Record<string, unknown>
      const question = asString(obj.question)
      if (!question) return null

      const header = asString(obj.header) || '问题'
      const options = Array.isArray(obj.options)
        ? obj.options
          .map((option) => {
            if (typeof option === 'string') {
              const label = asString(option)
              if (!label) return null
              return { label, description: '' }
            }
            if (!option || typeof option !== 'object') return null
            const optionObj = option as Record<string, unknown>
            const label = asString(optionObj.label)
            if (!label) return null
            return {
              label,
              description: asString(optionObj.description),
            }
          })
          .filter((option): option is SkillQuestionOption => Boolean(option))
        : []

      return {
        question,
        header,
        options,
        multiSelect: asBoolean(obj.multiSelect),
      }
    })
    .filter((item): item is SkillQuestion => Boolean(item))

  if (!questions.length) return null

  const rawContext = asString(toolInput.questionContext)
  const questionContext = rawContext === 'clarify' || rawContext === 'schedule' || rawContext === 'approval'
    ? rawContext
    : undefined

  return {
    id: `question_${randomUUID()}`,
    toolUseId: toolUseId || `tool_${randomUUID()}`,
    questions,
    missingFields: Array.isArray(toolInput.missingFields)
      ? toolInput.missingFields.map(item => asString(item)).filter(Boolean)
      : undefined,
    questionContext,
  }
}

export function parseQuestionCallFromText(text: string): SkillQuestionPayload | null {
  const match = text.match(ASK_USER_QUESTION_PATTERN)
  if (!match?.[1]) return null
  try {
    const parsed = JSON.parse(match[1]) as Record<string, unknown>
    return normalizeSkillQuestionPayload(parsed)
  } catch {
    return null
  }
}

export function stripQuestionCallMarkers(text: string): string {
  return text.replace(ASK_USER_QUESTION_CLEAN_RE, '').trim()
}
