/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     智能编排 - Orchestrate Router                      ║
 * ║                                                                        ║
 * ║  职责：分析用户输入，决定执行策略                                        ║
 * ║  设计：策略链模式 —— 按优先级依次尝试，首个命中即返回                    ║
 * ║  消除 if/else 堆叠，用数据结构驱动决策                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Router, Request, Response } from 'express'
import { loadCatalog, extractKeywords, type CatalogItem } from '../catalog.js'

const router = Router()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export interface OrchestratePlan {
  type: 'cron' | 'direct_skill' | 'workflow' | 'create_and_run'
  confidence: number
  skillId?: string
  workflowId?: string
  schedule?: string
  targetQuery?: string
  description?: string
  reason?: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     定时意图检测 - 关键词表                              │
 * │  用数据驱动代替分支判断                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */

const CRON_PATTERNS: { regex: RegExp; schedule: string }[] = [
  /* ── 中文：精确时间 ── */
  { regex: /每天\s*早上\s*(\d{1,2})[点时]/, schedule: '0 $1 * * *' },
  { regex: /每天\s*下午\s*(\d{1,2})[点时]/, schedule: '0 $1_PM * * *' },
  { regex: /每天\s*晚上\s*(\d{1,2})[点时]/, schedule: '0 $1_PM * * *' },
  { regex: /每天\s*(\d{1,2})[点时]/, schedule: '0 $1 * * *' },
  { regex: /每天\s*凌晨/, schedule: '0 0 * * *' },
  /* ── 中文：周期 ── */
  { regex: /每(个)?工作日/, schedule: '0 9 * * 1-5' },
  { regex: /每周一/, schedule: '0 9 * * 1' },
  { regex: /每周二/, schedule: '0 9 * * 2' },
  { regex: /每周三/, schedule: '0 9 * * 3' },
  { regex: /每周四/, schedule: '0 9 * * 4' },
  { regex: /每周五/, schedule: '0 9 * * 5' },
  { regex: /每周六/, schedule: '0 9 * * 6' },
  { regex: /每周[日天]/, schedule: '0 9 * * 0' },
  { regex: /每周/, schedule: '0 9 * * 1' },
  { regex: /每隔\s*(\d+)\s*小时/, schedule: '0 */$1 * * *' },
  { regex: /每隔\s*(\d+)\s*分钟/, schedule: '*/$1 * * * *' },
  { regex: /每小时/, schedule: '0 * * * *' },
  { regex: /每月\s*(\d{1,2})[号日]/, schedule: '0 9 $1 * *' },
  { regex: /每月/, schedule: '0 9 1 * *' },
  /* ── 英文 ── */
  { regex: /every\s*day\s*(?:at\s*)?(\d{1,2})\s*(am|pm)/i, schedule: '0 $1_$2 * * *' },
  { regex: /daily/i, schedule: '0 9 * * *' },
  { regex: /weekly/i, schedule: '0 9 * * 1' },
  { regex: /every\s*(\d+)\s*hours?/i, schedule: '0 */$1 * * *' },
  { regex: /every\s*(\d+)\s*minutes?/i, schedule: '*/$1 * * * *' },
]

const CRON_HINT_WORDS = [
  /* 中文 */
  '每天', '每周', '每月', '定时', '自动', '早上', '下午', '晚上', '凌晨',
  '周一', '周二', '周三', '周四', '周五', '周六', '周日', '每隔', '每小时',
  /* 英文 */
  'every day', 'weekly', 'daily', 'schedule', 'cron', 'every hour', 'every minute',
]

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     策略链 - 按优先级依次尝试                            ║
 * ║  每个检测器：(query, catalog) → OrchestratePlan | null                  ║
 * ║  首个非 null 结果即为最终决策                                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

type Detector = (query: string, catalog: CatalogItem[]) => Promise<OrchestratePlan | null> | OrchestratePlan | null

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     1. 定时意图检测                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function detectCron(query: string): OrchestratePlan | null {
  const lower = query.toLowerCase()
  const hasCronHint = CRON_HINT_WORDS.some(w => lower.includes(w))
  if (!hasCronHint) return null

  const schedule = matchSchedule(query)
  const targetQuery = stripCronWords(query)

  return {
    type: 'cron',
    confidence: 0.85,
    schedule,
    targetQuery: targetQuery || query,
    reason: `检测到定时意图，调度: ${schedule}`,
  }
}

/** 从查询中匹配 cron 表达式，处理 AM/PM 转换 */
function matchSchedule(query: string): string {
  for (const p of CRON_PATTERNS) {
    const m = query.match(p.regex)
    if (!m) continue
    let s = p.schedule
      .replace('$1', m[1] || '9')
      .replace('$2', (m[2] || '').toLowerCase())
    // 统一处理 PM/AM 标记 → 24 小时制
    s = s.replace(/(\d+)_PM/g, (_, h) => String((parseInt(h) % 12) + 12))
    s = s.replace(/(\d+)_pm/g, (_, h) => String((parseInt(h) % 12) + 12))
    s = s.replace(/(\d+)_am/g, (_, h) => String(parseInt(h) % 12))
    return s
  }
  return '0 9 * * *'
}

/** 剥离定时关键词，提取真正要执行的任务 */
function stripCronWords(query: string): string {
  let q = query
  for (const w of CRON_HINT_WORDS) {
    q = q.replace(new RegExp(w, 'gi'), '')
  }
  return q.replace(/\d{1,2}[点时]/g, '').replace(/at\s*\d{1,2}\s*(am|pm)/gi, '').trim()
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     2. 关键词精确匹配                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function detectKeyword(query: string, catalog: CatalogItem[]): OrchestratePlan | null {
  const tokens = extractKeywords(query)
  if (!tokens.length) return null

  let best: { item: CatalogItem; score: number } | null = null
  for (const item of catalog) {
    const hits = tokens.filter(t => item.keywords.some(k => k.includes(t) || t.includes(k)))
    const score = hits.length / tokens.length
    if (score >= 0.6 && (!best || score > best.score)) {
      best = { item, score }
    }
  }
  if (!best) return null

  const { item, score } = best
  return {
    type: item.type === 'skill' ? 'direct_skill' : 'workflow',
    confidence: score,
    skillId: item.type === 'skill' ? item.id : undefined,
    workflowId: item.type === 'workflow' ? item.id : undefined,
    reason: `关键词匹配: ${item.name} (${Math.round(score * 100)}%)`,
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     3. 兜底：创建并执行                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function detectFallback(query: string): OrchestratePlan {
  return {
    type: 'create_and_run',
    confidence: 0.5,
    description: query,
    reason: '无匹配，将创建新任务执行',
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     策略链：按优先级排列的检测器                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */

const DETECTORS: Detector[] = [
  (q, _c) => detectCron(q),
  (q, c) => detectKeyword(q, c),
]

async function orchestrate(query: string): Promise<OrchestratePlan> {
  const catalog = loadCatalog()
  for (const detect of DETECTORS) {
    const plan = await detect(query, catalog)
    if (plan) return plan
  }
  return detectFallback(query)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     POST /  —— 编排主入口                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */

router.post('/', async (req: Request, res: Response) => {
  try {
    const { query } = req.body
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: '缺少 query 参数' })
      return
    }
    const plan = await orchestrate(query.trim())
    res.json(plan)
  } catch (error) {
    console.error('[Orchestrate] 编排失败:', error)
    res.status(500).json({ error: '编排服务异常' })
  }
})

export const orchestrateRouter = router
