/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      对话式优化 Skill                                     ║
 * ║                                                                          ║
 * ║  通过与 AI 对话，描述想要的改进，自动修改 Skill 文件                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect, useRef } from 'react'
import type { ChatMessage } from '../../types'

interface OptimizeSkillChatProps {
  skillId: string
  skillName: string
  onBack: () => void
  onComplete: () => void
}

function getInitialMessage(skillName: string): ChatMessage {
  return {
    role: 'assistant',
    content: `你好！我是 Skill 优化助手。

我会帮你改进和优化 **${skillName}** 这个 Skill。

请告诉我你想要：
1. **功能增强** - 添加新功能或扩展现有能力
2. **提示词优化** - 改进指令使输出更准确
3. **性能优化** - 提高执行效率
4. **错误修复** - 修复已知问题
5. **其他改进** - 描述你的具体需求

我会分析现有代码，然后根据你的需求进行修改。`,
  }
}

export function OptimizeSkillChat({
  skillId,
  skillName,
  onBack,
  onComplete,
}: OptimizeSkillChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    getInitialMessage(skillName),
  ])
  const [input, setInput] = useState('')
  const [optimizing, setOptimizing] = useState(false)
  const [completed, setCompleted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!input.trim() || optimizing) return

    const userMessage = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setOptimizing(true)

    try {
      const token = localStorage.getItem('token')
      // ═══════════════════════════════════════════════════════════════════════════
      // 使用 agent-service 的优化端点，而非 src-api
      // agent-service 内置 skill-optimizer prompt，不依赖外部 skill，实现更稳定
      // ═══════════════════════════════════════════════════════════════════════════
      const response = await fetch(`/agent-api/skills/${skillId}/optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMessage }],
        }),
      })

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader')

      let assistantMessage = ''
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'text') {
                assistantMessage += data.content
                setMessages((prev) => {
                  const newMessages = [...prev]
                  const lastMsg = newMessages[newMessages.length - 1]
                  if (lastMsg?.role === 'assistant') {
                    lastMsg.content = assistantMessage
                  } else {
                    newMessages.push({ role: 'assistant', content: assistantMessage })
                  }
                  return newMessages
                })
              } else if (data.type === 'skill_updated') {
                setCompleted(true)
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error) {
      // ═══════════════════════════════════════════════════════════════════════════
      // 记录错误详情，便于调试
      // ═══════════════════════════════════════════════════════════════════════════
      console.error('优化失败:', error)

      const errorMessage = error instanceof Error ? error.message : '未知错误'
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `❌ 优化过程中出现错误：${errorMessage}\n\n请检查：\n1. agent-service 是否正常运行（端口 3002）\n2. 网络连接是否正常` },
      ])
    } finally {
      setOptimizing(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-xl font-bold text-foreground">
          优化 Skill: {skillName}
        </h2>
      </div>

      <div className="card">
        {/* 消息列表 */}
        <div className="h-[500px] overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          {optimizing && <ThinkingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入框 */}
        <div className="border-t border-border p-4">
          {completed ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-green-600 dark:text-green-400">
                Skill 优化完成！
              </span>
              <button onClick={onComplete} className="btn-primary px-4 py-2 text-sm">
                返回列表
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="描述你想要的改进..."
                disabled={optimizing}
                className="input flex-1"
              />
              <button
                onClick={sendMessage}
                disabled={optimizing || !input.trim()}
                className="btn-primary px-4 py-2"
              >
                发送
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 text-center text-sm text-muted-foreground">
        AI 会分析现有代码并根据你的需求进行优化
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           消息气泡                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] px-4 py-3 rounded-lg ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        }`}
      >
        <div className="whitespace-pre-wrap text-sm">{message.content}</div>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           思考指示器                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function ThinkingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-muted px-4 py-3 rounded-lg">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="animate-pulse">●</span>
          正在分析和优化...
        </div>
      </div>
    </div>
  )
}
