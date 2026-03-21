/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                  ConversationPanel - 首页对话面板                        │
 * │                                                                        │
 * │  复用 MessageList + ChatInput，与 ExecutionPanel 渲染质量统一           │
 * │  保留 DecisionCard（决策确认）和 QuestionInput（结构化问答）            │
 * └──────────────────────────────────────────────────────────────────────────┘ */

import type { AgentMessage } from '../../types/message'
import type { WidgetState } from '../../types/message'
import type { PendingQuestion } from '../../hooks/useAgent'
import MessageList from '../shared/MessageList'
import ChatInput from '../shared/ChatInput'
import { QuestionInput } from '../shared/QuestionInput'
import { WidgetPanel } from '../widget/WidgetPanel'

/* ── 决策卡片类型 ── */
export interface DecisionAction {
  key: string
  label: string
  variant?: 'primary' | 'secondary' | 'ghost'
}

export interface DecisionPrompt {
  title: string
  description?: string
  actions: DecisionAction[]
}

/* ── 主面板 Props ── */
interface ConversationPanelProps {
  messages: AgentMessage[]
  onSend: (text: string, files?: File[]) => void
  onRegenerate?: (messageId: string) => void | Promise<void>
  onSelectVariant?: (messageId: string, variantIndex: number) => void
  onStop?: () => void
  pendingQuestion?: PendingQuestion | null
  respondToQuestion?: (questionId: string, answers: Record<string, string>) => void
  isThinking: boolean
  error: string | null
  regeneratingMessageId?: string | null
  onBack: () => void
  decisionPrompt?: DecisionPrompt | null
  onDecision?: (key: string) => void
  activeWidget?: WidgetState | null
  onCloseWidget?: () => void
  onWidgetInteraction?: (widgetId: string, data: unknown) => void
  onWidgetFallbackToText?: () => void
  onShowWidget?: (widgetId: string) => void
  onVisualizeMessage?: (content: string) => void
  streamingWidget?: WidgetState | null
  onExpandWidget?: (widgetId: string) => void
  assistantHint?: string
  widgetNotice?: {
    tone: 'warning' | 'neutral'
    message: string
  } | null
  mcpNotice?: {
    tone: 'warning' | 'neutral' | 'success'
    message: string
  } | null
}

export function ConversationPanel({
  messages,
  onSend,
  onRegenerate,
  onSelectVariant,
  onStop,
  pendingQuestion,
  respondToQuestion,
  isThinking,
  error,
  regeneratingMessageId,
  onBack,
  decisionPrompt,
  onDecision,
  activeWidget,
  onCloseWidget,
  onWidgetInteraction,
  onWidgetFallbackToText,
  onShowWidget,
  onVisualizeMessage,
  streamingWidget,
  onExpandWidget,
  assistantHint,
}: ConversationPanelProps) {
  const hasWidget = activeWidget != null

  return (
    <div className="min-h-screen flex">
      {/* ── Chat panel ── */}
      <div className={`flex flex-col ${hasWidget ? 'w-1/2' : 'w-full'} transition-all duration-300`}>
      {/* ── Header ── */}
      <div className="shrink-0 px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm">返回办公桌</span>
            </button>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-foreground">个人助理</p>
              {assistantHint && <p className="text-xs text-muted-foreground mt-0.5">{assistantHint}</p>}
            </div>
          </div>
          {isThinking && onStop && (
            <button
              type="button"
              onClick={onStop}
              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-sm transition-colors"
            >
              暂停当前工作
            </button>
          )}
        </div>
      </div>

      {/* ── 消息列表（复用 shared/MessageList） ── */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <MessageList
            messages={messages}
            isRunning={isThinking && !pendingQuestion}
            onRegenerate={onRegenerate}
            onSelectVariant={onSelectVariant}
            regeneratingMessageId={regeneratingMessageId}
            onShowWidget={onShowWidget}
            onVisualizeMessage={onVisualizeMessage}
            streamingWidget={streamingWidget}
            onExpandWidget={onExpandWidget}
            onWidgetInteraction={onWidgetInteraction}
            onWidgetFallbackToText={onWidgetFallbackToText}
          />
          {error && <p className="text-sm text-red-500 text-center mt-4">{error}</p>}

          {pendingQuestion && respondToQuestion && (
            <div className="mt-4">
              <QuestionInput pendingQuestion={pendingQuestion} onSubmit={respondToQuestion} />
            </div>
          )}

          {!pendingQuestion && decisionPrompt && (
            <div className="mt-4">
              <DecisionCard prompt={decisionPrompt} onDecision={onDecision || (() => {})} />
            </div>
          )}

        </div>
      </div>

      {/* ── 输入框（复用 shared/ChatInput） ── */}
      <div className="shrink-0 border-t border-border">
        <div className="max-w-3xl mx-auto">
          <ChatInput
            onSubmit={(q, files) => onSend(q, files)}
            onStop={onStop || (() => {})}
            isRunning={isThinking}
            placeholder="继续把要求交给个人助理..."
          />
        </div>
      </div>
      </div>

      {/* ── Widget panel (right side) ── */}
      {hasWidget && activeWidget && (
        <div className="w-1/2 transition-all duration-300">
          <WidgetPanel widget={activeWidget} onClose={onCloseWidget || (() => {})} onWidgetInteraction={onWidgetInteraction} onFallbackToText={onWidgetFallbackToText} />
        </div>
      )}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      DecisionCard - 决策确认卡片                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const VARIANT_CLASS: Record<string, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost: 'bg-muted text-foreground hover:bg-muted/80',
}

function DecisionCard({
  prompt,
  onDecision,
}: {
  prompt: DecisionPrompt
  onDecision: (key: string) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <p className="text-sm font-medium text-foreground">{prompt.title}</p>
      {prompt.description && (
        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{prompt.description}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {prompt.actions.map(action => (
          <button
            key={action.key}
            type="button"
            onClick={() => onDecision(action.key)}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${VARIANT_CLASS[action.variant || 'ghost']}`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}
