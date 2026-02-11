/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         路由模块导出入口                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

export { default as memoryRouter } from './memory.js'
export { default as cronRouter, notificationsRouter } from './cron.js'
export { default as filesRouter } from './files.js'
export { createSkillsRouter } from './skills.js'
export { createExecuteRouter } from './execute.js'
export { createCapabilitiesRouter } from './capabilities.js'
export { converseRouter } from './converse.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     能力建议路由 - Smart Router                          │
 * │  原 router.ts，合并至此以减少文件碎片                                    │
 * │  职责：基于关键词提供能力建议，不调用任何直连 LLM API                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */

import { Router, Request, Response } from 'express'
import { loadCatalog, extractKeywords } from '../catalog.js'

interface MatchResult {
  type: 'skill' | 'none'
  id: string
  name: string
  confidence: number
  reason: string
}

const NO_MATCH: MatchResult = { type: 'none', id: '', name: '', confidence: 0, reason: '无匹配' }

function keywordMatch(query: string): MatchResult[] {
  const tokens = extractKeywords(query)
  if (!tokens.length) return []

  return loadCatalog()
    .map(item => {
      const hits = tokens.filter(token =>
        item.keywords.some(keyword => keyword.includes(token) || token.includes(keyword)),
      )
      const confidence = hits.length / tokens.length
      return {
        type: item.type,
        id: item.id,
        name: item.name,
        confidence,
        reason: `关键词命中: ${hits.join(', ')}`,
      }
    })
    .filter(item => item.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence)
}

const smartRouterInstance = Router()

smartRouterInstance.post('/', (req: Request, res: Response) => {
  try {
    const { query } = req.body
    if (!query) {
      res.json(NO_MATCH)
      return
    }
    const best = keywordMatch(query)[0]
    res.json(best || NO_MATCH)
  } catch (error) {
    console.error('[Router] 建议匹配失败:', error)
    res.json(NO_MATCH)
  }
})

smartRouterInstance.get('/suggest', (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string) || ''
    if (!q) {
      res.json([])
      return
    }
    const matches = keywordMatch(q).slice(0, 5)
    res.json(matches)
  } catch (error) {
    console.error('[Router] 建议查询失败:', error)
    res.json([])
  }
})

export { smartRouterInstance as smartRouter }
