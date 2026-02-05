/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Memory System API 路由                           ║
 * ║                                                                          ║
 * ║  职责：处理所有 Memory 相关的 HTTP 请求                                    ║
 * ║  包含：BOSS.md、MEMORY.md、每日记忆、记忆搜索、记忆归纳                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Router, Request, Response } from 'express'
import { existsSync, mkdirSync } from 'fs'
import { readdir, writeFile } from 'fs/promises'
import { join, dirname, normalize, posix } from 'path'
import { loadSkill } from 'laborany-shared'
import { DATA_DIR } from '../paths.js'
import {
  memoryFileManager,
  memorySearch,
  memoryWriter,
  bossManager,
  globalMemoryManager,
  memoryInjector,
  memoryConsolidator,
} from '../memory/index.js'

const router = Router()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取 BOSS.md 内容                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.get('/boss', (_req: Request, res: Response) => {
  try {
    const content = bossManager.read()
    if (!content) {
      res.status(404).json({ error: 'BOSS.md 不存在' })
      return
    }
    res.json({ content, path: bossManager.getPath() })
  } catch (error) {
    res.status(500).json({ error: '读取 BOSS.md 失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       更新 BOSS.md 内容                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.put('/boss', (req: Request, res: Response) => {
  const { content } = req.body
  if (content === undefined) {
    res.status(400).json({ error: '缺少 content 参数' })
    return
  }
  try {
    bossManager.update(content)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: '更新 BOSS.md 失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取 MEMORY.md 内容                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.get('/global-memory', (_req: Request, res: Response) => {
  try {
    const content = globalMemoryManager.read()
    if (!content) {
      res.status(404).json({ error: 'MEMORY.md 不存在' })
      return
    }
    res.json({ content, path: globalMemoryManager.getPath() })
  } catch (error) {
    res.status(500).json({ error: '读取 MEMORY.md 失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       更新 MEMORY.md 内容                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.put('/global-memory', (req: Request, res: Response) => {
  const { content } = req.body
  if (content === undefined) {
    res.status(400).json({ error: '缺少 content 参数' })
    return
  }
  try {
    globalMemoryManager.update(content)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: '更新 MEMORY.md 失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取完整 Memory 上下文                               │
 * │  供 src-api 调用，用于注入到 Agent 的系统提示词                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.get('/memory-context/:skillId', (req: Request, res: Response) => {
  try {
    const { skillId } = req.params
    const context = memoryInjector.buildContext({ skillId, userQuery: '' })
    res.json({ context })
  } catch (error) {
    res.status(500).json({ error: '获取 Memory 上下文失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       记录任务完成后的记忆                                 │
 * │  供 src-api 调用，用于记录任务执行结果到每日记忆                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.post('/memory/record-task', (req: Request, res: Response) => {
  try {
    const { skillId, skillName, userQuery, summary } = req.body
    if (!skillId || !userQuery) {
      res.status(400).json({ error: '缺少必要参数' })
      return
    }

    const memoryEntry = `**任务记录**\n- 技能：${skillName || skillId}\n- 问题：${userQuery}\n- 摘要：${summary || '(无摘要)'}`

    memoryFileManager.appendToDaily({ scope: 'skill', skillId, content: memoryEntry })
    memoryFileManager.appendToDaily({ scope: 'global', content: memoryEntry })

    console.log('[Memory] 已记录任务到每日记忆')
    res.json({ success: true })
  } catch (error) {
    console.error('[Memory] 记录任务失败:', error)
    res.status(500).json({ error: '记录任务失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取全局记忆文件列表                                 │
 * │  返回增强字段：displayName、scope，便于前端区分展示                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.get('/memory/global', async (_req: Request, res: Response) => {
  try {
    const globalDir = join(DATA_DIR, 'memory', 'global')
    if (!existsSync(globalDir)) {
      res.json({ files: [] })
      return
    }
    const entries = await readdir(globalDir)
    const files = entries
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse()
      .map(name => {
        const date = name.replace('.md', '')
        return {
          name,
          path: posix.join('memory', 'global', name),
          scope: 'global' as const,
          displayName: `全局 - ${date}`,
        }
      })
    res.json({ files })
  } catch (error) {
    res.status(500).json({ error: '获取全局记忆列表失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取 Skill 记忆文件列表                              │
 * │  返回增强字段：displayName、scope、skillId、skillName                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.get('/memory/skill/:skillId', async (req: Request, res: Response) => {
  const { skillId } = req.params
  try {
    const skillDir = join(DATA_DIR, 'memory', 'skills', skillId)
    if (!existsSync(skillDir)) {
      res.json({ files: [] })
      return
    }

    const skill = await loadSkill.byId(skillId)
    const skillName = skill?.meta?.name || skillId

    const entries = await readdir(skillDir)
    const files = entries
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse()
      .map(name => {
        const date = name.replace('.md', '')
        return {
          name,
          path: posix.join('memory', 'skills', skillId, name),
          scope: 'skill' as const,
          skillId,
          skillName,
          displayName: `${skillName} - ${date}`,
        }
      })
    res.json({ files })
  } catch (error) {
    res.status(500).json({ error: '获取 Skill 记忆列表失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       读取记忆文件内容                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.get('/memory/file', (req: Request, res: Response) => {
  const { path: filePath } = req.query
  if (!filePath || typeof filePath !== 'string') {
    res.status(400).json({ error: '缺少 path 参数' })
    return
  }
  try {
    const normalizedPath = normalize(filePath)
    const fullPath = join(DATA_DIR, normalizedPath)
    const memoryDir = join(DATA_DIR, 'memory')
    if (!fullPath.startsWith(memoryDir) && !fullPath.endsWith('MEMORY.md')) {
      res.status(403).json({ error: '禁止访问' })
      return
    }
    const content = memoryFileManager.readFile(fullPath)
    if (!content) {
      res.status(404).json({ error: '文件不存在' })
      return
    }
    res.json({ content })
  } catch (error) {
    res.status(500).json({ error: '读取文件失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       更新记忆文件内容                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.put('/memory/file', async (req: Request, res: Response) => {
  const { path: filePath, content } = req.body
  if (!filePath || content === undefined) {
    res.status(400).json({ error: '缺少 path 或 content 参数' })
    return
  }
  try {
    const normalizedPath = normalize(filePath)
    const fullPath = join(DATA_DIR, normalizedPath)
    const memoryDir = join(DATA_DIR, 'memory')
    if (!fullPath.startsWith(memoryDir) && !fullPath.endsWith('MEMORY.md')) {
      res.status(403).json({ error: '禁止访问' })
      return
    }
    const dir = dirname(fullPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    await writeFile(fullPath, content, 'utf-8')
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: '更新文件失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       搜索记忆                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.post('/memory/search', (req: Request, res: Response) => {
  const { query, scope, skillId, maxResults } = req.body
  if (!query) {
    res.status(400).json({ error: '缺少 query 参数' })
    return
  }
  try {
    const results = memorySearch.search({
      query,
      scope: scope || 'all',
      skillId,
      maxResults: maxResults || 10,
    })
    res.json({ results })
  } catch (error) {
    res.status(500).json({ error: '搜索失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       写入记忆（纠正/偏好/事实）                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.post('/memory/write', (req: Request, res: Response) => {
  const { type, skillId, ...data } = req.body
  if (!type || !skillId) {
    res.status(400).json({ error: '缺少 type 或 skillId 参数' })
    return
  }
  try {
    switch (type) {
      case 'correction':
        memoryWriter.writeCorrection({ skillId, ...data })
        break
      case 'preference':
        memoryWriter.writePreference({ skillId, ...data })
        break
      case 'fact':
        memoryWriter.writeFact({ skillId, ...data })
        break
      case 'longterm':
        memoryWriter.writeLongTerm({ skillId, ...data })
        break
      default:
        res.status(400).json({ error: '无效的 type 参数' })
        return
    }
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: '写入记忆失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取记忆归纳候选                                     │
 * │  分析最近的每日记忆，生成归纳候选条目供用户确认                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.get('/memory/consolidation-candidates', async (req: Request, res: Response) => {
  const { scope, skillId, days } = req.query
  try {
    let skillName: string | undefined
    if (scope === 'skill' && skillId) {
      const skill = await loadSkill.byId(skillId as string)
      skillName = skill?.meta?.name
    }

    const candidates = memoryConsolidator.analyzeRecentMemories({
      scope: (scope as 'global' | 'skill') || 'global',
      skillId: skillId as string | undefined,
      skillName,
      days: days ? parseInt(days as string, 10) : 7,
    })

    res.json({ candidates })
  } catch (error) {
    res.status(500).json({ error: '获取归纳候选失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       确认记忆归纳                                        │
 * │  将用户确认的候选条目写入长期记忆                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.post('/memory/consolidate', (req: Request, res: Response) => {
  const { candidateIds, scope, skillId } = req.body
  if (!candidateIds || !Array.isArray(candidateIds)) {
    res.status(400).json({ error: '缺少 candidateIds 参数' })
    return
  }
  try {
    const result = memoryConsolidator.consolidate({
      candidateIds,
      scope: scope || 'global',
      skillId,
    })
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: '归纳失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       拒绝记忆归纳候选                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
router.post('/memory/reject-candidates', (req: Request, res: Response) => {
  const { candidateIds } = req.body
  if (!candidateIds || !Array.isArray(candidateIds)) {
    res.status(400).json({ error: '缺少 candidateIds 参数' })
    return
  }
  try {
    const rejected = memoryConsolidator.rejectCandidates(candidateIds)
    res.json({ success: true, rejected })
  } catch (error) {
    res.status(500).json({ error: '拒绝候选失败' })
  }
})

export default router
