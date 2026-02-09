/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     LLM 记忆提取器                                        ║
 * ║                                                                          ║
 * ║  职责：使用 Claude 智能提取对话中的结构化记忆                               ║
 * ║  设计：轻量级 API 调用，专注于记忆提取任务                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import Anthropic from '@anthropic-ai/sdk'
import type { Message, ExtractedFact, MemCell } from './memcell/index.js'
import { memCellExtractor } from './memcell/index.js'

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
1. **摘要**：100-200 字，包含用户意图、核心问题、解决方案或结论
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
  "summary": "100-200 字摘要",
  "facts": [
    {"type": "preference", "content": "具体内容", "confidence": 0.8}
  ],
  "keywords": ["关键词1", "关键词2"],
  "sentiment": "neutral"
}

## 示例 1（含事实）
对话：User: 我在用 Next.js 做一个电商项目，部署在 Vercel 上。最近遇到 SSR 水合错误。
输出：
{
  "summary": "用户正在使用 Next.js 开发电商项目并部署在 Vercel 上，遇到了 SSR 水合（hydration）错误。这类错误通常由服务端和客户端渲染结果不一致引起，需要检查动态内容和浏览器 API 的使用方式。",
  "facts": [
    {"type": "context", "content": "正在用 Next.js 做电商项目", "confidence": 0.9},
    {"type": "context", "content": "项目部署在 Vercel 上", "confidence": 0.9}
  ],
  "keywords": ["Next.js", "SSR", "水合错误", "Vercel", "电商"],
  "sentiment": "negative"
}

## 示例 2（无事实）
对话：User: 帮我写一个快速排序算法。
输出：
{
  "summary": "用户请求实现快速排序算法。这是一个标准的算法实现需求，不涉及个人偏好或项目上下文信息。",
  "facts": [],
  "keywords": ["快速排序", "算法"],
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
 * │                     健壮 JSON 解析                                       │
 * │  处理 LLM 返回的 markdown 代码块包裹（```json ... ```）                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function parseJSON<T>(raw: string): T {
  // 尝试直接解析
  try { return JSON.parse(raw) as T } catch { /* 继续尝试 */ }

  // 剥离 markdown 代码块
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1]) as T
  }

  throw new Error('无法解析 JSON 响应')
}

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
   *  调用 LLM 提取记忆（带 timeout 和健壮 JSON 解析）
   * ──────────────────────────────────────────────────────────────────────── */
  async extract(messages: Message[]): Promise<LLMExtractResult> {
    const conversation = this.formatConversation(messages)
    const prompt = EXTRACTION_PROMPT + conversation

    try {
      const client = this.getClient()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15_000)

      const response = await client.messages.create(
        {
          model: this.model,
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: controller.signal }
      )
      clearTimeout(timer)

      // 提取文本内容
      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response')
      }

      // 健壮 JSON 解析：处理 markdown 代码块包裹
      const result = parseJSON<LLMExtractResult>(textBlock.text)
      return result
    } catch (error) {
      console.error('[LLMExtractor] 提取失败，使用降级方案:', error)
      return this.buildFallbackResult(messages)
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  降级方案：LLM 失败时复用规则提取器兜底
   * ──────────────────────────────────────────────────────────────────────── */
  private buildFallbackResult(messages: Message[]): LLMExtractResult {
    const userMsg = messages.find(m => m.role === 'user')
    const summary = userMsg
      ? userMsg.content.slice(0, 200) + (userMsg.content.length > 200 ? '...' : '')
      : '对话记录'

    // 复用 memCellExtractor（已含保底机制）
    const facts = memCellExtractor.extractFacts(messages)

    return { summary, facts, keywords: [], sentiment: 'neutral' }
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
