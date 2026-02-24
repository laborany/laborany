import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentMessage } from '../../types'
import { ThinkingIndicator } from './ThinkingIndicator'

interface MessageListProps {
  messages: AgentMessage[]
  isRunning?: boolean
  sessionKey?: string
  initialScrollOnMount?: 'bottom' | 'preserve'
}

type TextBlock = { type: 'text'; content: string; isStreaming: boolean }
type ToolGroup = { type: 'tools'; tools: ToolEntry[]; isCompleted: boolean }
type UserBlock = { type: 'user'; content: string }
type ErrorBlock = { type: 'error'; content: string }
type ThinkingStatusBlock = { type: 'thinking' }
type ThinkingContentBlock = { type: 'thinking_content'; content: string }

type ToolEntry = { name: string; input?: Record<string, unknown> }
type RenderBlock =
  | TextBlock
  | ToolGroup
  | UserBlock
  | ErrorBlock
  | ThinkingStatusBlock
  | ThinkingContentBlock

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

export default function MessageList({
  messages,
  isRunning = false,
  sessionKey,
  initialScrollOnMount = 'bottom',
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
    () => buildRenderBlocks(messages, isRunning),
    [messages, isRunning],
  )

  if (messages.length === 0) return null

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => (
        <BlockRenderer key={index} block={block} />
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
      blocks.push({ type: 'user', content: message.content })
      continue
    }

    if (message.type === 'assistant' && message.content) {
      flushTools(true)
      const segments = splitAssistantContent(message.content)
      for (const segment of segments) {
        if (segment.type === 'text') {
          blocks.push({ type: 'text', content: segment.content, isStreaming: false })
          continue
        }
        blocks.push({ type: 'thinking_content', content: segment.content })
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

function BlockRenderer({ block }: { block: RenderBlock }) {
  switch (block.type) {
    case 'user':
      return <UserBubble content={block.content} />
    case 'text':
      return <TextBlockView content={block.content} isStreaming={block.isStreaming} />
    case 'tools':
      return <ToolGroupView tools={block.tools} isCompleted={block.isCompleted} />
    case 'error':
      return <ErrorBanner content={block.content} />
    case 'thinking':
      return <ThinkingIndicator variant="accent" />
    case 'thinking_content':
      return <ThinkingContentView content={block.content} />
  }
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="animate-in slide-in-from-bottom-1 flex justify-end duration-200 fade-in">
      <div className="max-w-[85%] rounded-lg bg-primary px-4 py-3 text-primary-foreground">
        <div className="whitespace-pre-wrap">{content}</div>
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

function TextBlockView({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  // 流式时 300ms debounce，markdown parse 频率从 ~60fps 降到 ~3fps
  const debouncedContent = useDebouncedValue(content, isStreaming ? 300 : 0)

  if (isStreaming) {
    const canRenderStreamingMarkdown = debouncedContent.length <= 12000
    return (
      <div className="animate-in slide-in-from-bottom-1 duration-150 fade-in">
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
      </div>
    )
  }

  return (
    <div className="animate-in slide-in-from-bottom-1 duration-200 fade-in">
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <MarkdownView content={content} />
      </div>
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
  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!href) return
      if (href.startsWith('http://') || href.startsWith('https://')) {
        event.preventDefault()
        window.open(href, '_blank', 'noopener,noreferrer')
      }
    },
    [href],
  )

  return (
    <a
      href={href}
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      onClick={handleClick}
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

  if (['Glob', 'Grep', 'WebSearch'].includes(name)) {
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

  if (name === 'WebFetch') {
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
    case 'WebSearch': {
      const query = input.query as string
      return query ? `搜索 "${query}"` : ''
    }
    case 'WebFetch': {
      const url = input.url as string
      if (!url) return ''
      try {
        return `获取 ${new URL(url).hostname}`
      } catch {
        return url.slice(0, 40)
      }
    }
    default:
      return ''
  }
}
