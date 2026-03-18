export type QuestionContext = 'clarify' | 'schedule' | 'approval'

interface QuestionLike {
  id: string
  toolUseId: string
  questions: Array<{
    header: string
    question: string
  }>
  questionContext?: QuestionContext
  missingFields?: string[]
}

export interface QuestionResponseAnswer {
  header: string
  question: string
  answer: string
}

export interface QuestionResponsePayload {
  questionId: string
  toolUseId: string
  questionContext?: QuestionContext
  missingFields?: string[]
  answers: QuestionResponseAnswer[]
}

const SCHEDULE_CONTEXT_RE = /(定时|执行频率|执行时间|执行间隔|cron|时区|提醒|间隔)/i

export function normalizeQuestionContext(value: unknown): QuestionContext | undefined {
  if (value === 'clarify' || value === 'schedule' || value === 'approval') {
    return value
  }
  return undefined
}

export function inferQuestionContextFromQuestions(
  questions: Array<{ header?: string; question?: string }>,
): QuestionContext | undefined {
  const combined = questions
    .map((item) => `${item.header || ''} ${item.question || ''}`.trim())
    .filter(Boolean)
    .join('\n')

  if (!combined) return undefined
  if (SCHEDULE_CONTEXT_RE.test(combined)) return 'schedule'
  return undefined
}

export function buildQuestionResponsePayload(
  pendingQuestion: QuestionLike,
  answers: Record<string, string>,
): QuestionResponsePayload | null {
  const normalizedAnswers = pendingQuestion.questions
    .map((item) => {
      const answer = (answers[item.question] || '').trim()
      if (!answer) return null
      return {
        header: item.header || '问题',
        question: item.question,
        answer,
      }
    })
    .filter((item): item is QuestionResponseAnswer => Boolean(item))

  if (!normalizedAnswers.length) return null

  const questionContext = pendingQuestion.questionContext
    || inferQuestionContextFromQuestions(pendingQuestion.questions)

  return {
    questionId: pendingQuestion.id,
    toolUseId: pendingQuestion.toolUseId,
    questionContext,
    missingFields: pendingQuestion.missingFields?.filter(Boolean),
    answers: normalizedAnswers,
  }
}

export function buildQuestionResponseText(payload: QuestionResponsePayload): string {
  const header = payload.questionContext === 'schedule'
    ? '这是对上一轮定时任务补充问题的回答，请继续当前流程，不要重复询问已经回答过的项。'
    : '这是对上一轮补充问题的回答，请继续当前流程，不要重复询问已经回答过的项。'

  const lines = payload.answers.map((item) => `- ${item.header}: ${item.answer}`)
  return [header, ...lines].join('\n').trim()
}
