import MessageList from './MessageList'
import ChatInput from './ChatInput'
import { QuestionInput } from './QuestionInput'
import type { AgentMessage } from '../../types'
import type { PendingQuestion } from '../../hooks/useAgent'

interface ConversationWorkspaceViewProps {
  title?: string
  subtitle?: string
  messages: AgentMessage[]
  isRunning: boolean
  pendingQuestion?: PendingQuestion | null
  respondToQuestion?: (questionId: string, answers: Record<string, string>) => void
  onSubmit: (text: string, files?: File[]) => void
  onStop?: () => void
  placeholder?: string
  emptyText?: string
}

export function ConversationWorkspaceView({
  title,
  subtitle,
  messages,
  isRunning,
  pendingQuestion,
  respondToQuestion,
  onSubmit,
  onStop,
  placeholder = '继续对话...',
  emptyText = '暂无会话记录',
}: ConversationWorkspaceViewProps) {
  const hasHeader = Boolean(title || subtitle)

  return (
    <div className="flex h-full flex-col px-4 py-6">
      {hasHeader && (
        <div className="mb-4 shrink-0">
          {title && <h3 className="text-lg font-semibold text-foreground">{title}</h3>}
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length > 0 ? (
          <MessageList messages={messages} isRunning={isRunning && !pendingQuestion} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        )}
      </div>

      <div className="mt-4 shrink-0 border-t border-border pt-4">
        {pendingQuestion && respondToQuestion ? (
          <QuestionInput pendingQuestion={pendingQuestion} onSubmit={respondToQuestion} />
        ) : (
          <ChatInput
            onSubmit={onSubmit}
            onStop={onStop || (() => {})}
            isRunning={isRunning}
            placeholder={placeholder}
          />
        )}
      </div>
    </div>
  )
}
