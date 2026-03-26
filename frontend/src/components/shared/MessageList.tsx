import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentMessage, MessageMeta, WidgetState } from '../../types'
import { getLatestRegeneratableMessageId } from '../../lib/messageVariants'
import { ThinkingIndicator } from './ThinkingIndicator'
import { InlineWidget } from '../widget/InlineWidget'

interface MessageListProps {
  messages: AgentMessage[]
  isRunning?: boolean
  sessionKey?: string
  initialScrollOnMount?: 'bottom' | 'preserve'
  onRegenerate?: (messageId: string) => void | Promise<void>
  onSelectVariant?: (messageId: string, variantIndex: number) => void
  regeneratingMessageId?: string | null
  onShowWidget?: (widgetId: string) => void
  onVisualizeMessage?: (content: string) => void
  streamingWidget?: WidgetState | null
  onExpandWidget?: (widgetId: string) => void
  onWidgetInteraction?: (widgetId: string, data: unknown) => void
  onWidgetFallbackToText?: () => void
}

type TextBlock = {
  type: 'text'
  content: string
  isStreaming: boolean
  showActions?: boolean
  actionText?: string
  messageId?: string
  serverMessageId?: number | null
  meta?: MessageMeta | null
}
type ToolGroup = { type: 'tools'; tools: ToolEntry[]; isCompleted: boolean }
type UserBlock = {
  type: 'user'
  content: string
  messageId?: string
  serverMessageId?: number | null
  meta?: MessageMeta | null
}
type ErrorBlock = { type: 'error'; content: string }
type ThinkingStatusBlock = { type: 'thinking' }
type ThinkingContentBlock = { type: 'thinking_content'; content: string }
type WidgetAnchorBlock = { type: 'widget_anchor'; widgetId: string; title: string }
type InlineWidgetBlock = {
  type: 'inline_widget'
  widgetId: string
  title: string
  html: string
  status: 'loading' | 'ready' | 'error'
  errorMessage?: string
}

type ToolEntry = { name: string; input?: Record<string, unknown> }
type RenderBlock =
  | TextBlock
  | ToolGroup
  | UserBlock
  | ErrorBlock
  | ThinkingStatusBlock
  | ThinkingContentBlock
  | WidgetAnchorBlock
  | InlineWidgetBlock

type AssistantSegment =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }

const AUTO_FOLLOW_THRESHOLD_PX = 96
const THINKING_BLOCK_RE = /<(think|thinking)\b[^>]*>([\s\S]*?)<\/\1>/gi

const TOOL_DISPLAY_MAP: Record<string, string> = {
  Read: '读取文件',
  Write: '写入文件',
  Edit: '编辑文件',
  Bash: '执行命令',
  Glob: '搜索文件',
  Grep: '搜索内容',
  WebFetch: '获取网页',
  WebSearch: '网络搜索',
  mcp__laborany_web__search: '联网搜索',
  mcp__laborany_web__read_page: '读取网页',
  mcp__laborany_web__screenshot: '页面截图',
  mcp__laborany_web__get_site_info: '站点经验',
  mcp__laborany_web__save_site_pattern: '保存站点经验',
  mcp__laborany_web__save_global_note: '保存全局经验',
  mcp__laborany_web__verify: '事实核实',
  mcp__laborany_web__browser_open: '打开标签页',
  mcp__laborany_web__browser_navigate: '页面跳转',
  mcp__laborany_web__browser_eval: '页面提取',
  mcp__laborany_web__browser_click: '点击页面',
  mcp__laborany_web__browser_scroll: '滚动页面',
  mcp__laborany_web__browser_screenshot: '标签页截图',
  mcp__laborany_web__browser_close: '关闭标签页',
  AskUserQuestion: '询问用户',
  execution_result: '执行结果',
  '执行结果': '执行结果',
}

function normalizeToolName(name: string): string {
  if (name === 'execution_result') return '执行结果'
  if (name === '执行结果') return '执行结果'
  if (name.includes('鎵ц') || name.includes('缁撴灉')) return '执行结果'
  return name
}

function getToolDisplayName(name: string): string {
  return TOOL_DISPLAY_MAP[name] || name
}

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= AUTO_FOLLOW_THRESHOLD_PX
}

function findScrollContainer(element: HTMLElement | null): HTMLElement | null {
  let current = element?.parentElement || null

  while (current) {
    const style = window.getComputedStyle(current)
    const overflowY = style.overflowY
    const canScroll = (overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight
    if (canScroll) {
      return current
    }
    current = current.parentElement
  }

  return (document.scrollingElement as HTMLElement | null) || null
}

function sanitizeOutsideThinkingText(value: string): string {
  if (!value) return ''
  let cleaned = value
  cleaned = cleaned.replace(/<(?:think|thinking)\b[^>]*>[\s\S]*$/gi, '')
  cleaned = cleaned.replace(/<\/?(?:think|thinking)\b[^>]*>/gi, '')
  return cleaned.trim()
}

function splitAssistantContent(content: string): AssistantSegment[] {
  const segments: AssistantSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null = null
  THINKING_BLOCK_RE.lastIndex = 0

  while ((match = THINKING_BLOCK_RE.exec(content)) !== null) {
    const start = match.index
    const end = THINKING_BLOCK_RE.lastIndex

    const textBefore = sanitizeOutsideThinkingText(content.slice(lastIndex, start))
    if (textBefore) {
      segments.push({ type: 'text', content: textBefore })
    }

    const thinkingContent = (match[2] || '').trim()
    if (thinkingContent) {
      segments.push({ type: 'thinking', content: thinkingContent })
    }

    lastIndex = end
  }

  const trailingText = sanitizeOutsideThinkingText(content.slice(lastIndex))
  if (trailingText) {
    segments.push({ type: 'text', content: trailingText })
  }

  return segments
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard is unavailable')
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()

  try {
    const success = document.execCommand('copy')
    if (!success) {
      throw new Error('Copy command failed')
    }
  } finally {
    document.body.removeChild(textarea)
  }
}

export default function MessageList({
  messages,
  isRunning = false,
  sessionKey,
  initialScrollOnMount = 'bottom',
  onRegenerate,
  onSelectVariant,
  regeneratingMessageId,
  onShowWidget,
  onVisualizeMessage,
  streamingWidget,
  onExpandWidget,
  onWidgetInteraction,
  onWidgetFallbackToText,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLElement | null>(null)
  const shouldAutoFollowRef = useRef(true)
  const forceInitialScrollRef = useRef(initialScrollOnMount === 'bottom')
  const skipNextSmoothRef = useRef(false)
  const lastSessionKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const key = sessionKey || '__default__'
    if (lastSessionKeyRef.current === key) return

    lastSessionKeyRef.current = key
    shouldAutoFollowRef.current = initialScrollOnMount === 'bottom'
    forceInitialScrollRef.current = initialScrollOnMount === 'bottom'
    skipNextSmoothRef.current = false
    scrollContainerRef.current = null
  }, [sessionKey, initialScrollOnMount])

  useEffect(() => {
    if (messages.length > 0) return
    shouldAutoFollowRef.current = initialScrollOnMount === 'bottom'
    forceInitialScrollRef.current = initialScrollOnMount === 'bottom'
    skipNextSmoothRef.current = false
  }, [messages.length, initialScrollOnMount])

  useEffect(() => {
    const container = findScrollContainer(bottomRef.current)
    if (!container) return

    scrollContainerRef.current = container

    const handleScroll = () => {
      shouldAutoFollowRef.current = isNearBottom(container)
    }

    handleScroll()
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [sessionKey])

  useEffect(() => {
    if (!messages.length) return

    const container = scrollContainerRef.current || findScrollContainer(bottomRef.current)
    if (!container || !bottomRef.current) return

    scrollContainerRef.current = container
    if (!forceInitialScrollRef.current) return

    forceInitialScrollRef.current = false
    shouldAutoFollowRef.current = true
    skipNextSmoothRef.current = true

    const raf = window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
    })

    return () => window.cancelAnimationFrame(raf)
  }, [messages.length, sessionKey])

  useEffect(() => {
    if (!messages.length) return

    const container = scrollContainerRef.current || findScrollContainer(bottomRef.current)
    if (!container || !bottomRef.current) return

    scrollContainerRef.current = container
    if (!shouldAutoFollowRef.current) return

    if (skipNextSmoothRef.current) {
      skipNextSmoothRef.current = false
      return
    }

    const raf = window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: isRunning ? 'auto' : 'smooth', block: 'end' })
    })

    return () => window.cancelAnimationFrame(raf)
  }, [messages, isRunning])

  const blocks = useMemo(
    () => {
      const base = buildRenderBlocks(messages, isRunning)
      if (streamingWidget) {
        base.push({
          type: 'inline_widget',
          widgetId: streamingWidget.widgetId,
          title: streamingWidget.title,
          html: streamingWidget.html,
          status: streamingWidget.status,
          errorMessage: streamingWidget.errorMessage,
        })
      }
      return base
    },
    [messages, isRunning, streamingWidget],
  )
  const messageMap = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  )
  const latestRegeneratableMessageId = useMemo(
    () => (isRunning ? null : getLatestRegeneratableMessageId(messages)),
    [messages, isRunning],
  )

  if (messages.length === 0) return null

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => (
        <BlockRenderer
          key={index}
          block={block}
          message={block.type === 'user' || block.type === 'text'
            ? (block.messageId ? messageMap.get(block.messageId) : undefined)
            : undefined}
          latestRegeneratableMessageId={latestRegeneratableMessageId}
          onRegenerate={onRegenerate}
          onSelectVariant={onSelectVariant}
          regeneratingMessageId={regeneratingMessageId}
          onShowWidget={onShowWidget}
          onVisualizeMessage={onVisualizeMessage}
          onExpandWidget={onExpandWidget}
          onWidgetInteraction={onWidgetInteraction}
          onWidgetFallbackToText={onWidgetFallbackToText}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

function buildRenderBlocks(messages: AgentMessage[], isRunning: boolean): RenderBlock[] {
  const blocks: RenderBlock[] = []
  let pendingTools: ToolEntry[] = []

  const flushTools = (completed: boolean) => {
    if (pendingTools.length === 0) return
    blocks.push({ type: 'tools', tools: pendingTools, isCompleted: completed })
    pendingTools = []
  }

  for (const message of messages) {
    if (message.type === 'user') {
      flushTools(true)
      blocks.push({
        type: 'user',
        content: message.content,
        messageId: message.id,
        serverMessageId: message.serverMessageId ?? null,
        meta: message.meta || null,
      })
      continue
    }

    if (message.type === 'assistant' && message.widgetId) {
      flushTools(true)
      const widgetMeta = message.meta?.widget
      // New data with displayMode='inline' and full widget data → inline rendering
      if (widgetMeta?.displayMode === 'inline' && widgetMeta.html) {
        blocks.push({
          type: 'inline_widget',
          widgetId: message.widgetId,
          title: message.widgetTitle || 'Widget',
          html: widgetMeta.html,
          status: (widgetMeta.status as 'loading' | 'ready' | 'error') || 'ready',
        })
      } else {
        // Legacy data or panel mode → keep anchor card
        blocks.push({
          type: 'widget_anchor',
          widgetId: message.widgetId,
          title: message.widgetTitle || 'Widget',
        })
      }
      continue
    }

    if (message.type === 'assistant' && message.content) {
      flushTools(true)
      const segments = splitAssistantContent(message.content)
      const actionText = segments
        .filter((segment): segment is Extract<AssistantSegment, { type: 'text' }> => segment.type === 'text')
        .map((segment) => segment.content.trim())
        .filter(Boolean)
        .join('\n\n')
      const textBlockIndexes: number[] = []
      for (const segment of segments) {
        if (segment.type === 'text') {
          textBlockIndexes.push(blocks.length)
          blocks.push({
            type: 'text',
            content: segment.content,
            isStreaming: false,
            showActions: false,
            actionText,
            messageId: message.id,
            serverMessageId: message.serverMessageId ?? null,
            meta: message.meta || null,
          })
          continue
        }
        blocks.push({ type: 'thinking_content', content: segment.content })
      }
      const lastTextBlockIndex = textBlockIndexes[textBlockIndexes.length - 1]
      if (typeof lastTextBlockIndex === 'number' && blocks[lastTextBlockIndex]?.type === 'text') {
        ;(blocks[lastTextBlockIndex] as TextBlock).showActions = true
      }
      continue
    }

    if (message.type === 'tool') {
      pendingTools.push({
        name: normalizeToolName(message.toolName || 'Tool'),
        input: message.toolInput,
      })
      continue
    }

    if (message.type === 'error') {
      flushTools(true)
      blocks.push({ type: 'error', content: message.content })
    }
  }

  flushTools(!isRunning)

  if (isRunning) {
    for (let index = blocks.length - 1; index >= 0; index--) {
      if (blocks[index].type === 'text') {
        ;(blocks[index] as TextBlock).isStreaming = true
        break
      }
    }
  }

  if (isRunning) {
    const lastBlock = blocks[blocks.length - 1]
    const showThinking =
      !lastBlock
      || lastBlock.type === 'user'
      || lastBlock.type === 'tools'
      || lastBlock.type === 'thinking_content'
    if (showThinking) {
      blocks.push({ type: 'thinking' })
    }
  }

  return blocks
}

function BlockRenderer({
  block,
  message,
  latestRegeneratableMessageId,
  onRegenerate,
  onSelectVariant,
  regeneratingMessageId,
  onShowWidget,
  onVisualizeMessage,
  onExpandWidget,
  onWidgetInteraction,
  onWidgetFallbackToText,
}: {
  block: RenderBlock
  message?: AgentMessage
  latestRegeneratableMessageId: string | null
  onRegenerate?: (messageId: string) => void | Promise<void>
  onSelectVariant?: (messageId: string, variantIndex: number) => void
  regeneratingMessageId?: string | null
  onShowWidget?: (widgetId: string) => void
  onVisualizeMessage?: (content: string) => void
  onExpandWidget?: (widgetId: string) => void
  onWidgetInteraction?: (widgetId: string, data: unknown) => void
  onWidgetFallbackToText?: () => void
}) {
  switch (block.type) {
    case 'user':
      return <UserBubble content={block.content} meta={block.meta} />
    case 'text':
      return (
        <TextBlockView
          content={block.content}
          isStreaming={block.isStreaming}
          showActions={block.showActions ?? true}
          actionText={block.actionText}
          meta={block.meta}
          message={message}
          latestRegeneratableMessageId={latestRegeneratableMessageId}
          onRegenerate={onRegenerate}
          onSelectVariant={onSelectVariant}
          regeneratingMessageId={regeneratingMessageId}
          onVisualizeMessage={onVisualizeMessage}
        />
      )
    case 'tools':
      return <ToolGroupView tools={block.tools} isCompleted={block.isCompleted} />
    case 'error':
      return <ErrorBanner content={block.content} />
    case 'thinking':
      return <ThinkingIndicator variant="accent" />
    case 'thinking_content':
      return <ThinkingContentView content={block.content} />
    case 'widget_anchor':
      return <WidgetAnchorCard widgetId={block.widgetId} title={block.title} onClick={onShowWidget} />
    case 'inline_widget':
      return (
        <InlineWidget
          widgetId={block.widgetId}
          title={block.title}
          html={block.html}
          status={block.status}
          errorMessage={block.errorMessage}
          onExpand={onExpandWidget}
          onInteraction={onWidgetInteraction}
          onFallbackToText={onWidgetFallbackToText}
        />
      )
  }
}

function UserBubble({ content, meta }: { content: string; meta?: MessageMeta | null }) {
  const canCopy = meta?.capabilities?.canCopy ?? true

  return (
    <div className="group animate-in slide-in-from-bottom-1 flex justify-end duration-200 fade-in">
      <div className="max-w-[85%]">
        <div className="rounded-lg bg-primary px-4 py-3 text-primary-foreground">
          <div className="whitespace-pre-wrap">{content}</div>
        </div>
        <MessageActionBar text={content} canCopy={canCopy} latestRegeneratableMessageId={null} />
      </div>
    </div>
  )
}

function MarkdownView({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const isInline = !className
          return isInline ? (
            <code className="rounded bg-muted px-1 py-0.5 text-sm" {...props}>
              {children}
            </code>
          ) : (
            <code className="block overflow-x-auto rounded-lg bg-gray-900 p-3 text-sm text-gray-100" {...props}>
              {children}
            </code>
          )
        },
        pre({ children }) {
          return <pre className="m-0 bg-transparent p-0">{children}</pre>
        },
        a: LinkRenderer,
        table({ children }) {
          return (
            <div className="my-4 overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full divide-y divide-border text-sm">
                {children}
              </table>
            </div>
          )
        },
        thead({ children }) {
          return <thead className="bg-muted/50">{children}</thead>
        },
        th({ children }) {
          return (
            <th className="px-3 py-2 text-left text-xs font-semibold text-foreground">
              {children}
            </th>
          )
        },
        td({ children }) {
          return (
            <td className="px-3 py-2 text-foreground/90">
              {children}
            </td>
          )
        },
        tr({ children }) {
          return <tr className="border-b border-border/50 last:border-0">{children}</tr>
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

/* ─────────────────────────────────────────────────────────
 * useDebouncedValue
 * 流式渲染时对高频变化的值做 debounce，降低 markdown parse 频率
 * ───────────────────────────────────────────────────────── */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    if (delayMs <= 0) { setDebounced(value); return }
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

function TextBlockView({
  content,
  isStreaming,
  showActions,
  actionText,
  meta,
  message,
  latestRegeneratableMessageId,
  onRegenerate,
  onSelectVariant,
  regeneratingMessageId,
  onVisualizeMessage,
}: {
  content: string
  isStreaming: boolean
  showActions: boolean
  actionText?: string
  meta?: MessageMeta | null
  message?: AgentMessage
  latestRegeneratableMessageId: string | null
  onRegenerate?: (messageId: string) => void | Promise<void>
  onSelectVariant?: (messageId: string, variantIndex: number) => void
  regeneratingMessageId?: string | null
  onVisualizeMessage?: (content: string) => void
}) {
  // Fix P0-1: 降低 debounce 延迟，从 300ms → 50ms，减少卡顿感
  const debouncedContent = useDebouncedValue(content, isStreaming ? 50 : 0)
  const canCopy = meta?.capabilities?.canCopy ?? true

  if (isStreaming) {
    const canRenderStreamingMarkdown = debouncedContent.length <= 12000
    return (
      <div className="group animate-in slide-in-from-bottom-1 duration-150 fade-in">
        {canRenderStreamingMarkdown ? (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <MarkdownView content={debouncedContent} />
            <span className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-primary/70 align-middle" />
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/95">
            {content}
            <span className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-primary/70" />
          </div>
        )}
        {showActions && (
          <>
            <MessageActionBar
              text={actionText || content}
              canCopy={canCopy}
              message={message}
              latestRegeneratableMessageId={latestRegeneratableMessageId}
              onRegenerate={onRegenerate}
              regeneratingMessageId={regeneratingMessageId}
              onVisualizeMessage={onVisualizeMessage}
            />
            <VariantPager message={message} onSelectVariant={onSelectVariant} />
          </>
        )}
      </div>
    )
  }

  return (
    <div className="group animate-in slide-in-from-bottom-1 duration-200 fade-in">
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <MarkdownView content={content} />
      </div>
      {showActions && (
        <>
          <MessageActionBar
            text={actionText || content}
            canCopy={canCopy}
            message={message}
            latestRegeneratableMessageId={latestRegeneratableMessageId}
            onRegenerate={onRegenerate}
            regeneratingMessageId={regeneratingMessageId}
            onVisualizeMessage={onVisualizeMessage}
          />
          <VariantPager message={message} onSelectVariant={onSelectVariant} />
        </>
      )}
    </div>
  )
}

function MessageActionBar({
  text,
  canCopy,
  message,
  latestRegeneratableMessageId,
  onRegenerate,
  regeneratingMessageId,
  onVisualizeMessage,
}: {
  text: string
  canCopy: boolean
  message?: AgentMessage
  latestRegeneratableMessageId: string | null
  onRegenerate?: (messageId: string) => void | Promise<void>
  regeneratingMessageId?: string | null
  onVisualizeMessage?: (content: string) => void
}) {
  const canRegenerate = Boolean(
    message
    && onRegenerate
    && message.id === latestRegeneratableMessageId
    && message.meta?.capabilities?.canRegenerate,
  )
  const canVisualize = Boolean(onVisualizeMessage && text.trim())

  if (!text.trim() || (!canCopy && !canRegenerate && !canVisualize)) return null

  return (
    <div className="mt-1 flex justify-end gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
      {canVisualize && (
        <button
          type="button"
          onClick={() => onVisualizeMessage!(text)}
          title="可视化"
          aria-label="可视化"
          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span>可视化</span>
        </button>
      )}
      {canRegenerate && message && (
        <RegenerateButton
          messageId={message.id}
          isLoading={regeneratingMessageId === message.id}
          onRegenerate={onRegenerate!}
        />
      )}
      {canCopy && <CopyButton text={text} />}
    </div>
  )
}

function RegenerateButton({
  messageId,
  isLoading,
  onRegenerate,
}: {
  messageId: string
  isLoading: boolean
  onRegenerate: (messageId: string) => void | Promise<void>
}) {
  return (
    <button
      type="button"
      disabled={isLoading}
      onClick={() => { void onRegenerate(messageId) }}
      title={isLoading ? '重做中...' : '重做'}
      aria-label={isLoading ? '重做中...' : '重做'}
      className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
    >
      <svg className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      <span>{isLoading ? '重做中...' : '重做'}</span>
    </button>
  )
}

function CopyButton({ text }: { text: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleCopy = useCallback(async () => {
    try {
      await copyTextToClipboard(text)
      setStatus('copied')
    } catch {
      setStatus('failed')
    } finally {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = window.setTimeout(() => {
        setStatus('idle')
        timeoutRef.current = null
      }, 1800)
    }
  }, [text])

  const label = status === 'copied'
    ? '已复制'
    : status === 'failed'
      ? '复制失败'
      : '复制'

  return (
    <button
      type="button"
      onClick={() => { void handleCopy() }}
      title={label}
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
    >
      {status === 'copied' ? (
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      )}
      <span>{label}</span>
    </button>
  )
}

function VariantPager({
  message,
  onSelectVariant,
}: {
  message?: AgentMessage
  onSelectVariant?: (messageId: string, variantIndex: number) => void
}) {
  if (!message?.variants || message.variants.length <= 1 || !onSelectVariant) return null

  const activeIndex = message.activeVariantIndex ?? (message.variants.length - 1)
  const canPrev = activeIndex > 0
  const canNext = activeIndex < message.variants.length - 1

  return (
    <div className="mt-1 flex items-center justify-end gap-2 text-xs text-muted-foreground">
      <button
        type="button"
        disabled={!canPrev}
        onClick={() => onSelectVariant(message.id, activeIndex - 1)}
        aria-label="上一版本"
        className="inline-flex h-6 w-6 items-center justify-center rounded border border-border/60 bg-background/90 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span>{`${activeIndex + 1} / ${message.variants.length}`}</span>
      <button
        type="button"
        disabled={!canNext}
        onClick={() => onSelectVariant(message.id, activeIndex + 1)}
        aria-label="下一版本"
        className="inline-flex h-6 w-6 items-center justify-center rounded border border-border/60 bg-background/90 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}

function ThinkingContentView({ content }: { content: string }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="animate-in slide-in-from-bottom-1 min-w-0 overflow-hidden rounded-xl border border-border/40 bg-muted/25 duration-200 fade-in">
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
      >
        <svg
          className={`h-4 w-4 shrink-0 transition-transform ${!isExpanded ? '-rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        <span className="flex-1 text-left">
          {isExpanded ? '隐藏思考过程' : '显示思考过程'}
        </span>
      </button>

      {isExpanded && (
        <div className="prose prose-sm max-w-none border-t border-border/40 px-4 py-3 dark:prose-invert">
          <MarkdownView content={content} />
        </div>
      )}
    </div>
  )
}

function ToolGroupView({ tools, isCompleted }: { tools: ToolEntry[]; isCompleted: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="animate-in slide-in-from-bottom-1 min-w-0 overflow-hidden rounded-xl border border-border/40 bg-accent/20 duration-200 fade-in">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
      >
        {isCompleted ? (
          <svg className="h-4 w-4 shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <div className="flex h-4 w-4 shrink-0 items-center justify-center">
            <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          </div>
        )}

        <svg
          className={`h-4 w-4 shrink-0 transition-transform ${!isExpanded ? '-rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>

        <span className="flex-1 text-left">
          {isExpanded ? '隐藏步骤' : `${tools.length} 个步骤`}
        </span>
      </button>

      {isExpanded && (
        <div className="space-y-1 px-2 pb-2">
          {tools.map((tool, index) => (
            <ToolItem key={index} tool={tool} />
          ))}
        </div>
      )}
    </div>
  )
}

function ErrorBanner({ content }: { content: string }) {
  return (
    <div className="animate-in slide-in-from-bottom-1 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive duration-200 fade-in">
      <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{content}</span>
    </div>
  )
}

function ToolItem({ tool }: { tool: ToolEntry }) {
  const description = getToolDescription(tool.name, tool.input)
  const displayName = getToolDisplayName(tool.name)

  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
      <ToolIcon name={tool.name} />
      <span className="font-medium">{displayName}</span>
      {description && <span className="max-w-md truncate opacity-70">{description}</span>}
    </div>
  )
}

function LinkRenderer({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={href}
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      className="text-primary underline underline-offset-2 transition-colors hover:text-primary/80"
      {...props}
    >
      {children}
    </a>
  )
}

function ToolIcon({ name }: { name: string }) {
  const iconClass = 'h-4 w-4'

  if (['Read', 'Edit', 'Write'].includes(name)) {
    return (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    )
  }

  if (['Glob', 'Grep', 'WebSearch', 'mcp__laborany_web__search', 'mcp__laborany_web__get_site_info', 'mcp__laborany_web__save_global_note'].includes(name)) {
    return (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    )
  }

  if (name === 'Bash') {
    return (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    )
  }

  if (['WebFetch', 'mcp__laborany_web__read_page', 'mcp__laborany_web__screenshot', 'mcp__laborany_web__browser_open', 'mcp__laborany_web__browser_navigate', 'mcp__laborany_web__browser_screenshot'].includes(name)) {
    return (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
        />
      </svg>
    )
  }

  return (
    <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function getToolDescription(name: string, input?: Record<string, unknown>): string {
  if (!input) return ''

  switch (name) {
    case 'Bash': {
      const description = input.description as string
      if (description) return description
      const command = input.command as string
      if (command) return command.length > 60 ? `${command.slice(0, 60)}...` : command
      return ''
    }
    case 'Read': {
      const path = input.file_path as string
      return path ? `读取 ${path.split(/[/\\]/).pop() || path}` : ''
    }
    case 'Write': {
      const path = input.file_path as string
      return path ? `写入 ${path.split(/[/\\]/).pop() || path}` : ''
    }
    case 'Edit': {
      const path = input.file_path as string
      return path ? `编辑 ${path.split(/[/\\]/).pop() || path}` : ''
    }
    case 'Glob': {
      const pattern = input.pattern as string
      return pattern ? `搜索 ${pattern}` : ''
    }
    case 'Grep': {
      const pattern = input.pattern as string
      return pattern ? `查找 "${pattern}"` : ''
    }
    case 'WebSearch':
    case 'mcp__laborany_web__search': {
      const query = input.query as string
      return query ? `搜索 "${query}"` : ''
    }
    case 'WebFetch':
    case 'mcp__laborany_web__read_page':
    case 'mcp__laborany_web__screenshot':
    case 'mcp__laborany_web__browser_open':
    case 'mcp__laborany_web__browser_navigate':
    case 'mcp__laborany_web__browser_screenshot': {
      const url = input.url as string
      if (!url) {
        const filePath = input.file_path as string
        return filePath ? `输出 ${filePath.split(/[/\\]/).pop() || filePath}` : ''
      }
      try {
        return `获取 ${new URL(url).hostname}`
      } catch {
        return url.slice(0, 40)
      }
    }
    case 'mcp__laborany_web__get_site_info':
    case 'mcp__laborany_web__save_site_pattern': {
      const domain = input.domain as string
      return domain ? `站点 ${domain}` : ''
    }
    case 'mcp__laborany_web__save_global_note': {
      const category = input.category as string
      return category ? `分类 ${category}` : '全局经验'
    }
    case 'mcp__laborany_web__verify': {
      const claim = input.claim as string
      return claim ? `核实 "${claim}"` : ''
    }
    case 'mcp__laborany_web__browser_eval': {
      const expression = input.expression as string
      return expression ? `提取页面内容` : ''
    }
    case 'mcp__laborany_web__browser_click': {
      const selector = input.selector as string
      return selector ? `点击 ${selector}` : ''
    }
    case 'mcp__laborany_web__browser_scroll': {
      const direction = input.direction as string
      return direction ? `滚动 ${direction}` : '滚动页面'
    }
    case 'mcp__laborany_web__browser_close': {
      const targetId = input.target_id as string
      return targetId ? `关闭 ${targetId}` : '关闭标签页'
    }
    default:
      return ''
  }
}

function WidgetAnchorCard({ widgetId, title, onClick }: { widgetId: string; title: string; onClick?: (widgetId: string) => void }) {
  return (
    <div
      className="animate-in slide-in-from-bottom-1 fade-in duration-200 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-primary/10 transition-colors"
      data-widget-id={widgetId}
      onClick={() => onClick?.(widgetId)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(widgetId) }}
    >
      <svg className="w-5 h-5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{title}</p>
        <p className="text-xs text-muted-foreground">Interactive widget</p>
      </div>
      <svg className="w-4 h-4 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
      </svg>
    </div>
  )
}
