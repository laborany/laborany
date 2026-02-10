/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         Workflows API 路由                              ║
 * ║                                                                          ║
 * ║  职责：处理所有工作流相关的 HTTP 请求                                     ║
 * ║  包含：列表、详情、创建、更新、删除、执行、中止                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Router, Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import { loadWorkflow } from '../workflow/loader.js'
import { executeWorkflow, validateWorkflowInput } from '../workflow/executor.js'
import type { WorkflowEvent } from '../workflow/types.js'
import type { SessionManager } from '../session-manager.js'
import { normalizeCapabilityDisplayName } from 'laborany-shared'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取工作流列表                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function createWorkflowsRouter(sessionManager: SessionManager) {
  const router = Router()

  router.get('/workflows', async (_req: Request, res: Response) => {
    try {
      const workflows = await loadWorkflow.listAll()
      res.json({ workflows })
    } catch (error) {
      res.status(500).json({ error: '无法加载工作流列表' })
    }
  })

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │                       获取工作流详情                                      │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  router.get('/workflows/:workflowId', async (req: Request, res: Response) => {
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
   * │                       创建工作流                                         │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  router.post('/workflows', async (req: Request, res: Response) => {
    const { id, name, description, icon, steps, input, on_failure } = req.body
    const normalizedName = normalizeCapabilityDisplayName(name)

    if (!normalizedName || !steps || !Array.isArray(steps) || steps.length === 0) {
      res.status(400).json({ error: '缺少必要参数: name, steps' })
      return
    }

    try {
      const workflow = await loadWorkflow.create({
        id,
        name: normalizedName,
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
   * │                       更新工作流                                         │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  router.put('/workflows/:workflowId', async (req: Request, res: Response) => {
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
   * │                       删除工作流                                         │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  router.delete('/workflows/:workflowId', async (req: Request, res: Response) => {
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
   * │                       执行工作流 (SSE 流式响应)                          │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  router.post('/workflows/:workflowId/execute', async (req: Request, res: Response) => {
    const { workflowId } = req.params
    const { input, runId: existingRunId } = req.body

    const workflow = await loadWorkflow.byId(workflowId)
    if (!workflow) {
      res.status(404).json({ error: '工作流不存在' })
      return
    }

    const validation = validateWorkflowInput(workflow, input || {})
    if (!validation.valid) {
      res.status(400).json({ error: validation.errors.join('; ') })
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const runId = existingRunId || uuid()
    const abortController = new AbortController()
    sessionManager.register(runId, abortController)

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

      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
      }
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
   * │                       中止工作流执行                                     │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  router.post('/workflows/stop/:runId', (req: Request, res: Response) => {
    const { runId } = req.params
    const stopped = sessionManager.abort(runId)
    res.json({ success: stopped })
  })

  return router
}

export { createWorkflowsRouter }
