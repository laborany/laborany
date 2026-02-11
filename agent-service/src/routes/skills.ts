/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     Skills AI 路由                                      ║
 * ║                                                                          ║
 * ║  职责：AI 驱动的 Skill 创建与优化（SSE 流式）                            ║
 * ║  CRUD 操作由 src-api 统一提供，此处不再重复                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Router, Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import { readFile, readdir, rename } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import {
  loadSkill,
  BUILTIN_SKILLS_DIR,
  USER_SKILLS_DIR,
  generateCapabilityId,
  normalizeCapabilityDisplayName,
  pickUniqueCapabilityId,
} from 'laborany-shared'
import type { SessionManager } from '../session-manager.js'
import { executeAgent } from '../agent-executor.js'

const router = Router()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     Skill 路径查找                                       │
 * │  查找顺序：用户目录优先，然后是内置目录                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function findSkillPath(skillId: string): string | null {
  const userPath = join(USER_SKILLS_DIR, skillId)
  if (existsSync(userPath)) return userPath

  const builtinPath = join(BUILTIN_SKILLS_DIR, skillId)
  if (existsSync(builtinPath)) return builtinPath

  return null
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     消息格式化                                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function formatMessages(messages: Array<{ role: string; content: string }>): string {
  return messages
    .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
    .join('\n\n')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     获取当前 Skills ID 集合                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function getSkillIds(): Promise<Set<string>> {
  const skillIds = new Set<string>()

  try {
    const userEntries = await readdir(USER_SKILLS_DIR, { withFileTypes: true })
    for (const e of userEntries) {
      if (e.isDirectory()) skillIds.add(e.name)
    }
  } catch { /* 目录可能不存在 */ }

  try {
    const builtinEntries = await readdir(BUILTIN_SKILLS_DIR, { withFileTypes: true })
    for (const e of builtinEntries) {
      if (e.isDirectory()) skillIds.add(e.name)
    }
  } catch { /* 目录可能不存在 */ }

  return skillIds
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     检测并发送新创建的 Skills                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function pickUniqueSkillId(baseId: string): Promise<string> {
  const allIds = await getSkillIds()
  return pickUniqueCapabilityId(baseId, allIds)
}

async function normalizeNewlyCreatedSkills(skillsBefore: Set<string>): Promise<string[]> {
  const skillsAfter = await getSkillIds()
  const newSkillIds = [...skillsAfter].filter((id) => !skillsBefore.has(id))
  const finalIds: string[] = []

  for (const originalId of newSkillIds) {
    const skill = await loadSkill.byId(originalId)
    const displayName = normalizeCapabilityDisplayName(skill?.meta?.name || originalId)
    const expectedBaseId = generateCapabilityId(displayName, 'skill')

    if (originalId === expectedBaseId) {
      finalIds.push(originalId)
      continue
    }

    const newId = await pickUniqueSkillId(expectedBaseId)
    if (newId === originalId) {
      finalIds.push(originalId)
      continue
    }

    const fromPath = join(USER_SKILLS_DIR, originalId)
    const toPath = join(USER_SKILLS_DIR, newId)

    try {
      if (existsSync(fromPath) && !existsSync(toPath)) {
        await rename(fromPath, toPath)
        finalIds.push(newId)
      } else {
        finalIds.push(originalId)
      }
    } catch {
      finalIds.push(originalId)
    }
  }

  loadSkill.clearCache()
  return finalIds
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     加载 Skill 创建器                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function loadCreatorSkill() {
  const creatorSkill = await loadSkill.byId('skill-creator')
  if (creatorSkill) return creatorSkill

  return {
    meta: {
      id: 'skill-creator-builtin',
      name: 'Skill 创建助手',
      description: '帮助用户创建新的 Skill',
      kind: 'skill' as const,
    },
    systemPrompt: FALLBACK_CREATOR_PROMPT,
    scriptsDir: '',
    tools: [],
  }
}

const FALLBACK_CREATOR_PROMPT = `你是一个 Skill 创建助手，帮助用户通过对话创建完整的 AI 技能（含复合技能）。

## 你的职责
1. 理解用户想要创建的技能目标
2. 引导用户明确流程的各个步骤
3. 确定需要的输入、输出和工具
4. 最终生成完整的 Skill 文件结构

## Skill 结构
一个完整的 Skill 包含以下文件：
- SKILL.md: 主指令文件，包含 YAML frontmatter (name, description) 和 Markdown 指令
- scripts/: 工具脚本目录（Python 脚本，可选）
- references/: 参考文档目录（可选）
- assets/: 资源文件目录（可选）

## 对话流程
1. 首先了解用户想创建什么类型的助手
2. 询问具体的执行步骤
3. 确认需要的工具和 API
4. 生成完整的 Skill 结构

请用中文与用户交流，保持友好和专业。`

function buildCreateQuery(skillsDir: string, history: string): string {
  return `## 重要上下文

Skills 目录的绝对路径是：${skillsDir}
创建新 Skill 时，必须在此目录下创建文件夹。

## 对话历史

${history}

---

请继续帮助用户创建 Skill。如果用户已经描述清楚需求，请直接开始创建文件。`
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     Skill 优化器                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function buildOptimizerSkill() {
  return {
    meta: {
      id: 'skill-optimizer',
      name: 'Skill 优化助手',
      description: '帮助用户优化和改进现有的 Skill',
      kind: 'skill' as const,
    },
    systemPrompt: OPTIMIZER_PROMPT,
    scriptsDir: '',
    tools: [],
  }
}

const OPTIMIZER_PROMPT = `你是一个 Skill 优化专家，帮助用户改进和优化现有的 AI 技能（含复合技能）。

## 你的职责
1. 分析现有 Skill 的代码和结构
2. 理解用户想要的改进方向
3. 提出具体的优化建议
4. 直接修改文件实现优化

## 优化方向
- **功能增强**：添加新功能、扩展能力
- **性能优化**：提高执行效率、减少 API 调用
- **提示词优化**：改进 SKILL.md 中的指令，使输出更准确
- **错误处理**：增强脚本的健壮性
- **代码重构**：改善代码结构和可读性

## 注意事项
- 修改前先分析现有代码，理解其工作原理
- 保持向后兼容，不要破坏现有功能
- 修改后简要说明改动内容
- 如果用户的需求不明确，先询问具体细节

请用中文与用户交流，保持专业和友好。`

function buildOptimizeQuery(
  skillId: string, absPath: string,
  skillFiles: string, history: string,
): string {
  return `## 重要上下文

你正在优化的 Skill 是：${skillId}
Skill 目录的绝对路径是：${absPath}

## 现有 Skill 文件内容

${skillFiles}

## 对话历史

${history}

---

请根据用户的需求优化这个 Skill。直接修改文件即可，不需要创建新目录。`
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     读取 Skill 所有文件内容                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function readSkillFiles(skillId: string): Promise<string> {
  const skillPath = findSkillPath(skillId)
  if (!skillPath) return '（Skill 目录不存在）'

  const result: string[] = []
  await collectTextFiles(skillPath, '', result)
  return result.join('\n\n')
}

const TEXT_EXTS = new Set(['md', 'yaml', 'yml', 'py', 'js', 'ts', 'json', 'txt', 'sh'])
const SKIP_DIRS = new Set(['node_modules', '__pycache__', '.git'])

async function collectTextFiles(dir: string, prefix: string, result: string[]) {
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name

    if (entry.isFile()) {
      const ext = entry.name.split('.').pop()?.toLowerCase() || ''
      if (TEXT_EXTS.has(ext)) {
        try {
          const content = await readFile(fullPath, 'utf-8')
          result.push(`### 文件: ${relativePath}\n\`\`\`${ext}\n${content}\n\`\`\``)
        } catch { /* 忽略无法读取的文件 */ }
      }
    } else if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
      await collectTextFiles(fullPath, relativePath, result)
    }
  }
}

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     AI 路由挂载（SSE 流式）                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */
function mountCreateAndOptimize(r: ReturnType<typeof Router>, sm: SessionManager) {
  r.post('/skills/create', async (req: Request, res: Response) => {
    const { messages } = req.body

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: '缺少 messages 参数' })
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const sessionId = uuid()
    const abortController = new AbortController()
    sm.register(sessionId, abortController)

    const skillsBefore = await getSkillIds()

    try {
      const creatorSkill = await loadCreatorSkill()
      const conversationHistory = formatMessages(messages)
      const absoluteSkillsDir = USER_SKILLS_DIR.replace(/\\/g, '/')
      const query = buildCreateQuery(absoluteSkillsDir, conversationHistory)

      await executeAgent({
        skill: creatorSkill,
        query,
        sessionId,
        signal: abortController.signal,
        onEvent: (event) => {
          if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify(event)}\n\n`)
          }
        },
      })

      const normalizedNewSkills = await normalizeNewlyCreatedSkills(skillsBefore)
      for (const skillId of normalizedNewSkills) {
        res.write(`data: ${JSON.stringify({ type: 'skill_created', skillId })}\n\n`)
      }
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建失败'
      res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`)
    } finally {
      sm.unregister(sessionId)
      res.end()
    }
  })

  r.post('/skills/:skillId/optimize', async (req: Request, res: Response) => {
    const { skillId } = req.params
    const { messages } = req.body

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: '缺少 messages 参数' })
      return
    }

    const skill = await loadSkill.byId(skillId)
    if (!skill) {
      res.status(404).json({ error: 'Skill 不存在' })
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const sessionId = uuid()
    const abortController = new AbortController()
    sm.register(sessionId, abortController)

    try {
      const skillFiles = await readSkillFiles(skillId)
      const optimizerSkill = buildOptimizerSkill()
      const conversationHistory = formatMessages(messages)
      const skillPath = findSkillPath(skillId)
      const absPath = skillPath
        ? skillPath.replace(/\\/g, '/')
        : `${USER_SKILLS_DIR.replace(/\\/g, '/')}/${skillId}`
      const query = buildOptimizeQuery(skillId, absPath, skillFiles, conversationHistory)

      await executeAgent({
        skill: optimizerSkill,
        query,
        sessionId,
        signal: abortController.signal,
        onEvent: (event) => {
          if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify(event)}\n\n`)
          }
        },
      })

      loadSkill.clearCache()
      res.write(`data: ${JSON.stringify({ type: 'skill_updated', skillId })}\n\n`)
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '优化失败'
      res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`)
    } finally {
      sm.unregister(sessionId)
      res.end()
    }
  })
}

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     工厂函数 & 导出                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

export function createSkillsRouter(sessionManager: SessionManager) {
  mountCreateAndOptimize(router, sessionManager)
  return router
}
