/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Profile LLM 分类器                                   ║
 * ║                                                                          ║
 * ║  职责：使用 LLM 智能归类字段、解决冲突                                    ║
 * ║  设计：增强规则更新，提供更智能的决策                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedFact } from '../memcell/index.js'
import { profileManager } from './manager.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface ClassifyResult {
  section: string
  key: string
  description: string
  shouldUpdate: boolean
  reason: string
}

interface ConflictResult {
  resolution: 'keep_old' | 'use_new' | 'merge'
  mergedValue?: string
  reason: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     健壮 JSON 解析                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function parseJSON<T>(raw: string): T {
  try { return JSON.parse(raw) as T } catch { /* 继续尝试 */ }
  const m = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (m) return JSON.parse(m[1]) as T
  throw new Error('无法解析 JSON 响应')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     分类 Prompt                                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const CLASSIFY_PROMPT = `你是一个用户画像管理专家。根据提取的事实，决定如何更新用户画像。

## 可用章节
- 工作偏好：工作习惯、效率偏好、工具选择
- 沟通风格：表达方式、回复偏好、语言习惯
- 技术栈：编程语言、框架、工具链
- 个人信息：身份、职业、项目背景

## 任务
分析这个事实，决定：
1. 应该放到哪个章节
2. 用什么作为字段名（简短关键词）
3. 如何描述这个偏好
4. 是否值得记录（过于琐碎的不记录）

## 输出格式（严格 JSON）
{
  "section": "章节名",
  "key": "字段名",
  "description": "描述",
  "shouldUpdate": true,
  "reason": "决策理由"
}

## 事实
`

const CONFLICT_PROMPT = `你是一个用户画像管理专家。用户画像中存在冲突信息，请决定如何处理。

## 冲突情况
- 旧值：{old_value}
- 新值：{new_value}
- 旧证据：{old_evidences}
- 新证据：{new_evidence}

## 决策选项
1. keep_old：保留旧值（新信息不可靠或过于临时）
2. use_new：使用新值（新信息更准确或更新）
3. merge：合并两者（两者都有价值）

## 输出格式（严格 JSON）
{
  "resolution": "keep_old|use_new|merge",
  "mergedValue": "合并后的值（仅 merge 时需要）",
  "reason": "决策理由"
}
`

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     Profile LLM 分类器类                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class ProfileLLMClassifier {
  private client: Anthropic | null = null
  private classifyModel: string

  constructor() {
    // 分类任务用更轻量的模型，降低延迟和成本
    this.classifyModel = process.env.ANTHROPIC_CLASSIFY_MODEL
      || process.env.ANTHROPIC_MODEL
      || 'claude-haiku-4-20250414'
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
   *  分类事实到 Profile 字段（带 timeout + Profile 上下文注入）
   * ──────────────────────────────────────────────────────────────────────── */
  async classify(fact: ExtractedFact): Promise<ClassifyResult> {
    // 注入当前 Profile 已有字段，辅助 LLM 去重和合并
    const existingContext = this.buildProfileContext()
    const prompt = CLASSIFY_PROMPT
      + `\n## 当前已有画像字段\n${existingContext}\n\n`
      + `类型：${fact.type}\n内容：${fact.content}\n置信度：${fact.confidence}`

    try {
      const client = this.getClient()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)

      const response = await client.messages.create(
        {
          model: this.classifyModel,
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: controller.signal }
      )
      clearTimeout(timer)

      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text'
      )
      if (!textBlock) throw new Error('No text response')

      return parseJSON<ClassifyResult>(textBlock.text)
    } catch (error) {
      console.warn('[ProfileLLMClassifier] 分类失败，使用默认:', error)
      return this.defaultClassify(fact)
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  解决冲突（带 timeout）
   * ──────────────────────────────────────────────────────────────────────── */
  async resolveConflict(
    oldValue: string,
    newValue: string,
    oldEvidences: string[],
    newEvidence: string
  ): Promise<ConflictResult> {
    const prompt = CONFLICT_PROMPT
      .replace('{old_value}', oldValue)
      .replace('{new_value}', newValue)
      .replace('{old_evidences}', oldEvidences.join(', '))
      .replace('{new_evidence}', newEvidence)

    try {
      const client = this.getClient()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)

      const response = await client.messages.create(
        {
          model: this.classifyModel,
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: controller.signal }
      )
      clearTimeout(timer)

      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text'
      )
      if (!textBlock) throw new Error('No text response')

      return parseJSON<ConflictResult>(textBlock.text)
    } catch (error) {
      console.warn('[ProfileLLMClassifier] 冲突解决失败，使用新值:', error)
      return { resolution: 'use_new', reason: 'LLM 调用失败，默认使用新值' }
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  构建当前 Profile 上下文（注入到分类 prompt）
   * ──────────────────────────────────────────────────────────────────────── */
  private buildProfileContext(): string {
    try {
      const profile = profileManager.get()
      const lines: string[] = []
      for (const section of profile.sections) {
        if (section.fields.length === 0) continue
        lines.push(`### ${section.name}`)
        for (const f of section.fields) {
          lines.push(`- ${f.key}: ${f.description}`)
        }
      }
      return lines.length > 0 ? lines.join('\n') : '（暂无已有字段）'
    } catch {
      return '（暂无已有字段）'
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  默认分类（降级方案）
   * ──────────────────────────────────────────────────────────────────────── */
  private defaultClassify(fact: ExtractedFact): ClassifyResult {
    const sectionMap: Record<string, string> = {
      preference: '工作偏好',
      fact: '个人信息',
      correction: '沟通风格',
      context: '工作偏好',
    }

    return {
      section: sectionMap[fact.type] || '工作偏好',
      key: fact.content.slice(0, 15),
      description: fact.content,
      shouldUpdate: fact.confidence >= 0.6,
      reason: '使用默认规则分类',
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
export const profileLLMClassifier = new ProfileLLMClassifier()
