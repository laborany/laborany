/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Skill API 路由                                    ║
 * ║                                                                          ║
 * ║  端点：列表、详情、执行、创建、安装、卸载、优化                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { v4 as uuid } from 'uuid'
import { readFile, readdir, writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { stat } from 'fs/promises'
import { loadSkill, executeAgent, sessionManager } from '../core/agent/index.js'

const skill = new Hono()
const SKILLS_DIR = loadSkill.getSkillsDir()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取可用 Skills 列表                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */
skill.get('/', async (c) => {
  const skills = await loadSkill.listAll()
  return c.json({ skills })
})

skill.get('/list', async (c) => {
  const skills = await loadSkill.listAll()
  return c.json({ skills })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取 Skill 详情                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
skill.get('/:skillId/detail', async (c) => {
  const skillId = c.req.param('skillId')
  const skillData = await loadSkill.byId(skillId)

  if (!skillData) {
    return c.json({ error: 'Skill 不存在' }, 404)
  }

  const skillPath = join(SKILLS_DIR, skillId)
  const entries = await readdir(skillPath, { withFileTypes: true })

  const files: Array<{
    name: string
    path: string
    type: string
    description: string
    children?: Array<{ name: string; path: string; type: string }>
  }> = []

  for (const entry of entries) {
    if (entry.isFile()) {
      const ext = entry.name.split('.').pop() || ''
      files.push({
        name: entry.name,
        path: entry.name,
        type: ext === 'md' ? 'md' : ext === 'yaml' || ext === 'yml' ? 'yaml' : ext,
        description: getFileDescription(entry.name),
      })
    } else if (entry.isDirectory()) {
      const subDirPath = join(skillPath, entry.name)
      try {
        const subEntries = await readdir(subDirPath, { withFileTypes: true })
        const children = subEntries
          .filter(e => e.isFile())
          .map(e => ({
            name: e.name,
            path: `${entry.name}/${e.name}`,
            type: e.name.split('.').pop() || '',
          }))

        files.push({
          name: `${entry.name}/`,
          path: entry.name,
          type: 'folder',
          description: getDirDescription(entry.name),
          children,
        })
      } catch { /* ignore */ }
    }
  }

  return c.json({
    id: skillId,
    name: skillData.meta.name,
    description: skillData.meta.description,
    icon: skillData.meta.icon,
    category: skillData.meta.category,
    files,
  })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取 Skill 文件内容                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
skill.get('/:skillId/file', async (c) => {
  const skillId = c.req.param('skillId')
  const filePath = c.req.query('path')

  if (!filePath) {
    return c.json({ error: '缺少 path 参数' }, 400)
  }

  try {
    const fullPath = join(SKILLS_DIR, skillId, filePath)
    const content = await readFile(fullPath, 'utf-8')
    return c.json({ content })
  } catch {
    return c.json({ error: '文件不存在' }, 404)
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       保存 Skill 文件                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
skill.put('/:skillId/file', async (c) => {
  const skillId = c.req.param('skillId')
  const { path: filePath, content } = await c.req.json()

  if (!filePath || content === undefined) {
    return c.json({ error: '缺少 path 或 content 参数' }, 400)
  }

  try {
    const fullPath = join(SKILLS_DIR, skillId, filePath)
    await writeFile(fullPath, content, 'utf-8')
    loadSkill.clearCache()
    return c.json({ success: true })
  } catch {
    return c.json({ error: '保存失败' }, 500)
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      执行 Skill (SSE 流式响应)                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
skill.post('/execute', async (c) => {
  const body = await c.req.json()
  // 兼容 skill_id 和 skillId 两种格式
  const skillId = body.skillId || body.skill_id
  const query = body.query
  const existingSessionId = body.sessionId || body.session_id

  if (!skillId || !query) {
    return c.json({ error: '缺少 skillId 或 query 参数' }, 400)
  }

  const skillData = await loadSkill.byId(skillId)
  if (!skillData) {
    return c.json({ error: 'Skill 不存在' }, 404)
  }

  const sessionId = existingSessionId || uuid()
  const abortController = new AbortController()
  sessionManager.register(sessionId, abortController)

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ data: JSON.stringify({ type: 'session', sessionId }) })

    try {
      await executeAgent({
        skill: skillData,
        query,
        sessionId,
        signal: abortController.signal,
        onEvent: async (event) => {
          await stream.writeSSE({ data: JSON.stringify(event) })
        },
      })
      await stream.writeSSE({ data: JSON.stringify({ type: 'done' }) })
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        await stream.writeSSE({ data: JSON.stringify({ type: 'aborted' }) })
      } else {
        const message = error instanceof Error ? error.message : '执行失败'
        await stream.writeSSE({ data: JSON.stringify({ type: 'error', message }) })
      }
    } finally {
      sessionManager.unregister(sessionId)
    }
  })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           中止执行                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
skill.post('/stop/:sessionId', (c) => {
  const sessionId = c.req.param('sessionId')
  const stopped = sessionManager.abort(sessionId)
  return c.json({ success: stopped })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       卸载 Skill                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
skill.delete('/:skillId', async (c) => {
  const skillId = c.req.param('skillId')
  const skillPath = join(SKILLS_DIR, skillId)

  if (!existsSync(skillPath)) {
    return c.json({ error: 'Skill 不存在' }, 404)
  }

  await rm(skillPath, { recursive: true, force: true })
  loadSkill.clearCache()
  return c.json({ success: true })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       辅助函数                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getFileDescription(filename: string): string {
  const descriptions: Record<string, string> = {
    'SKILL.md': '主指令（触发时加载）',
    'FORMS.md': '表单指南（按需加载）',
    'reference.md': 'API 参考（按需加载）',
    'examples.md': '使用示例（按需加载）',
    'skill.yaml': '元信息和能力配置',
    'LICENSE.txt': '许可证文件',
  }
  return descriptions[filename] || ''
}

function getDirDescription(dirname: string): string {
  const descriptions: Record<string, string> = {
    'scripts': '工具脚本目录',
    'references': '参考文档目录',
    'assets': '资源文件目录',
  }
  return descriptions[dirname] || '子目录'
}

export default skill
