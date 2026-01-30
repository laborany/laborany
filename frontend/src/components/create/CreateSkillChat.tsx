/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      对话式创建技能                                       ║
 * ║                                                                          ║
 * ║  通过与 Claude Code 对话，逐步定义流程步骤，生成完整技能配置                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { ChatMessage } from '../../types'
import { parseErrorMessage, API_BASE } from '../../config'

const INITIAL_MESSAGE: ChatMessage = {
  role: 'assistant',
  content: `你好！我是技能创建助手。

我会帮你通过对话的方式创建一个完整的 AI 工作流程（技能）。

请告诉我：
1. **你想创建什么类型的助手？** （例如：数据分析、内容创作、代码审查等）
2. **这个助手需要完成什么任务？** （描述具体的工作流程）
3. **需要什么输入？会产生什么输出？**

描述得越详细，我生成的技能就越精准。`,
}

export function CreateSkillChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedSkill, setGeneratedSkill] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!input.trim() || generating) return

    const userMessage = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setGenerating(true)

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/skill/create-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMessage }],
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '请求失败' }))
        throw new Error(parseErrorMessage(errorData, `HTTP ${response.status}`))
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法读取响应流')

      let assistantMessage = ''
      const decoder = new TextDecoder()

      const updateAssistantMessage = (content: string) => {
        setMessages((prev) => {
          const newMessages = [...prev]
          const lastMsg = newMessages[newMessages.length - 1]
          if (lastMsg?.role === 'assistant') {
            lastMsg.content = content
          } else {
            newMessages.push({ role: 'assistant', content })
          }
          return newMessages
        })
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue

          try {
            const data = JSON.parse(line.slice(6))
            assistantMessage = processStreamEvent(data, assistantMessage, updateAssistantMessage, setGeneratedSkill)
          } catch {
            // 非 JSON 行，忽略
          }
        }
      }

      if (!assistantMessage) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: '处理完成，但没有收到响应内容。请检查后端日志。' },
        ])
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '请求失败'
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `❌ 错误: ${errorMsg}\n\n请检查后端服务是否正常运行。` },
      ])
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="card">
        {/* 消息列表 */}
        <div className="h-[500px] overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          {generating && <ThinkingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入框 */}
        <div className="border-t border-border p-4">
          {generatedSkill ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-green-600 dark:text-green-400">
                技能创建成功！
              </span>
              <Link
                to="/skills"
                onClick={() => window.location.reload()}
                className="btn-primary px-4 py-2 text-sm"
              >
                查看技能
              </Link>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="描述你想创建的工作流程..."
                disabled={generating}
                className="input flex-1"
              />
              <button
                onClick={sendMessage}
                disabled={generating || !input.trim()}
                className="btn-primary px-4 py-2"
              >
                发送
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 text-center text-sm text-muted-foreground">
        通过对话描述你的需求，AI 会帮你生成完整的技能配置
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
          正在思考...
        </div>
      </div>
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           流事件处理                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function processStreamEvent(
  data: { type: string; content?: string; taskDir?: string; toolName?: string; message?: string; skillId?: string },
  currentMessage: string,
  updateMessage: (content: string) => void,
  setGeneratedSkill: (id: string) => void
): string {
  let message = currentMessage

  switch (data.type) {
    case 'init':
      message = `📁 工作目录: ${data.taskDir || '准备中...'}\n\n`
      updateMessage(message)
      break

    case 'text':
      if (data.content) {
        message += data.content
        updateMessage(message)
      }
      break

    case 'tool_use':
      message += `\n🔧 正在执行: ${data.toolName || '工具'}...\n`
      updateMessage(message)
      break

    case 'tool_result':
      message += '✅ 完成\n'
      updateMessage(message)
      break

    case 'error':
      message += `\n❌ 错误: ${data.content || data.message || '未知错误'}\n`
      updateMessage(message)
      break

    case 'skill_created':
      if (data.skillId) setGeneratedSkill(data.skillId)
      break

    case 'done':
      setGeneratedSkill('created')
      break
  }

  return message
}
