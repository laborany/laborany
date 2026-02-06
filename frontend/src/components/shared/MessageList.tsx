/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         消息列表组件                                       ║
 * ║                                                                          ║
 * ║  渲染对话消息流：助手文本完整 Markdown 渲染 + 工具调用紧凑折叠                ║
 * ║  设计理念：文本和工具是平级的独立渲染块，不再互相嵌套                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useEffect, useRef, useState, useCallback, AnchorHTMLAttributes } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentMessage } from '../../types'

interface MessageListProps {
  messages: AgentMessage[]
  isRunning?: boolean
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     渲染块类型定义                                        │
 * │                                                                          │
 * │  核心设计：每种渲染块只做一件事                                            │
 * │  文本是文本，工具是工具，绝不混淆                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */

type TextBlock  = { type: 'text';  content: string; isStreaming: boolean }
type ToolGroup  = { type: 'tools'; tools: ToolEntry[]; isCompleted: boolean }
type UserBlock  = { type: 'user';  content: string }
type ErrorBlock = { type: 'error'; content: string }

type ToolEntry = { name: string; input?: Record<string, unknown> }

type RenderBlock = TextBlock | ToolGroup | UserBlock | ErrorBlock

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           入口组件                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export default function MessageList({ messages, isRunning = false }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) return null

  const blocks = buildRenderBlocks(messages, isRunning)

  return (
    <div className="space-y-4">
      {blocks.map((block, i) => (
        <BlockRenderer key={i} block={block} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     消息 → 渲染块 转换                                    │
 * │                                                                          │
 * │  设计原则：                                                               │
 * │  1. 每个助手文本独立成块，保留完整内容                                      │
 * │  2. 连续工具调用自然合并为一组                                              │
 * │  3. 无特殊分支 —— streaming / empty / tool-only 自然处理                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function buildRenderBlocks(messages: AgentMessage[], isRunning: boolean): RenderBlock[] {
  const blocks: RenderBlock[] = []
  let pendingTools: ToolEntry[] = []

  const flushTools = (completed: boolean) => {
    if (pendingTools.length === 0) return
    blocks.push({ type: 'tools', tools: pendingTools, isCompleted: completed })
    pendingTools = []
  }

  for (const msg of messages) {
    if (msg.type === 'user') {
      flushTools(true)
      blocks.push({ type: 'user', content: msg.content })
    } else if (msg.type === 'assistant' && msg.content) {
      flushTools(true)
      blocks.push({ type: 'text', content: msg.content, isStreaming: false })
    } else if (msg.type === 'tool') {
      pendingTools.push({ name: msg.toolName || 'Tool', input: msg.toolInput })
    } else if (msg.type === 'error') {
      flushTools(true)
      blocks.push({ type: 'error', content: msg.content })
    }
  }

  // 尾部工具：运行中标记未完成，否则标记已完成
  flushTools(!isRunning)

  // 标记最后一个文本块为 streaming
  if (isRunning) {
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].type === 'text') {
        (blocks[i] as TextBlock).isStreaming = true
        break
      }
    }
  }

  return blocks
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     渲染块分发器                                          │
 * │  用 Map 映射替代 if/else，让数据结构决定行为                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function BlockRenderer({ block }: { block: RenderBlock }) {
  switch (block.type) {
    case 'user':  return <UserBubble content={block.content} />
    case 'text':  return <TextBlockView content={block.content} isStreaming={block.isStreaming} />
    case 'tools': return <ToolGroupView tools={block.tools} isCompleted={block.isCompleted} />
    case 'error': return <ErrorBanner content={block.content} />
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     用户消息气泡                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="max-w-[85%] rounded-lg bg-primary px-4 py-3 text-primary-foreground">
        <div className="whitespace-pre-wrap">{content}</div>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     助手文本 —— 完整 Markdown 渲染                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function TextBlockView({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ className, children, ...props }) {
              const isInline = !className
              return isInline ? (
                <code className="px-1 py-0.5 bg-muted rounded text-sm" {...props}>
                  {children}
                </code>
              ) : (
                <code className="block p-3 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm" {...props}>
                  {children}
                </code>
              )
            },
            pre({ children }) {
              return <pre className="bg-transparent p-0 m-0">{children}</pre>
            },
            a: LinkRenderer,
          }}
        >
          {content}
        </ReactMarkdown>
        {isStreaming && (
          <span className="inline-block w-2 h-4 ml-0.5 bg-primary/70 animate-pulse rounded-sm" />
        )}
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     工具组 —— 可折叠的紧凑列表                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ToolGroupView({ tools, isCompleted }: { tools: ToolEntry[]; isCompleted: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border/40 bg-accent/20 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
      >
        {/* 完成状态 */}
        {isCompleted ? (
          <svg className="w-4 h-4 shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <div className="flex w-4 h-4 shrink-0 items-center justify-center">
            <div className="w-2 h-2 animate-pulse rounded-full bg-primary" />
          </div>
        )}
        {/* 折叠箭头 */}
        <svg
          className={`w-4 h-4 shrink-0 transition-transform ${!isExpanded ? '-rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        <span className="flex-1 text-left">
          {isExpanded ? '隐藏步骤' : `${tools.length} 个步骤`}
        </span>
      </button>

      {isExpanded && (
        <div className="px-2 pb-2 space-y-1">
          {tools.map((tool, i) => (
            <ToolItem key={i} tool={tool} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     错误提示                                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ErrorBanner({ content }: { content: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive animate-in fade-in slide-in-from-bottom-1 duration-200">
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{content}</span>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     单个工具条目                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ToolItem({ tool }: { tool: ToolEntry }) {
  const description = getToolDescription(tool.name, tool.input)

  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
      <ToolIcon name={tool.name} />
      <span className="font-medium">{tool.name}</span>
      {description && (
        <span className="truncate opacity-70 max-w-md">{description}</span>
      )}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     链接渲染器                                            │
 * │  外部链接在新窗口打开，内部链接正常跳转                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function LinkRenderer({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!href) return

    if (href.startsWith('http://') || href.startsWith('https://')) {
      e.preventDefault()
      window.open(href, '_blank', 'noopener,noreferrer')
    }
  }, [href])

  return (
    <a
      href={href}
      onClick={handleClick}
      className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
      {...props}
    >
      {children}
    </a>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     工具图标映射                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ToolIcon({ name }: { name: string }) {
  const iconClass = "w-4 h-4"

  if (['Read', 'Edit', 'Write'].includes(name)) {
    return (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  }

  if (['Glob', 'Grep'].includes(name)) {
    return (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    )
  }

  if (name === 'Bash') {
    return (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    )
  }

  if (['WebSearch', 'WebFetch'].includes(name)) {
    return (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    )
  }

  return (
    <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     工具调用友好描述                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getToolDescription(name: string, input?: Record<string, unknown>): string {
  if (!input) return ''

  switch (name) {
    case 'Bash': {
      const desc = input.description as string
      if (desc) return desc
      const cmd = input.command as string
      if (cmd) return cmd.length > 60 ? cmd.slice(0, 60) + '...' : cmd
      return ''
    }
    case 'Read': {
      const path = input.file_path as string
      if (path) return `读取 ${path.split(/[/\\]/).pop() || path}`
      return ''
    }
    case 'Write': {
      const path = input.file_path as string
      if (path) return `写入 ${path.split(/[/\\]/).pop() || path}`
      return ''
    }
    case 'Edit': {
      const path = input.file_path as string
      if (path) return `编辑 ${path.split(/[/\\]/).pop() || path}`
      return ''
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
      if (url) {
        try {
          return `获取 ${new URL(url).hostname}`
        } catch {
          return url.slice(0, 40)
        }
      }
      return ''
    }
    default:
      return ''
  }
}
