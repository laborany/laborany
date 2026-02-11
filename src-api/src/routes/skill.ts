
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { v4 as uuid } from 'uuid'
import { readFile, readdir, writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { stat } from 'fs/promises'
import {
  loadSkill,
  executeAgent,
  sessionManager,
  ensureTaskDir,
  runtimeTaskManager,
  type RuntimeEvent,
} from '../core/agent/index.js'
import { dbHelper } from '../core/database.js'

const skill = new Hono()

function findSkillPath(skillId: string): string | null {
  const userPath = join(loadSkill.getUserSkillsDir(), skillId)
  if (existsSync(userPath)) return userPath

  const builtinPath = join(loadSkill.getBuiltinSkillsDir(), skillId)
  if (existsSync(builtinPath)) return builtinPath

  return null
}

skill.get('/', async (c) => {
  const skills = await loadSkill.listAll()
  return c.json({ skills })
})

skill.get('/list', async (c) => {
  const skills = await loadSkill.listAll()
  return c.json({ skills })
})

skill.get('/official', (c) => {
  return c.json({ skills: [] })
})

skill.post('/install', (c) => {
  return c.json({ error: '桌面版暂不支持在线安装 Skill' }, 501)
})

skill.get('/:skillId/detail', async (c) => {
  const skillId = c.req.param('skillId')
  const skillData = await loadSkill.byId(skillId)

  if (!skillData) {
    return c.json({ error: 'Skill not found' }, 404)
  }

  const skillPath = findSkillPath(skillId)
  if (!skillPath) {
    return c.json({ error: 'Skill directory not found' }, 404)
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

skill.get('/:skillId/file', async (c) => {
  const skillId = c.req.param('skillId')
  const filePath = c.req.query('path')

  if (!filePath) {
    return c.json({ error: '缺少 path 参数' }, 400)
  }

  const skillPath = findSkillPath(skillId)
  if (!skillPath) {
    return c.json({ error: 'Skill not found' }, 404)
  }

  try {
    const fullPath = join(skillPath, filePath)
    const content = await readFile(fullPath, 'utf-8')
    return c.json({ content })
  } catch {
    return c.json({ error: 'File not found' }, 404)
  }
})

skill.put('/:skillId/file', async (c) => {
  const skillId = c.req.param('skillId')
  const { path: filePath, content } = await c.req.json()

  if (!filePath || content === undefined) {
    return c.json({ error: '缺少 path 或 content 参数' }, 400)
  }

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

skill.post('/execute', async (c) => {
  let skillId: string | undefined
  let query: string | undefined
  let originQuery: string | undefined
  let existingSessionId: string | undefined
  const files: File[] = []

  const contentType = c.req.header('Content-Type') || ''

  if (contentType.includes('multipart/form-data')) {
    const body = await c.req.parseBody({ all: true })
    skillId = (body['skillId'] as string) || (body['skill_id'] as string)
    query = body['query'] as string
    originQuery = body['originQuery'] as string
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
    originQuery = body.originQuery
    existingSessionId = body.sessionId || body.session_id
  }

  if (!skillId || !query) {
    return c.json({ error: '缺少 skillId 或 query 参数' }, 400)
  }

  const skillData = await loadSkill.byId(skillId)
  if (!skillData) {
    return c.json({ error: 'Skill not found' }, 404)
  }

  const sessionId = existingSessionId || uuid()

  // 淇濆瓨涓婁紶鐨勬枃浠?
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

  let finalQuery = query
  if (uploadedFilePaths.length > 0) {
    const fileList = uploadedFilePaths.map(p => `- ${p}`).join('\n')
    finalQuery = `${query}\n\n[Uploaded files]\n${fileList}\n\nPlease read these files first, then process the user request.`
  }

  if (existingSessionId && runtimeTaskManager.isRunning(existingSessionId)) {
    return c.json({ error: '当前会话任务仍在运行，请等待完成或先停止任务' }, 409)
  }

  const beforeSkillIds = new Set<string>()
  if (skillId === 'skill-creator') {
    try {
      const dirs = await readdir(loadSkill.getUserSkillsDir(), { withFileTypes: true })
      dirs.filter(d => d.isDirectory()).forEach(d => beforeSkillIds.add(d.name))
    } catch {
    }
  }

  const workDir = ensureTaskDir(sessionId)

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
    dbHelper.run(
      `UPDATE sessions SET status = ?, work_dir = ? WHERE id = ?`,
      ['running', workDir, sessionId]
    )

    dbHelper.run(
      `INSERT INTO messages (session_id, type, content) VALUES (?, ?, ?)`,
      [sessionId, 'user', query]
    )
  }

  runtimeTaskManager.startTask({
    sessionId,
    skillId,
    skill: skillData,
    query: finalQuery,
    originQuery: skillId === 'skill-creator' ? (originQuery || query) : undefined,
    beforeSkillIds: skillId === 'skill-creator' ? beforeSkillIds : undefined,
  })

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ data: JSON.stringify({ type: 'session', sessionId }) })

    const writeRuntimeEvent = async (event: RuntimeEvent) => {
      await stream.writeSSE({ data: JSON.stringify(event) })
    }

    const unsubscribe = runtimeTaskManager.subscribe(sessionId, writeRuntimeEvent, {
      replay: true,
      includeSession: false,
    })

    try {
      await runtimeTaskManager.waitForCompletion(sessionId)
    } finally {
      unsubscribe()
    }
  })
})

skill.post('/stop/:sessionId', (c) => {
  const sessionId = c.req.param('sessionId')
  const stopped = runtimeTaskManager.stop(sessionId) || sessionManager.abort(sessionId)
  return c.json({ success: stopped })
})

skill.get('/runtime/status/:sessionId', (c) => {
  const sessionId = c.req.param('sessionId')
  const status = runtimeTaskManager.getStatus(sessionId)
  if (!status) {
    return c.json({ error: '任务不存在' }, 404)
  }
  return c.json(status)
})

skill.get('/runtime/attach/:sessionId', (c) => {
  const sessionId = c.req.param('sessionId')

  if (!runtimeTaskManager.has(sessionId)) {
    return c.json({ error: '任务不存在' }, 404)
  }

  return streamSSE(c, async (stream) => {
    const writeRuntimeEvent = async (event: RuntimeEvent) => {
      await stream.writeSSE({ data: JSON.stringify(event) })
    }

    const unsubscribe = runtimeTaskManager.subscribe(sessionId, writeRuntimeEvent, {
      replay: true,
      includeSession: true,
    })

    try {
      await runtimeTaskManager.waitForCompletion(sessionId)
    } finally {
      unsubscribe()
    }
  })
})

skill.get('/runtime/running', (c) => {
  const tasks = runtimeTaskManager.getRunningTasks()
  return c.json({ tasks, count: tasks.length })
})

skill.get('/user-dir', (c) => {
  return c.json({ path: loadSkill.getUserSkillsDir() })
})

skill.post('/detect-new', async (c) => {
  const { knownIds } = await c.req.json()

  if (!Array.isArray(knownIds)) {
    return c.json({ error: '缺少 knownIds 参数' }, 400)
  }

  loadSkill.clearCache()
  const allSkills = await loadSkill.listAll()
  const known = new Set(knownIds)
  const newSkills = allSkills.filter(s => !known.has(s.id))

  return c.json({ newSkills })
})

skill.post('/:skillId/optimize', async (c) => {
  const skillId = c.req.param('skillId')
  const { messages } = await c.req.json()

  if (!messages || !Array.isArray(messages)) {
    return c.json({ error: '缺少 messages 参数' }, 400)
  }

  // 检查目标 skill 是否存在
  const targetSkill = await loadSkill.byId(skillId)
  if (!targetSkill) {
    return c.json({ error: 'Skill not found' }, 404)
  }

  const userSkillPath = join(loadSkill.getUserSkillsDir(), skillId)
  if (!existsSync(userSkillPath)) {
    return c.json({ error: '只能优化用户创建的 Skill' }, 403)
  }

  // 使用 skill-creator 执行优化（它具备修改文件能力）
  const skillCreator = await loadSkill.byId('skill-creator')
  if (!skillCreator) {
    return c.json({ error: 'skill-creator 不存在，无法优化 Skill' }, 404)
  }

  const sessionId = uuid()
  const abortController = new AbortController()
  sessionManager.register(sessionId, abortController)

  const lastUserMessage = messages.filter((m: { role: string }) => m.role === 'user').pop()
  const query = `Please help optimize the skill at ${userSkillPath} named "${targetSkill.meta.name}".\n\nUser request: ${lastUserMessage?.content || ""}\n\nAnalyze current skill files, apply the requested changes, then summarize improvements.`

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

skill.delete('/:skillId', async (c) => {
  const skillId = c.req.param('skillId')

  const userSkillPath = join(loadSkill.getUserSkillsDir(), skillId)
  if (!existsSync(userSkillPath)) {
    // 检查是否是内置 skill
    const builtinPath = join(loadSkill.getBuiltinSkillsDir(), skillId)
    if (existsSync(builtinPath)) {
      return c.json({ error: '内置 Skill 不可删除' }, 403)
    }
    return c.json({ error: 'Skill not found' }, 404)
  }

  await rm(userSkillPath, { recursive: true, force: true })
  loadSkill.clearCache()
  return c.json({ success: true })
})

function getFileDescription(filename: string): string {
  const descriptions: Record<string, string> = {
    'SKILL.md': '主指令（触发时加载）',
    'FORMS.md': 'Form guide (load on demand)',
    'reference.md': 'API reference (load on demand)',
    'examples.md': 'Examples (load on demand)',
    'skill.yaml': '元信息和能力配置',
    'LICENSE.txt': 'License file',
  }
  return descriptions[filename] || ''
}

function getDirDescription(dirname: string): string {
  const descriptions: Record<string, string> = {
    'scripts': '工具脚本目录',
    'references': 'Reference docs directory',
    'assets': '资源文件目录',
  }
  return descriptions[dirname] || 'Subdirectory'
}

export default skill
