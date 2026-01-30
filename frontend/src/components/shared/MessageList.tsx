/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         消息列表组件                                       ║
 * ║                                                                          ║
 * ║  渲染对话消息，支持 Markdown、工具调用分组展示、可折叠任务组                    ║
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
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
type ToolWithResult = {
  message: AgentMessage
  globalIndex: number
}

type TaskMessageGroup = {
  type: 'task'
  title: string
  tools: ToolWithResult[]
  isCompleted: boolean
}

type OtherMessageGroup = {
  type: 'other'
  message: AgentMessage
}

type MessageGroup = TaskMessageGroup | OtherMessageGroup

export default function MessageList({ messages, isRunning = false }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) return null

  const groups = groupMessages(messages, isRunning)

  return (
    <div className="space-y-4">
      {groups.map((group, index) => {
        if (group.type === 'task') {
          return (
            <TaskGroupComponent
              key={index}
              title={group.title}
              tools={group.tools}
              isCompleted={group.isCompleted}
              isRunning={isRunning}
            />
          )
        }
        return <MessageItem key={index} message={group.message} />
      })}
      <div ref={bottomRef} />
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       消息分组逻辑                                        │
 * │  将连续的工具调用合并为任务组，文本消息作为任务标题                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function groupMessages(messages: AgentMessage[], isRunning: boolean): MessageGroup[] {
  const groups: MessageGroup[] = []
  let currentGroup: TaskMessageGroup | null = null
  let toolGlobalIndex = 0
  let lastAssistantContent = ''

  const pushCurrentGroup = (completed: boolean) => {
    if (currentGroup && currentGroup.tools.length > 0) {
      currentGroup.isCompleted = completed
      groups.push(currentGroup)
      currentGroup = null
    }
  }

  for (const message of messages) {
    if (message.type === 'assistant' && message.content) {
      // 助手文本消息：结束当前工具组，开始新组
      pushCurrentGroup(true)
      lastAssistantContent = message.content
      // 创建新的任务组，等待后续工具调用
      currentGroup = {
        type: 'task',
        title: message.content.slice(0, 80) + (message.content.length > 80 ? '...' : ''),
        tools: [],
        isCompleted: false,
      }
    } else if (message.type === 'tool') {
      // 工具调用：添加到当前组
      if (!currentGroup) {
        currentGroup = {
          type: 'task',
          title: '执行任务',
          tools: [],
          isCompleted: false,
        }
      }
      currentGroup.tools.push({ message, globalIndex: toolGlobalIndex++ })
    } else if (message.type === 'user') {
      // 用户消息：结束当前组，单独渲染
      pushCurrentGroup(true)
      groups.push({ type: 'other', message })
      lastAssistantContent = ''
    } else if (message.type === 'error') {
      pushCurrentGroup(true)
      groups.push({ type: 'other', message })
    }
  }

  // 处理剩余的组
  if (currentGroup) {
    if (currentGroup.tools.length > 0) {
      pushCurrentGroup(!isRunning)
    } else if (lastAssistantContent) {
      // 只有文本没有工具调用，作为普通消息渲染
      groups.push({
        type: 'other',
        message: {
          id: 'text-' + Date.now(),
          type: 'assistant',
          content: lastAssistantContent,
          timestamp: new Date(),
        },
      })
    }
  }

  return groups
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       任务组组件                                          │
 * │  显示任务标题 + 可折叠的工具调用列表                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function TaskGroupComponent({
  title,
  tools,
  isCompleted,
  isRunning,
}: {
  title: string
  tools: ToolWithResult[]
  isCompleted: boolean
  isRunning: boolean
}) {
  // 运行中展开，完成后折叠
  const [isExpanded, setIsExpanded] = useState(!isCompleted || isRunning)

  // 任务完成时自动折叠
  useEffect(() => {
    if (isCompleted && !isRunning) {
      setIsExpanded(false)
    }
  }, [isCompleted, isRunning])

  return (
    <div className="min-w-0 space-y-3 animate-in fade-in slide-in-from-bottom-1 duration-200">
      {/* 任务标题 */}
      <div className="flex min-w-0 items-start gap-2">
        {isCompleted ? (
          <svg className="mt-0.5 w-4 h-4 shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <div className="mt-0.5 flex w-4 h-4 shrink-0 items-center justify-center">
            <div className="w-2 h-2 animate-pulse rounded-full bg-primary" />
          </div>
        )}
        <span className="text-foreground line-clamp-2 min-w-0 text-sm font-medium break-words">
          {title}
        </span>
      </div>

      {/* 可折叠工具列表 */}
      {tools.length > 0 && (
        <div className="min-w-0 overflow-hidden rounded-xl border border-border/40 bg-accent/20">
          {/* 折叠头部 */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
          >
            <svg
              className={`w-4 h-4 shrink-0 transition-transform ${!isExpanded ? '-rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <span className="flex-1 text-left">
              {isExpanded ? '隐藏步骤' : `显示 ${tools.length} 个步骤`}
            </span>
          </button>

          {/* 工具列表 */}
          {isExpanded && (
            <div className="px-2 pb-2 space-y-1">
              {tools.map(({ message, globalIndex }) => (
                <ToolItem key={globalIndex} message={message} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       单个工具调用项                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ToolItem({ message }: { message: AgentMessage }) {
  const toolName = message.toolName || 'Tool'
  const description = getToolDescription(toolName, message.toolInput)

  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
      <ToolIcon name={toolName} />
      <span className="font-medium">{toolName}</span>
      {description && (
        <span className="truncate opacity-70 max-w-md">{description}</span>
      )}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       单条消息渲染                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function MessageItem({ message }: { message: AgentMessage }) {
  const isUser = message.type === 'user'
  const isError = message.type === 'error'

  // 用户消息
  if (isUser) {
    return (
      <div className="flex justify-end animate-in fade-in slide-in-from-bottom-1 duration-200">
        <div className="max-w-[85%] rounded-lg bg-primary px-4 py-3 text-primary-foreground">
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>
      </div>
    )
  }

  // 错误消息
  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive animate-in fade-in slide-in-from-bottom-1 duration-200">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{message.content}</span>
      </div>
    )
  }

  // 助手消息：Markdown 渲染
  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="rounded-lg bg-card border border-border px-4 py-3">
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
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       链接渲染器                                          │
 * │  外部链接在新窗口打开，内部链接正常跳转                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function LinkRenderer({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!href) return

    // 外部链接：在新窗口打开
    if (href.startsWith('http://') || href.startsWith('https://')) {
      e.preventDefault()
      window.open(href, '_blank', 'noopener,noreferrer')
    }
    // 内部链接或锚点：默认行为
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
 * │                       工具图标映射                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ToolIcon({ name }: { name: string }) {
  const iconClass = "w-4 h-4"

  // 文件操作
  if (['Read', 'Edit', 'Write'].includes(name)) {
    return (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  }

  // 搜索
  if (['Glob', 'Grep'].includes(name)) {
    return (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    )
  }

  // 终端/命令
  if (name === 'Bash') {
    return (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    )
  }

  // 网络
  if (['WebSearch', 'WebFetch'].includes(name)) {
    return (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    )
  }

  // 默认：齿轮图标
  return (
    <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       工具调用友好描述                                     │
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
      if (path) {
        const fileName = path.split(/[/\\]/).pop() || path
        return `读取 ${fileName}`
      }
      return ''
    }
    case 'Write': {
      const path = input.file_path as string
      if (path) {
        const fileName = path.split(/[/\\]/).pop() || path
        return `写入 ${fileName}`
      }
      return ''
    }
    case 'Edit': {
      const path = input.file_path as string
      if (path) {
        const fileName = path.split(/[/\\]/).pop() || path
        return `编辑 ${fileName}`
      }
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
          const hostname = new URL(url).hostname
          return `获取 ${hostname}`
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
