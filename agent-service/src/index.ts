/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     LaborAny Agent Service                               ║
 * ║                                                                          ║
 * ║  Express 服务入口 - SSE 流式响应                                          ║
 * ║  核心职责：接收请求 → 加载 Skill → 执行 Agent → 流式返回结果               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { config } from 'dotenv'
import { resolve, dirname, join, posix, normalize } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 加载项目根目录的 .env
config({ path: resolve(__dirname, '../../.env') })

// 加载用户配置目录的 .env（覆盖项目配置）
const userConfigDir = process.platform === 'win32'
  ? join(homedir(), 'AppData', 'Roaming', 'LaborAny')
  : process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support', 'LaborAny')
    : join(homedir(), '.config', 'laborany')
config({ path: join(userConfigDir, '.env'), override: true })

import express, { Request, Response } from 'express'
import cors from 'cors'
import { v4 as uuid } from 'uuid'
import { readFile, readdir, writeFile, mkdir, rm } from 'fs/promises'
import { existsSync, mkdirSync } from 'fs'
import { loadSkill, BUILTIN_SKILLS_DIR, USER_SKILLS_DIR } from 'laborany-shared'
import { SessionManager } from './session-manager.js'
import { executeAgent } from './agent-executor.js'
import { taskManager } from './task-manager.js'
import { loadWorkflow } from './workflow/loader.js'
import { executeWorkflow, validateWorkflowInput } from './workflow/executor.js'
import type { WorkflowEvent } from './workflow/types.js'
import { RESOURCES_DIR, DATA_DIR } from './paths.js'
import { memoryInjector } from './memory/index.js'
import { memoryRouter, cronRouter, notificationsRouter } from './routes/index.js'
import { startCronTimer } from './cron/index.js'

const app = express()
const PORT = process.env.AGENT_PORT || 3002

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           中间件配置                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.use(cors())
app.use(express.json())

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           路由挂载                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.use(memoryRouter)
app.use('/cron', cronRouter)
app.use('/notifications', notificationsRouter)

const sessionManager = new SessionManager()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     Skill 路径辅助函数                                    │
 * │                                                                          │
 * │  查找顺序：用户目录优先，然后是内置目录                                    │
 * │  写入时：始终使用用户目录（避免权限问题）                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function findSkillPath(skillId: string): string | null {
  // 优先检查用户目录
  const userPath = join(USER_SKILLS_DIR, skillId)
  if (existsSync(userPath)) return userPath

  // 然后检查内置目录
  const builtinPath = join(BUILTIN_SKILLS_DIR, skillId)
  if (existsSync(builtinPath)) return builtinPath

  return null
}

function getWritableSkillPath(skillId: string): string {
  // 写入时始终使用用户目录
  return join(USER_SKILLS_DIR, skillId)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                         健康检查端点                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取可用 Skills 列表                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.get('/skills', async (_req: Request, res: Response) => {
  try {
    const skills = await loadSkill.listAll()
    res.json({ skills })
  } catch (error) {
    res.status(500).json({ error: '无法加载 Skills 列表' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                      执行 Agent (SSE 流式响应)                            │
 * │                                                                          │
 * │  改进：集成 TaskManager，支持断线重连和后台执行                            │
 * │  - 用户停留在页面：实时显示流式输出                                        │
 * │  - 用户离开页面：任务继续后台执行，完成后发送通知                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.post('/execute', async (req: Request, res: Response) => {
  const { skillId, query, sessionId: existingSessionId } = req.body

  if (!skillId || !query) {
    res.status(400).json({ error: '缺少 skillId 或 query 参数' })
    return
  }

  // 先加载 Skill 获取名称
  const skill = await loadSkill.byId(skillId)
  if (!skill) {
    res.status(404).json({ error: 'Skill 不存在' })
    return
  }

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const sessionId = existingSessionId || uuid()
  const abortController = new AbortController()
  sessionManager.register(sessionId, abortController)

  // 注册到 TaskManager（传递友好名称）
  taskManager.register(sessionId, skillId, skill.meta.name)

  // 发送会话 ID
  res.write(`data: ${JSON.stringify({ type: 'session', sessionId })}\n\n`)

  // 订阅任务事件（SSE 输出）
  const unsubscribe = taskManager.subscribe(sessionId, (event) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }
  })

  // SSE 断开时取消订阅（但任务继续执行）
  res.on('close', () => {
    unsubscribe()
    // 注意：任务继续执行，不中止
    // 只有显式调用 /stop/:sessionId 才会中止任务
  })

  try {
    // 执行 Agent 并通过 TaskManager 分发事件
    await executeAgent({
      skill,
      query,
      sessionId,
      signal: abortController.signal,
      onEvent: (event) => taskManager.addEvent(sessionId, event),
    })

    // 发送完成事件
    taskManager.addEvent(sessionId, { type: 'done' })
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      taskManager.addEvent(sessionId, { type: 'error', content: '执行被中止' })
    } else {
      const message = error instanceof Error ? error.message : '执行失败'
      taskManager.addEvent(sessionId, { type: 'error', content: message })
    }
  } finally {
    sessionManager.unregister(sessionId)
    res.end()
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           中止执行端点                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.post('/stop/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const stopped = sessionManager.abort(sessionId)
  res.json({ success: stopped })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       查询任务状态                                        │
 * │                                                                          │
 * │  用于前端检查是否有正在执行的任务                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.get('/execute/status/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const status = taskManager.getStatus(sessionId)

  if (!status) {
    res.status(404).json({ error: '任务不存在' })
    return
  }

  res.json(status)
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       重新连接到正在执行的任务 (SSE)                       │
 * │                                                                          │
 * │  支持断线重连：                                                           │
 * │  1. 先重放历史事件（从 events[] 缓存）                                     │
 * │  2. 再订阅新事件                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.get('/execute/attach/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params

  if (!taskManager.has(sessionId)) {
    res.status(404).json({ error: '任务不存在' })
    return
  }

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // 发送会话 ID
  res.write(`data: ${JSON.stringify({ type: 'session', sessionId })}\n\n`)

  // 订阅任务事件（会先重放历史事件）
  const unsubscribe = taskManager.subscribe(sessionId, (event) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }
  })

  // SSE 断开时取消订阅
  res.on('close', () => {
    unsubscribe()
  })

  // 如果任务已完成，立即结束连接
  const status = taskManager.getStatus(sessionId)
  if (status && status.status !== 'running') {
    res.end()
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取运行中的任务列表                                 │
 * │                                                                          │
 * │  用于前端顶部导航栏显示运行中任务指示器                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.get('/execute/running', (_req: Request, res: Response) => {
  const tasks = taskManager.getRunningTasks()
  res.json({ tasks, count: tasks.length })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       任务目录文件列表                                     │
 * │  列出 Skill 执行过程中产生的文件（HTML、文档、图片等）                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.get('/tasks/:sessionId/files', async (req: Request, res: Response) => {
  const { sessionId } = req.params
  const taskDir = join(__dirname, '../../tasks', sessionId)

  if (!existsSync(taskDir)) {
    res.status(404).json({ error: '任务目录不存在' })
    return
  }

  try {
    const files = await listTaskFiles(taskDir, '')
    res.json({ files, workDir: taskDir })
  } catch (error) {
    res.status(500).json({ error: '获取文件列表失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       递归列出任务目录文件                                  │
 * │  支持工作流步骤目录识别（step-N-name 格式）                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface TaskFile {
  name: string
  path: string
  type: 'file' | 'folder'
  ext?: string
  size?: number
  children?: TaskFile[]
  stepIndex?: number    // 工作流步骤索引
  stepName?: string     // 工作流步骤名称
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       解析步骤目录名称                                     │
 * │  格式：step-N-name → { index: N, name: name }                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function parseStepDir(dirName: string): { index: number; name: string } | null {
  const match = dirName.match(/^step-(\d+)-(.+)$/)
  if (!match) return null
  return { index: parseInt(match[1], 10), name: match[2] }
}

async function listTaskFiles(baseDir: string, relativePath: string): Promise<TaskFile[]> {
  const fullPath = relativePath ? join(baseDir, relativePath) : baseDir
  const entries = await readdir(fullPath, { withFileTypes: true })
  const files: TaskFile[] = []

  // 忽略的文件/目录
  const ignoreList = new Set(['history.txt', '.git', 'node_modules', '__pycache__'])

  for (const entry of entries) {
    if (ignoreList.has(entry.name)) continue

    const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name

    if (entry.isFile()) {
      const ext = entry.name.split('.').pop()?.toLowerCase() || ''
      const { stat } = await import('fs/promises')
      const fileStat = await stat(join(fullPath, entry.name))
      files.push({
        name: entry.name,
        path: entryPath,
        type: 'file',
        ext,
        size: fileStat.size,
      })
    } else if (entry.isDirectory()) {
      const children = await listTaskFiles(baseDir, entryPath)
      if (children.length > 0) {
        const stepInfo = parseStepDir(entry.name)
        files.push({
          name: entry.name,
          path: entryPath,
          type: 'folder',
          children,
          ...(stepInfo && { stepIndex: stepInfo.index, stepName: stepInfo.name }),
        })
      }
    }
  }

  return files
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       下载/预览任务文件                                    │
 * │  支持 HTML 预览、图片预览、文件下载                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.get('/tasks/:sessionId/files/*', async (req: Request, res: Response) => {
  const { sessionId } = req.params
  const filePath = req.params[0] // 通配符捕获的路径
  const taskDir = join(__dirname, '../../tasks', sessionId)
  const fullPath = join(taskDir, filePath)

  // 安全检查：确保路径在任务目录内
  if (!fullPath.startsWith(taskDir)) {
    res.status(403).json({ error: '禁止访问' })
    return
  }

  if (!existsSync(fullPath)) {
    res.status(404).json({ error: '文件不存在' })
    return
  }

  try {
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const mimeTypes: Record<string, string> = {
      html: 'text/html',
      htm: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      json: 'application/json',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      pdf: 'application/pdf',
      txt: 'text/plain',
      md: 'text/markdown',
      csv: 'text/csv',
      xml: 'application/xml',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }

    const contentType = mimeTypes[ext] || 'application/octet-stream'
    const isPreviewable = ['html', 'htm', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'pdf', 'txt', 'md', 'json', 'css', 'js'].includes(ext)

    res.setHeader('Content-Type', contentType)

    // 非预览类型设置下载头
    if (!isPreviewable) {
      const filename = filePath.split('/').pop() || 'download'
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    }

    const content = await readFile(fullPath)
    res.send(content)
  } catch (error) {
    res.status(500).json({ error: '读取文件失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取 Skill 详情（含文件列表）                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.get('/skills/:skillId/detail', async (req: Request, res: Response) => {
  const { skillId } = req.params

  try {
    const skill = await loadSkill.byId(skillId)
    if (!skill) {
      res.status(404).json({ error: 'Skill 不存在' })
      return
    }

    const skillPath = findSkillPath(skillId)
    if (!skillPath) {
      res.status(404).json({ error: 'Skill 目录不存在' })
      return
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
        // 列出子目录内容（scripts, references, assets）
        const subDirPath = join(skillPath, entry.name)
        try {
          const subEntries = await readdir(subDirPath, { withFileTypes: true })
          const children = subEntries
            .filter(e => e.isFile())
            .map(e => {
              const ext = e.name.split('.').pop() || ''
              return {
                name: e.name,
                path: `${entry.name}/${e.name}`,
                type: ext,
              }
            })

          files.push({
            name: `${entry.name}/`,
            path: entry.name,
            type: 'folder',
            description: getDirDescription(entry.name),
            children,
          })
        } catch {
          // 忽略无法读取的目录
        }
      }
    }

    res.json({
      id: skillId,
      name: skill.meta.name,
      description: skill.meta.description,
      icon: skill.meta.icon,
      category: skill.meta.category,
      files,
    })
  } catch (error) {
    res.status(500).json({ error: '获取详情失败' })
  }
})

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

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取 Skill 文件内容                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.get('/skills/:skillId/file', async (req: Request, res: Response) => {
  const { skillId } = req.params
  const { path: filePath } = req.query

  if (!filePath || typeof filePath !== 'string') {
    res.status(400).json({ error: '缺少 path 参数' })
    return
  }

  try {
    const skillPath = findSkillPath(skillId)
    if (!skillPath) {
      res.status(404).json({ error: 'Skill 不存在' })
      return
    }
    const fullPath = join(skillPath, filePath)
    const content = await readFile(fullPath, 'utf-8')
    res.json({ content })
  } catch {
    res.status(404).json({ error: '文件不存在' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       保存 Skill 文件                                      │
 * │  注意：始终保存到用户目录，避免权限问题                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.put('/skills/:skillId/file', async (req: Request, res: Response) => {
  const { skillId } = req.params
  const { path: filePath, content } = req.body

  if (!filePath || content === undefined) {
    res.status(400).json({ error: '缺少 path 或 content 参数' })
    return
  }

  try {
    // 始终保存到用户目录
    const skillPath = getWritableSkillPath(skillId)
    // 确保目录存在
    if (!existsSync(skillPath)) {
      mkdirSync(skillPath, { recursive: true })
    }
    const fullPath = join(skillPath, filePath)
    // 确保父目录存在
    const parentDir = dirname(fullPath)
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true })
    }
    await writeFile(fullPath, content, 'utf-8')
    loadSkill.clearCache()
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: '保存失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取当前 Skills 列表（用户目录）                       │
 * │  用于检测新创建的 Skills                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function getSkillIds(): Promise<Set<string>> {
  const skillIds = new Set<string>()

  // 检查用户目录
  try {
    const userEntries = await readdir(USER_SKILLS_DIR, { withFileTypes: true })
    for (const e of userEntries) {
      if (e.isDirectory()) skillIds.add(e.name)
    }
  } catch { /* 目录可能不存在 */ }

  // 检查内置目录
  try {
    const builtinEntries = await readdir(BUILTIN_SKILLS_DIR, { withFileTypes: true })
    for (const e of builtinEntries) {
      if (e.isDirectory()) skillIds.add(e.name)
    }
  } catch { /* 目录可能不存在 */ }

  return skillIds
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       对话式创建 Skill (SSE)                               │
 * │  优先使用官方 skill-creator，回退到内置简化版                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.post('/skills/create', async (req: Request, res: Response) => {
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
  sessionManager.register(sessionId, abortController)

  // 记录执行前的 Skills 列表
  const skillsBefore = await getSkillIds()

  try {
    // 优先使用官方 skill-creator，如果不存在则回退到内置版本
    let creatorSkill = await loadSkill.byId('skill-creator')

    if (!creatorSkill) {
      // 回退到内置简化版
      creatorSkill = {
        meta: {
          id: 'skill-creator-builtin',
          name: 'Skill 创建助手',
          description: '帮助用户创建新的 Skill',
        },
        systemPrompt: buildFallbackSkillCreatorPrompt(),
        scriptsDir: '',
        tools: [],
      }
    }

    // 构建对话历史
    const conversationHistory = messages
      .map((m: { role: string; content: string }) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
      .join('\n\n')

    // 注入 skills 目录路径和对话历史（使用用户目录，避免权限问题）
    const absoluteSkillsDir = USER_SKILLS_DIR.replace(/\\/g, '/')
    const contextPrefix = `## 重要上下文

Skills 目录的绝对路径是：${absoluteSkillsDir}
创建新 Skill 时，必须在此目录下创建文件夹。

## 对话历史

${conversationHistory}

---

请继续帮助用户创建 Skill。如果用户已经描述清楚需求，请直接开始创建文件。`

    await executeAgent({
      skill: creatorSkill,
      query: contextPrefix,
      sessionId,
      signal: abortController.signal,
      onEvent: (event) => {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify(event)}\n\n`)
        }
      },
    })

    // 检测新创建的 Skills
    const skillsAfter = await getSkillIds()
    const newSkills = [...skillsAfter].filter(id => !skillsBefore.has(id))

    if (newSkills.length > 0) {
      // 清除缓存以便新 Skill 可以被加载
      loadSkill.clearCache()
      // 发送 skill_created 事件
      for (const skillId of newSkills) {
        res.write(`data: ${JSON.stringify({ type: 'skill_created', skillId })}\n\n`)
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建失败'
    res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`)
  } finally {
    sessionManager.unregister(sessionId)
    res.end()
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       回退版 Skill 创建 Prompt                            │
 * │  当官方 skill-creator 不存在时使用                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function buildFallbackSkillCreatorPrompt(): string {
  return `你是一个 Skill 创建助手，帮助用户通过对话创建完整的 AI 工作流程（Skill）。

## 你的职责
1. 理解用户想要创建的工作流程
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
2. 询问具体的工作流程步骤
3. 确认需要的工具和 API
4. 生成完整的 Skill 结构

请用中文与用户交流，保持友好和专业。`
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       从 GitHub 安装 Skill                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.post('/skills/install', async (req: Request, res: Response) => {
  const { source } = req.body

  if (!source) {
    res.status(400).json({ error: '缺少 source 参数' })
    return
  }

  try {
    const result = await installSkillFromGitHub(source)
    loadSkill.clearCache()
    res.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '安装失败'
    res.status(500).json({ error: message })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取官方 Skills 列表                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.get('/skills/official', async (_req: Request, res: Response) => {
  try {
    const skills = await fetchOfficialSkillsList()
    res.json({ skills })
  } catch (error) {
    res.status(500).json({ error: '获取官方 Skills 列表失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       卸载 Skill                                          │
 * │  只允许删除用户目录中的 Skill，内置 Skill 不可删除                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.delete('/skills/:skillId', async (req: Request, res: Response) => {
  const { skillId } = req.params

  try {
    // 只允许删除用户目录中的 Skill
    const userSkillPath = join(USER_SKILLS_DIR, skillId)
    if (!existsSync(userSkillPath)) {
      // 检查是否是内置 Skill
      const builtinPath = join(BUILTIN_SKILLS_DIR, skillId)
      if (existsSync(builtinPath)) {
        res.status(403).json({ error: '内置 Skill 不可删除' })
        return
      }
      res.status(404).json({ error: 'Skill 不存在' })
      return
    }

    await rm(userSkillPath, { recursive: true, force: true })
    loadSkill.clearCache()
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: '卸载失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       优化 Skill (SSE)                                    │
 * │  读取现有 Skill 代码，根据用户描述进行改进                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.post('/skills/:skillId/optimize', async (req: Request, res: Response) => {
  const { skillId } = req.params
  const { messages } = req.body

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: '缺少 messages 参数' })
    return
  }

  // 检查 Skill 是否存在
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
  sessionManager.register(sessionId, abortController)

  try {
    // 读取现有 Skill 的所有文件内容
    const skillFiles = await readSkillFiles(skillId)

    // 构建优化器 Skill
    const optimizerSkill = {
      meta: {
        id: 'skill-optimizer',
        name: 'Skill 优化助手',
        description: '帮助用户优化和改进现有的 Skill',
      },
      systemPrompt: buildSkillOptimizerPrompt(),
      scriptsDir: '',
      tools: [],
    }

    // 构建对话历史
    const conversationHistory = messages
      .map((m: { role: string; content: string }) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
      .join('\n\n')

    // 注入上下文（使用实际的 skill 路径）
    const skillPath = findSkillPath(skillId)
    const absoluteSkillPath = skillPath ? skillPath.replace(/\\/g, '/') : `${USER_SKILLS_DIR.replace(/\\/g, '/')}/${skillId}`
    const contextPrefix = `## 重要上下文

你正在优化的 Skill 是：${skillId}
Skill 目录的绝对路径是：${absoluteSkillPath}

## 现有 Skill 文件内容

${skillFiles}

## 对话历史

${conversationHistory}

---

请根据用户的需求优化这个 Skill。直接修改文件即可，不需要创建新目录。`

    await executeAgent({
      skill: optimizerSkill,
      query: contextPrefix,
      sessionId,
      signal: abortController.signal,
      onEvent: (event) => {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify(event)}\n\n`)
        }
      },
    })

    // 清除缓存以便重新加载修改后的 Skill
    loadSkill.clearCache()

    res.write(`data: ${JSON.stringify({ type: 'skill_updated', skillId })}\n\n`)
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : '优化失败'
    res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`)
  } finally {
    sessionManager.unregister(sessionId)
    res.end()
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       读取 Skill 所有文件内容                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function readSkillFiles(skillId: string): Promise<string> {
  const skillPath = findSkillPath(skillId)
  if (!skillPath) return '（Skill 目录不存在）'

  const result: string[] = []

  async function readDir(dir: string, prefix: string = ''): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name

      if (entry.isFile()) {
        // 只读取文本文件
        const ext = entry.name.split('.').pop()?.toLowerCase() || ''
        const textExts = ['md', 'yaml', 'yml', 'py', 'js', 'ts', 'json', 'txt', 'sh']
        if (textExts.includes(ext)) {
          try {
            const content = await readFile(fullPath, 'utf-8')
            result.push(`### 文件: ${relativePath}\n\`\`\`${ext}\n${content}\n\`\`\``)
          } catch {
            // 忽略无法读取的文件
          }
        }
      } else if (entry.isDirectory()) {
        // 跳过特殊目录
        if (!['node_modules', '__pycache__', '.git'].includes(entry.name)) {
          await readDir(fullPath, relativePath)
        }
      }
    }
  }

  await readDir(skillPath)
  return result.join('\n\n')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       Skill 优化器 Prompt                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function buildSkillOptimizerPrompt(): string {
  return `你是一个 Skill 优化专家，帮助用户改进和优化现有的 AI 工作流程（Skill）。

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
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       GitHub 安装辅助函数                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function installSkillFromGitHub(source: string): Promise<{ skillId: string; name: string }> {
  // 解析 GitHub URL
  // 支持格式：
  // - https://github.com/owner/repo/tree/branch/path/to/skill
  // - owner/repo/path/to/skill (默认 main 分支)
  // - anthropics/skills/skill-creator (官方仓库简写)

  let owner: string, repo: string, branch: string, skillPath: string

  if (source.startsWith('https://github.com/')) {
    const match = source.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/)
    if (!match) {
      throw new Error('无效的 GitHub URL 格式')
    }
    [, owner, repo, branch, skillPath] = match
  } else {
    const parts = source.split('/')
    if (parts.length < 3) {
      throw new Error('无效的源格式，需要 owner/repo/skill-path')
    }
    owner = parts[0]
    repo = parts[1]
    skillPath = parts.slice(2).join('/')
    branch = 'main'
  }

  // 获取 Skill 目录内容
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${skillPath}?ref=${branch}`
  const response = await fetch(apiUrl)

  if (!response.ok) {
    throw new Error(`无法获取 Skill: ${response.statusText}`)
  }

  const contents = await response.json() as Array<{
    name: string
    type: string
    download_url: string | null
    path: string
  }>

  if (!Array.isArray(contents)) {
    throw new Error('无效的 Skill 目录')
  }

  // 检查是否有 SKILL.md
  const hasSkillMd = contents.some(f => f.name === 'SKILL.md')
  if (!hasSkillMd) {
    throw new Error('无效的 Skill：缺少 SKILL.md 文件')
  }

  // 提取 Skill ID（目录名）
  const skillId = skillPath.split('/').pop() || skillPath

  // 创建本地目录（安装到用户目录，避免权限问题）
  const localSkillDir = join(USER_SKILLS_DIR, skillId)
  if (existsSync(localSkillDir)) {
    throw new Error(`Skill "${skillId}" 已存在`)
  }

  await mkdir(localSkillDir, { recursive: true })

  // 下载所有文件
  await downloadDirectory(contents, localSkillDir, owner, repo, branch)

  // 读取 SKILL.md 获取名称
  const skillMdPath = join(localSkillDir, 'SKILL.md')
  const skillMdContent = await readFile(skillMdPath, 'utf-8')
  const nameMatch = skillMdContent.match(/^name:\s*(.+)$/m)
  const name = nameMatch ? nameMatch[1].trim() : skillId

  return { skillId, name }
}

async function downloadDirectory(
  contents: Array<{ name: string; type: string; download_url: string | null; path: string }>,
  localDir: string,
  owner: string,
  repo: string,
  branch: string
): Promise<void> {
  for (const item of contents) {
    const localPath = join(localDir, item.name)

    if (item.type === 'file' && item.download_url) {
      const fileResponse = await fetch(item.download_url)
      const content = await fileResponse.text()
      await writeFile(localPath, content, 'utf-8')
    } else if (item.type === 'dir') {
      await mkdir(localPath, { recursive: true })
      const subApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${item.path}?ref=${branch}`
      const subResponse = await fetch(subApiUrl)
      const subContents = await subResponse.json() as Array<{
        name: string
        type: string
        download_url: string | null
        path: string
      }>
      await downloadDirectory(subContents, localPath, owner, repo, branch)
    }
  }
}

async function fetchOfficialSkillsList(): Promise<Array<{
  id: string
  name: string
  description: string
  source: string
}>> {
  // 获取 anthropics/skills 仓库的 skills 目录
  const apiUrl = 'https://api.github.com/repos/anthropics/skills/contents/skills'
  const response = await fetch(apiUrl)

  if (!response.ok) {
    throw new Error('无法获取官方 Skills 列表')
  }

  const contents = await response.json() as Array<{
    name: string
    type: string
    path: string
  }>

  const skills: Array<{ id: string; name: string; description: string; source: string }> = []

  for (const item of contents) {
    if (item.type !== 'dir') continue

    // 获取每个 Skill 的 SKILL.md
    try {
      const skillMdUrl = `https://raw.githubusercontent.com/anthropics/skills/main/${item.path}/SKILL.md`
      const skillMdResponse = await fetch(skillMdUrl)
      if (!skillMdResponse.ok) continue

      const skillMdContent = await skillMdResponse.text()
      const nameMatch = skillMdContent.match(/^name:\s*(.+)$/m)
      const descMatch = skillMdContent.match(/^description:\s*(.+)$/m)

      skills.push({
        id: item.name,
        name: nameMatch ? nameMatch[1].trim() : item.name,
        description: descMatch ? descMatch[1].trim() : '',
        source: `anthropics/skills/skills/${item.name}`,
      })
    } catch {
      // 跳过无法解析的 Skill
    }
  }

  return skills
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       工作流 API 端点                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取工作流列表                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.get('/workflows', async (_req: Request, res: Response) => {
  try {
    const workflows = await loadWorkflow.listAll()
    res.json({ workflows })
  } catch (error) {
    res.status(500).json({ error: '无法加载工作流列表' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取工作流详情                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.get('/workflows/:workflowId', async (req: Request, res: Response) => {
  const { workflowId } = req.params

  try {
    const workflow = await loadWorkflow.byId(workflowId)
    if (!workflow) {
      res.status(404).json({ error: '工作流不存在' })
      return
    }
    res.json(workflow)
  } catch (error) {
    res.status(500).json({ error: '获取工作流详情失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       创建工作流                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.post('/workflows', async (req: Request, res: Response) => {
  const { name, description, icon, steps, input, on_failure } = req.body

  if (!name || !steps || !Array.isArray(steps) || steps.length === 0) {
    res.status(400).json({ error: '缺少必要参数: name, steps' })
    return
  }

  try {
    const workflow = await loadWorkflow.create({
      name,
      description: description || '',
      icon,
      steps,
      input: input || {},
      on_failure: on_failure || 'stop',
    })
    res.json(workflow)
  } catch (error) {
    res.status(500).json({ error: '创建工作流失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       更新工作流                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.put('/workflows/:workflowId', async (req: Request, res: Response) => {
  const { workflowId } = req.params
  const updates = req.body

  try {
    const workflow = await loadWorkflow.update(workflowId, updates)
    if (!workflow) {
      res.status(404).json({ error: '工作流不存在' })
      return
    }
    res.json(workflow)
  } catch (error) {
    res.status(500).json({ error: '更新工作流失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       删除工作流                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.delete('/workflows/:workflowId', async (req: Request, res: Response) => {
  const { workflowId } = req.params

  try {
    const success = await loadWorkflow.delete(workflowId)
    if (!success) {
      res.status(404).json({ error: '工作流不存在' })
      return
    }
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: '删除工作流失败' })
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       执行工作流 (SSE 流式响应)                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.post('/workflows/:workflowId/execute', async (req: Request, res: Response) => {
  const { workflowId } = req.params
  const { input, runId: existingRunId } = req.body

  // 加载工作流
  const workflow = await loadWorkflow.byId(workflowId)
  if (!workflow) {
    res.status(404).json({ error: '工作流不存在' })
    return
  }

  // 验证输入参数
  const validation = validateWorkflowInput(workflow, input || {})
  if (!validation.valid) {
    res.status(400).json({ error: validation.errors.join('; ') })
    return
  }

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const runId = existingRunId || uuid()
  const abortController = new AbortController()
  sessionManager.register(runId, abortController)

  // 发送运行 ID
  res.write(`data: ${JSON.stringify({ type: 'run', runId })}\n\n`)

  try {
    await executeWorkflow({
      workflow,
      input: input || {},
      runId,
      signal: abortController.signal,
      onEvent: (event: WorkflowEvent) => {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify(event)}\n\n`)
        }
      },
    })
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      res.write(`data: ${JSON.stringify({ type: 'workflow_stopped' })}\n\n`)
    } else {
      const message = error instanceof Error ? error.message : '执行失败'
      res.write(`data: ${JSON.stringify({ type: 'workflow_error', error: message })}\n\n`)
    }
  } finally {
    sessionManager.unregister(runId)
    res.end()
  }
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       中止工作流执行                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.post('/workflows/stop/:runId', (req: Request, res: Response) => {
  const { runId } = req.params
  const stopped = sessionManager.abort(runId)
  res.json({ success: stopped })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           启动服务                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

// 确保 DATA_DIR 存在（Memory 文件存储位置）
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true })
}

app.listen(PORT, () => {
  console.log(`[Agent Service] 运行在 http://localhost:${PORT}`)
  console.log(`[Agent Service] 数据目录: ${DATA_DIR}`)

  // 启动定时任务调度器
  startCronTimer()
})
