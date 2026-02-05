/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     LLM 记忆提取器                                        ║
 * ║                                                                          ║
 * ║  职责：使用 Claude 智能提取对话中的结构化记忆                               ║
 * ║  设计：轻量级 API 调用，专注于记忆提取任务                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import Anthropic from '@anthropic-ai/sdk'
import type { Message, ExtractedFact, MemCell } from './memcell/index.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface LLMExtractResult {
  summary: string
  facts: ExtractedFact[]
  keywords: string[]
  sentiment: 'positive' | 'neutral' | 'negative'
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     提取 Prompt                                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const EXTRACTION_PROMPT = `你是一个记忆提取专家。分析以下对话，提取结构化信息。

## 任务
从对话中提取：
1. **摘要**：一句话概括对话主题（不超过 50 字）
2. **事实**：用户透露的偏好、个人信息、纠正等
3. **关键词**：3-5 个核心关键词
4. **情感**：用户的整体情感倾向

## 事实类型
- preference：用户偏好（喜欢/不喜欢/习惯）
- fact：个人信息（身份/职业/项目）
- correction：纠正信息（之前说错的/更正的）
- context：上下文信息（正在做的事/背景）

## 输出格式（严格 JSON）
{
  "summary": "一句话摘要",
  "facts": [
    {"type": "preference", "content": "具体内容", "confidence": 0.8}
  ],
  "keywords": ["关键词1", "关键词2"],
  "sentiment": "neutral"
}

## 注意
- 只提取明确表达的信息，不要推测
- confidence 范围 0.5-1.0，越明确越高
- 如果没有可提取的事实，facts 返回空数组
- 必须返回有效 JSON，不要添加任何解释

## 对话内容
`

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     LLM 提取器类                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class LLMExtractor {
  private client: Anthropic | null = null
  private model: string

  constructor() {
    this.model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  初始化 Anthropic 客户端
   * ──────────────────────────────────────────────────────────────────────── */
  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
      })
    }
    return this.client
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  格式化对话为文本
   * ──────────────────────────────────────────────────────────────────────── */
  private formatConversation(messages: Message[]): string {
    return messages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  调用 LLM 提取记忆
   * ──────────────────────────────────────────────────────────────────────── */
  async extract(messages: Message[]): Promise<LLMExtractResult> {
    const conversation = this.formatConversation(messages)
    const prompt = EXTRACTION_PROMPT + conversation

    try {
      const client = this.getClient()
      const response = await client.messages.create({
        model: this.model,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      })

      // 提取文本内容
      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response')
      }

      // 解析 JSON
      const result = JSON.parse(textBlock.text) as LLMExtractResult
      return result
    } catch (error) {
      console.error('[LLMExtractor] 提取失败:', error)
      // 返回默认结果
      return {
        summary: messages[0]?.content.slice(0, 50) || '对话记录',
        facts: [],
        keywords: [],
        sentiment: 'neutral',
      }
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  检��是否可用（API Key 是否配置）
   * ──────────────────────────────────────────────────────────────────────── */
  isAvailable(): boolean {
    return !!process.env.ANTHROPIC_API_KEY
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出单例                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const llmExtractor = new LLMExtractor()
