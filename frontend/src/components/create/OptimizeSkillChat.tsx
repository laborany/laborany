import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AGENT_API_BASE } from '../../config/api'
import type { AgentMessage } from '../../types'
import { ExecutionPanel } from '../execution'

interface OptimizeSkillChatProps {
  skillId: string
  skillName: string
  onBack: () => void
  onComplete: () => void
}

interface OptimizeEvent {
  type?: string
  content?: string
  message?: string
  toolName?: string
  toolInput?: Record<string, unknown>
}

const INITIAL_MESSAGE = (skillName: string): AgentMessage => ({
  id: crypto.randomUUID(),
  type: 'assistant',
  content: `你好，我是 Skill 优化助手。\n\n我会帮你优化 **${skillName}**。\n\n请直接描述你想改进的点，比如：\n1. 功能增强\n2. 提示词优化\n3. 性能优化\n4. 错误修复`,
  timestamp: new Date(),
})

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'AbortError') return true
  return error.message.toLowerCase().includes('aborted')
}

function toConversationMessages(messages: AgentMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((message) => (message.type === 'user' || message.type === 'assistant') && message.content.trim())
    .map((message) => ({
      role: message.type === 'user' ? 'user' : 'assistant',
      content: message.content,
    }))
}

function parseSseBlock(rawBlock: string): OptimizeEvent | null {
  const lines = rawBlock.split(/\r?\n/)
  let dataLine = ''

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line.startsWith('data:')) continue
    dataLine += line.slice(5).trimStart()
  }

  if (!dataLine) return null

  try {
    return JSON.parse(dataLine) as OptimizeEvent
  } catch {
    return null
  }
}

export function OptimizeSkillChat({ skillId, skillName, onBack, onComplete }: OptimizeSkillChatProps) {
  const [messages, setMessages] = useState<AgentMessage[]>([INITIAL_MESSAGE(skillName)])
  const [isRunning, setIsRunning] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const currentAssistantIdRef = useRef<string>(crypto.randomUUID())
  const currentAssistantTextRef = useRef('')

  const resetAssistantDraft = useCallback(() => {
    currentAssistantIdRef.current = crypto.randomUUID()
    currentAssistantTextRef.current = ''
  }, [])

  const appendAssistantText = useCallback((chunk: string) => {
    if (!chunk) return

    const assistantId = currentAssistantIdRef.current
    currentAssistantTextRef.current += chunk

    setMessages((prev) => {
      const existing = prev.find((message) => message.id === assistantId)
      if (existing) {
        return prev.map((message) =>
          message.id === assistantId
            ? { ...message, content: currentAssistantTextRef.current }
            : message,
        )
      }

      return [
        ...prev,
        {
          id: assistantId,
          type: 'assistant',
          content: currentAssistantTextRef.current,
          timestamp: new Date(),
        },
      ]
    })
  }, [])

  const pushErrorMessage = useCallback((message: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type: 'error',
        content: message,
        timestamp: new Date(),
      },
    ])
  }, [])

  const handleEvent = useCallback((event: OptimizeEvent): boolean => {
    switch (event.type) {
      case 'text':
        appendAssistantText(typeof event.content === 'string' ? event.content : '')
        return false

      case 'tool_use':
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            type: 'tool',
            content: '',
            toolName: event.toolName || 'Tool',
            toolInput: event.toolInput,
            timestamp: new Date(),
          },
        ])
        resetAssistantDraft()
        return false

      case 'error': {
        const message =
          (typeof event.message === 'string' && event.message)
          || (typeof event.content === 'string' && event.content)
          || '优化过程出现错误'
        setError(message)
        pushErrorMessage(message)
        return false
      }

      case 'skill_updated':
        setCompleted(true)
        return false

      case 'done':
        return true

      default:
        return false
    }
  }, [appendAssistantText, pushErrorMessage, resetAssistantDraft])

  const sendMessage = useCallback(async (text: string) => {
    const query = text.trim()
    if (!query || isRunning) return

    const userMessage: AgentMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content: query,
      timestamp: new Date(),
    }

    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setIsRunning(true)
    setCompleted(false)
    setError(null)
    resetAssistantDraft()

    abortRef.current?.abort()
    const abortController = new AbortController()
    abortRef.current = abortController

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${AGENT_API_BASE}/skills/${skillId}/optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: toConversationMessages(nextMessages),
        }),
        signal: abortController.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as Record<string, unknown>
        const message =
          (typeof errorData.error === 'string' && errorData.error)
          || (typeof errorData.message === 'string' && errorData.message)
          || `请求失败: ${response.status}`
        throw new Error(message)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('优化响应流不可用')
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let shouldStop = false

      while (!shouldStop) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split(/\r?\n\r?\n/)
        buffer = blocks.pop() || ''

        for (const block of blocks) {
          const event = parseSseBlock(block)
          if (!event) continue
          if (handleEvent(event)) {
            shouldStop = true
            break
          }
        }
      }

      if (!shouldStop && buffer.trim()) {
        const event = parseSseBlock(buffer.trim())
        if (event) {
          handleEvent(event)
        }
      }
    } catch (error) {
      if (!isAbortError(error)) {
        const message = error instanceof Error ? error.message : '优化失败'
        setError(message)
        pushErrorMessage(message)
      }
    } finally {
      setIsRunning(false)
      if (abortRef.current === abortController) {
        abortRef.current = null
      }
    }
  }, [handleEvent, isRunning, messages, pushErrorMessage, resetAssistantDraft, skillId])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsRunning(false)
  }, [])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const headerSlot = useMemo(() => (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="返回"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-foreground">优化 Skill: {skillName}</h2>
          <p className="text-xs text-muted-foreground">使用统一执行面板进行对话和优化</p>
        </div>
      </div>

      {completed && (
        <button
          onClick={onComplete}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
        >
          返回列表
        </button>
      )}
    </div>
  ), [completed, onBack, onComplete, skillName])

  return (
    <div className="h-[calc(100vh-4rem)] w-full">
      <ExecutionPanel
        messages={messages}
        isRunning={isRunning}
        error={error}
        taskFiles={[]}
        workDir={null}
        filesVersion={0}
        onSubmit={(message) => {
          void sendMessage(message)
        }}
        onStop={handleStop}
        sessionId={null}
        getFileUrl={() => ''}
        fetchTaskFiles={() => {}}
        pendingQuestion={null}
        respondToQuestion={() => {}}
        placeholder={completed ? '优化已完成，可继续输入新的优化需求' : '描述你想优化的点...'}
        headerSlot={headerSlot}
      />
    </div>
  )
}

