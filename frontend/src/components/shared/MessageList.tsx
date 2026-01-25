/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         消息列表组件                                       ║
 * ║                                                                          ║
 * ║  渲染对话消息，支持 Markdown、代码高亮、工具调用展示                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentMessage } from '../../hooks/useAgent'

interface MessageListProps {
  messages: AgentMessage[]
}

export default function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="space-y-4">
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           单条消息                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function MessageItem({ message }: { message: AgentMessage }) {
  const isUser = message.type === 'user'
  const isTool = message.type === 'tool'
  const isError = message.type === 'error'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : isError
              ? 'bg-destructive/10 text-destructive'
              : isTool
                ? 'bg-muted text-muted-foreground'
                : 'bg-card border border-border text-card-foreground'
        }`}
      >
        {isTool && (
          <div className="text-xs text-muted-foreground mb-2 font-mono flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {message.toolName}
          </div>
        )}

        {isUser || isTool ? (
          <div className={`whitespace-pre-wrap ${isTool ? 'font-mono text-sm' : ''}`}>
            {message.content}
          </div>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const isInline = !className
                  return isInline ? (
                    <code
                      className="px-1 py-0.5 bg-muted rounded text-sm"
                      {...props}
                    >
                      {children}
                    </code>
                  ) : (
                    <code
                      className="block p-3 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm"
                      {...props}
                    >
                      {children}
                    </code>
                  )
                },
                pre({ children }) {
                  return <pre className="bg-transparent p-0 m-0">{children}</pre>
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
