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
            ? 'bg-primary-600 text-white'
            : isError
              ? 'bg-red-50 text-red-700'
              : isTool
                ? 'bg-gray-100 text-gray-700'
                : 'bg-white border border-gray-200'
        }`}
      >
        {isTool && (
          <div className="text-xs text-gray-500 mb-2 font-mono">
            🔧 {message.toolName}
          </div>
        )}

        {isUser || isTool ? (
          <div className={`whitespace-pre-wrap ${isTool ? 'font-mono text-sm' : ''}`}>
            {message.content}
          </div>
        ) : (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const isInline = !className
                  return isInline ? (
                    <code
                      className="px-1 py-0.5 bg-gray-100 rounded text-sm"
                      {...props}
                    >
                      {children}
                    </code>
                  ) : (
                    <code
                      className="block p-3 bg-gray-900 text-gray-100 rounded overflow-x-auto text-sm"
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
