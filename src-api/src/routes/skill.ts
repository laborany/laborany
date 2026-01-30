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
import { loadSkill, executeAgent, sessionManager, ensureTaskDir } from '../core/agent/index.js'
import { dbHelper } from '../core/database.js'

const skill = new Hono()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       查找 Skill 路径                                     │
 * │  优先用户目录，其次内置目录                                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function findSkillPath(skillId: string): string | null {
  const userPath = join(loadSkill.getUserSkillsDir(), skillId)
  if (existsSync(userPath)) return userPath

  const builtinPath = join(loadSkill.getBuiltinSkillsDir(), skillId)
  if (existsSync(builtinPath)) return builtinPath

  return null
}

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
 * │                       获取官方 Skills 列表                                │
 * │  说明：桌面版暂不支持在线市场，返回空列表                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
skill.get('/official', (c) => {
  return c.json({ skills: [] })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       安装 Skill（占位）                                   │
 * │  说明：桌面版暂不支持在线安装，返回未实现                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
skill.post('/install', (c) => {
  return c.json({ error: '桌面版暂不支持在线安装 Skill' }, 501)
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

  const skillPath = findSkillPath(skillId)
  if (!skillPath) {
    return c.json({ error: 'Skill 目录不存在' }, 404)
  }

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

  const skillPath = findSkillPath(skillId)
  if (!skillPath) {
    return c.json({ error: 'Skill 不存在' }, 404)
  }

  try {
    const fullPath = join(skillPath, filePath)
    const content = await readFile(fullPath, 'utf-8')
    return c.json({ content })
  } catch {
    return c.json({ error: '文件不存在' }, 404)
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       保存 Skill 文件                                      │
 * │  注意：只能保存到用户目录，内置 skills 是只读的                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
skill.put('/:skillId/file', async (c) => {
  const skillId = c.req.param('skillId')
  const { path: filePath, content } = await c.req.json()

  if (!filePath || content === undefined) {
    return c.json({ error: '缺少 path 或 content 参数' }, 400)
  }

  // 只允许保存到用户目录
  const userSkillPath = join(loadSkill.getUserSkillsDir(), skillId)
  if (!existsSync(userSkillPath)) {
    return c.json({ error: '只能编辑用户创建的 Skill' }, 403)
  }

  try {
    const fullPath = join(userSkillPath, filePath)
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
  let skillId: string | undefined
  let query: string | undefined
  let existingSessionId: string | undefined
  const files: File[] = []

  const contentType = c.req.header('Content-Type') || ''

  if (contentType.includes('multipart/form-data')) {
    const body = await c.req.parseBody({ all: true })
    skillId = (body['skillId'] as string) || (body['skill_id'] as string)
    query = body['query'] as string
    existingSessionId = (body['sessionId'] as string) || (body['session_id'] as string)

    const uploadedFiles = body['files']
    if (uploadedFiles) {
      if (Array.isArray(uploadedFiles)) {
        uploadedFiles.forEach(f => {
          if (f instanceof File) files.push(f)
        })
      } else if (uploadedFiles instanceof File) {
        files.push(uploadedFiles)
      }
    }
  } else {
    const body = await c.req.json()
    skillId = body.skillId || body.skill_id
    query = body.query
    existingSessionId = body.sessionId || body.session_id
  }

  if (!skillId || !query) {
    return c.json({ error: '缺少 skillId 或 query 参数' }, 400)
  }

  const skillData = await loadSkill.byId(skillId)
  if (!skillData) {
    return c.json({ error: 'Skill 不存在' }, 404)
  }

  const sessionId = existingSessionId || uuid()
  
  // 保存上传的文件
  const uploadedFilePaths: string[] = []
  if (files.length > 0) {
    try {
      const taskDir = ensureTaskDir(sessionId)
      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer()
        const filePath = join(taskDir, file.name)
        await writeFile(filePath, Buffer.from(arrayBuffer))
        uploadedFilePaths.push(filePath)
      }
    } catch (err) {
      console.error('保存文件失败:', err)
    }
  }

  // 如果有上传文件，将文件路径信息附加到 query
  let finalQuery = query
  if (uploadedFilePaths.length > 0) {
    const fileList = uploadedFilePaths.map(p => `- ${p}`).join('\n')
    finalQuery = `${query}\n\n【用户上传的文件】\n${fileList}\n\n请先读取这些文件，然后根据用户的问题进行处理。`
  }

  const abortController = new AbortController()
  sessionManager.register(sessionId, abortController)

  // 获取工作目录
  const workDir = ensureTaskDir(sessionId)

  // 保存会话到数据库（新会话）
  if (!existingSessionId) {
    dbHelper.run(
      `INSERT INTO sessions (id, user_id, skill_id, query, status, work_dir) VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionId, 'default', skillId, query, 'running', workDir]
    )
    // 保存用户消息
    dbHelper.run(
      `INSERT INTO messages (session_id, type, content) VALUES (?, ?, ?)`,
      [sessionId, 'user', query]
    )
  } else {
    // 继续对话时也保存用户消息
    dbHelper.run(
      `INSERT INTO messages (session_id, type, content) VALUES (?, ?, ?)`,
      [sessionId, 'user', query]
    )
  }

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ data: JSON.stringify({ type: 'session', sessionId }) })

    let finalStatus = 'completed'
    let assistantContent = ''

    try {
      await executeAgent({
        skill: skillData,
        query: finalQuery,
        sessionId,
        signal: abortController.signal,
        onEvent: async (event) => {
          await stream.writeSSE({ data: JSON.stringify(event) })

          // 保存消息到数据库
          if (event.type === 'text' && event.content) {
            assistantContent += event.content
          } else if (event.type === 'tool_use') {
            dbHelper.run(
              `INSERT INTO messages (session_id, type, tool_name, tool_input) VALUES (?, ?, ?, ?)`,
              [sessionId, 'tool_use', event.toolName || '', JSON.stringify(event.toolInput || {})]
            )
          } else if (event.type === 'tool_result') {
            dbHelper.run(
              `INSERT INTO messages (session_id, type, tool_result) VALUES (?, ?, ?)`,
              [sessionId, 'tool_result', event.toolResult || '']
            )
          }
        },
      })

      // 保存完整的助手回复
      if (assistantContent) {
        dbHelper.run(
          `INSERT INTO messages (session_id, type, content) VALUES (?, ?, ?)`,
          [sessionId, 'assistant', assistantContent]
        )
      }

      await stream.writeSSE({ data: JSON.stringify({ type: 'done' }) })
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        await stream.writeSSE({ data: JSON.stringify({ type: 'aborted' }) })
        finalStatus = 'aborted'
      } else {
        const message = error instanceof Error ? error.message : '执行失败'
        await stream.writeSSE({ data: JSON.stringify({ type: 'error', message }) })
        finalStatus = 'failed'
      }
    } finally {
      sessionManager.unregister(sessionId)
      // 更新会话状态
      dbHelper.run(
        `UPDATE sessions SET status = ? WHERE id = ?`,
        [finalStatus, sessionId]
      )
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
 * │                       对话式创建 Skill (SSE)                              │
 * │  说明：新 skill 保存到用户目录（AppData），避免 Program Files 权限问题     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
skill.post('/create-chat', async (c) => {
  const { messages } = await c.req.json()

  if (!messages || !Array.isArray(messages)) {
    return c.json({ error: '缺少 messages 参数' }, 400)
  }

  // 使用 skill-creator skill 来创建新 skill
  const skillCreator = await loadSkill.byId('skill-creator')
  if (!skillCreator) {
    return c.json({ error: 'skill-creator 不存在，无法创建 Skill' }, 404)
  }

  const sessionId = uuid()
  const abortController = new AbortController()
  sessionManager.register(sessionId, abortController)

  // 获取用户 skills 目录（可写）
  const userSkillsDir = loadSkill.getUserSkillsDir()

  // 构建查询：告诉 Claude Code 在用户目录创建 skill
  const lastUserMessage = messages.filter((m: { role: string }) => m.role === 'user').pop()
  const query = `${lastUserMessage?.content || ''}\n\n【重要】创建 skill 时，请使用以下路径作为 --path 参数：${userSkillsDir}`

  return streamSSE(c, async (stream) => {
    try {
      await executeAgent({
        skill: skillCreator,
        query,
        sessionId,
        signal: abortController.signal,
        // 不设置 workDir，使用默认的 tasks 目录（在 AppData 中）
        onEvent: async (event) => {
          await stream.writeSSE({ data: JSON.stringify(event) })
        },
      })
      // 创建完成后清除缓存，确保新 skill 可以被加载
      loadSkill.clearCache()
      await stream.writeSSE({ data: JSON.stringify({ type: 'done' }) })
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建失败'
      await stream.writeSSE({ data: JSON.stringify({ type: 'error', message }) })
    } finally {
      sessionManager.unregister(sessionId)
    }
  })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       对话式优化 Skill (SSE)                              │
 * │  说明：通过 AI 对话优化现有 Skill 的配置和提示词                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */
skill.post('/:skillId/optimize', async (c) => {
  const skillId = c.req.param('skillId')
  const { messages } = await c.req.json()

  if (!messages || !Array.isArray(messages)) {
    return c.json({ error: '缺少 messages 参数' }, 400)
  }

  // 检查目标 skill 是否存在
  const targetSkill = await loadSkill.byId(skillId)
  if (!targetSkill) {
    return c.json({ error: 'Skill 不存在' }, 404)
  }

  // 检查是否为用户 skill（只有用户 skill 可以被优化）
  const userSkillPath = join(loadSkill.getUserSkillsDir(), skillId)
  if (!existsSync(userSkillPath)) {
    return c.json({ error: '只能优化用户创建的 Skill' }, 403)
  }

  // 使用 skill-creator 来执行优化（它有修改文件的能力）
  const skillCreator = await loadSkill.byId('skill-creator')
  if (!skillCreator) {
    return c.json({ error: 'skill-creator 不存在，无法优化 Skill' }, 404)
  }

  const sessionId = uuid()
  const abortController = new AbortController()
  sessionManager.register(sessionId, abortController)

  // 构建优化查询
  const lastUserMessage = messages.filter((m: { role: string }) => m.role === 'user').pop()
  const query = `请帮我优化位于 ${userSkillPath} 的 Skill "${targetSkill.meta.name}"。

用户的优化需求：${lastUserMessage?.content || ''}

请分析现有的 Skill 文件，然后根据用户需求进行修改。修改完成后，简要说明你做了哪些改进。`

  return streamSSE(c, async (stream) => {
    try {
      await executeAgent({
        skill: skillCreator,
        query,
        sessionId,
        signal: abortController.signal,
        onEvent: async (event) => {
          await stream.writeSSE({ data: JSON.stringify(event) })
        },
      })
      // 优化完成后清除缓存
      loadSkill.clearCache()
      await stream.writeSSE({ data: JSON.stringify({ type: 'skill_updated', skillId }) })
      await stream.writeSSE({ data: JSON.stringify({ type: 'done' }) })
    } catch (error) {
      const message = error instanceof Error ? error.message : '优化失败'
      await stream.writeSSE({ data: JSON.stringify({ type: 'error', message }) })
    } finally {
      sessionManager.unregister(sessionId)
    }
  })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       卸载 Skill                                          │
 * │  注意：只能卸载用户目录中的 skill，内置 skills 不可删除                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
skill.delete('/:skillId', async (c) => {
  const skillId = c.req.param('skillId')

  // 只允许删除用户目录中的 skill
  const userSkillPath = join(loadSkill.getUserSkillsDir(), skillId)
  if (!existsSync(userSkillPath)) {
    // 检查是否是内置 skill
    const builtinPath = join(loadSkill.getBuiltinSkillsDir(), skillId)
    if (existsSync(builtinPath)) {
      return c.json({ error: '内置 Skill 不可删除' }, 403)
    }
    return c.json({ error: 'Skill 不存在' }, 404)
  }

  await rm(userSkillPath, { recursive: true, force: true })
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
