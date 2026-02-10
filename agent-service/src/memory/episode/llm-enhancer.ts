/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Episode LLM 增强器                                   ║
 * ║                                                                          ║
 * ║  职责：使用 LLM 生成更好的主题和摘要                                      ║
 * ║  设计：增强 TF-IDF 聚类结果，而非替代                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import Anthropic from '@anthropic-ai/sdk'
import type { Episode } from './cluster.js'
import type { MemCell } from '../memcell/index.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface EnhanceResult {
  subject: string
  summary: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     提取 Prompt                                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const ENHANCE_PROMPT = `你是一个记忆整理专家。根据以下多个对话片段，生成一个情节记忆的主题和摘要。

## 任务
1. **主题**：用 3-5 个词概括这些对话的共同主题
2. **摘要**：用 1-2 句话描述这个情节的核心内容

## 输出格式（严格 JSON）
{
  "subject": "简短主题",
  "summary": "情节摘要描述"
}

## 注意
- 主题简洁有力，便于检索
- 摘要要抓住核心，不要罗列细节
- 必须返回有效 JSON

## 对话片段
`

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     Episode LLM 增强器类                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class EpisodeLLMEnhancer {
  private client: Anthropic | null = null
  private model: string

  constructor() {
    this.model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  初始化客户端
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
   *  格式化 MemCell 列表为文本
   * ──────────────────────────────────────────────────────────────────────── */
  private formatCells(cells: MemCell[]): string {
    return cells.map((cell, i) => {
      const facts = cell.facts.map(f => `  - ${f.content}`).join('\n')
      return `### 片段 ${i + 1}\n摘要：${cell.summary}\n事实：\n${facts || '  （无）'}`
    }).join('\n\n')
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  增强 Episode（生成更好的主题和摘要）
   * ──────────────────────────────────────────────────────────────────────── */
  async enhance(episode: Episode, cells: MemCell[]): Promise<EnhanceResult> {
    const cellsText = this.formatCells(cells)
    const prompt = ENHANCE_PROMPT + cellsText

    try {
      const client = this.getClient()
      const response = await client.messages.create({
        model: this.model,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      })

      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text'
      )
      if (!textBlock) throw new Error('No text response')

      return JSON.parse(textBlock.text) as EnhanceResult
    } catch (error) {
      console.warn('[EpisodeLLMEnhancer] 增强失败，使用原始值:', error)
      return { subject: episode.subject, summary: episode.summary }
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  检查是否可用
   * ──────────────────────────────────────────────────────────────────────── */
  isAvailable(): boolean {
    return !!process.env.ANTHROPIC_API_KEY
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出单例                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const episodeLLMEnhancer = new EpisodeLLMEnhancer()
