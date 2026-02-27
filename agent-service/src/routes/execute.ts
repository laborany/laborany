/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Execute API 路由                                ║
 * ║                                                                          ║
 * ║  职责：处理 Agent 执行相关的 HTTP 请求                                    ║
 * ║  包含：执行（SSE）、中止、状态查询、断线重连、运行中任务列表               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Router, Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import { loadSkill } from 'laborany-shared'
import { SessionManager } from '../session-manager.js'
import { executeAgent } from '../agent-executor.js'
import { taskManager as taskManagerInstance } from '../task-manager.js'
import { resolveModelProfile } from '../lib/resolve-model-profile.js'

type TaskManagerType = typeof taskManagerInstance

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       工厂函数：注入 sessionManager 和 taskManager        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function createExecuteRouter(sessionManager: SessionManager, taskManager: TaskManagerType) {
  const router = Router()

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                       执行 Agent (SSE 流式响应)                          │
   * │                                                                          │
   * │  集成 TaskManager，支持断线重连和后台执行                                 │
   * │  - 用户停留在页面：实时显示流式输出                                       │
   * │  - 用户离开页面：任务继续后台执行，完成后发送通知                          │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  router.post('/execute', async (req: Request, res: Response) => {
    const { skillId, query, sessionId: existingSessionId, modelProfileId } = req.body

    if (!skillId || !query) {
      res.status(400).json({ error: '缺少 skillId 或 query 参数' })
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

    const sessionId = existingSessionId || uuid()
    const abortController = new AbortController()
    sessionManager.register(sessionId, abortController)
    taskManager.register(sessionId, skillId, skill.meta.name)

    res.write(`data: ${JSON.stringify({ type: 'session', sessionId })}\n\n`)

    // Resolve model profile (non-blocking warning on failure)
    const modelOverride = await resolveModelProfile(modelProfileId)
    if (modelProfileId && !modelOverride) {
      try {
        res.write(`data: ${JSON.stringify({ type: 'warning', content: `模型配置 ${modelProfileId} 未找到，已回退到默认模型` })}\n\n`)
      } catch { /* ignore */ }
    }

    // Fix P1-6: res.write 包装 try-catch，防止缓冲区满或连接断开时进程崩溃
    const unsubscribe = taskManager.subscribe(sessionId, (event) => {
      if (!res.writableEnded) {
        try {
          res.write(`data: ${JSON.stringify(event)}\n\n`)
        } catch {
          // 写入失败时忽略，连接已断开
        }
      }
    })

    res.on('close', () => { unsubscribe() })

    try {
      await executeAgent({
        skill,
        query,
        sessionId,
        signal: abortController.signal,
        onEvent: (event) => taskManager.addEvent(sessionId, event),
        modelOverride,
      })
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
   * │                           中止执行端点                                   │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  router.post('/stop/:sessionId', (req: Request, res: Response) => {
    const { sessionId } = req.params
    const stopped = sessionManager.abort(sessionId)
    if (!stopped && taskManager.isRunning(sessionId)) {
      taskManager.addEvent(sessionId, { type: 'stopped', content: '任务已停止' })
    }
    res.json({ success: stopped || taskManager.has(sessionId) })
  })

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                       查询任务状态                                       │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  router.get('/execute/status/:sessionId', (req: Request, res: Response) => {
    const { sessionId } = req.params
    const status = taskManager.getStatus(sessionId)

    if (!status) {
      res.status(404).json({ error: '任务不存在' })
      return
    }

    res.json(status)
  })

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                       重新连接到正在执行的任务 (SSE)                      │
   * │                                                                          │
   * │  支持断线重连：先重放历史事件，再订阅新事件                               │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  router.get('/execute/attach/:sessionId', (req: Request, res: Response) => {
    const { sessionId } = req.params

    if (!taskManager.has(sessionId)) {
      res.status(404).json({ error: '任务不存在' })
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    res.write(`data: ${JSON.stringify({ type: 'session', sessionId })}\n\n`)

    // Fix P1-6: res.write 包装 try-catch，防止缓冲区满或连接断开时进程崩溃
    const unsubscribe = taskManager.subscribe(sessionId, (event) => {
      if (!res.writableEnded) {
        try {
          res.write(`data: ${JSON.stringify(event)}\n\n`)
        } catch {
          // 写入失败时忽略，连接已断开
        }
      }
    })

    res.on('close', () => { unsubscribe() })

    const status = taskManager.getStatus(sessionId)
    if (status && status.status !== 'running') {
      res.end()
    }
  })

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                       获取运行中的任务列表                                │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  router.get('/execute/running', (_req: Request, res: Response) => {
    const tasks = taskManager.getRunningTasks()
    res.json({ tasks, count: tasks.length })
  })

  return router
}

export { createExecuteRouter }
