/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流 API 路由                                   ║
 * ║                                                                          ║
 * ║  端点：列表、详情、创建、更新、删除、执行                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { v4 as uuid } from 'uuid'
import { sessionManager } from '../core/agent/index.js'
import {
  loadWorkflow,
  executeWorkflow,
  validateWorkflowInput,
  type WorkflowEvent,
} from '../core/workflow/index.js'

const workflow = new Hono()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取工作流列表                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
workflow.get('/list', async (c) => {
  const workflows = await loadWorkflow.listAll()
  return c.json({ workflows })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取工作流执行历史                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
workflow.get('/history', async (c) => {
  const runs = await loadWorkflow.getHistory()
  return c.json({ runs })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取单次执行详情                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
workflow.get('/run/:runId', async (c) => {
  const runId = c.req.param('runId')
  const run = await loadWorkflow.getRunDetail(runId)
  if (!run) {
    return c.json({ error: '执行记录不存在' }, 404)
  }
  return c.json(run)
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取工作流详情                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
workflow.get('/:workflowId', async (c) => {
  const workflowId = c.req.param('workflowId')
  const workflowData = await loadWorkflow.byId(workflowId)

  if (!workflowData) {
    return c.json({ error: '工作流不存在' }, 404)
  }

  return c.json(workflowData)
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       创建工作流                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
workflow.post('/create', async (c) => {
  const { name, description, icon, steps, input, on_failure } = await c.req.json()

  if (!name || !steps || !Array.isArray(steps) || steps.length === 0) {
    return c.json({ error: '缺少必要参数: name, steps' }, 400)
  }

  const workflowData = await loadWorkflow.create({
    name,
    description: description || '',
    icon,
    steps,
    input: input || {},
    on_failure: on_failure || 'stop',
  })

  return c.json(workflowData)
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       更新工作流                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
workflow.put('/:workflowId', async (c) => {
  const workflowId = c.req.param('workflowId')
  const updates = await c.req.json()

  const workflowData = await loadWorkflow.update(workflowId, updates)
  if (!workflowData) {
    return c.json({ error: '工作流不存在' }, 404)
  }

  return c.json(workflowData)
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       删除工作流                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
workflow.delete('/:workflowId', async (c) => {
  const workflowId = c.req.param('workflowId')
  const success = await loadWorkflow.delete(workflowId)

  if (!success) {
    return c.json({ error: '工作流不存在' }, 404)
  }

  return c.json({ success: true })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       执行工作流 (SSE 流式响应)                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
workflow.post('/:workflowId/execute', async (c) => {
  const workflowId = c.req.param('workflowId')
  const { input, runId: existingRunId } = await c.req.json()

  const workflowData = await loadWorkflow.byId(workflowId)
  if (!workflowData) {
    return c.json({ error: '工作流不存在' }, 404)
  }

  const validation = validateWorkflowInput(workflowData, input || {})
  if (!validation.valid) {
    return c.json({ error: validation.errors.join('; ') }, 400)
  }

  const runId = existingRunId || uuid()
  const abortController = new AbortController()
  sessionManager.register(runId, abortController)

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ data: JSON.stringify({ type: 'run', runId }) })

    try {
      await executeWorkflow({
        workflow: workflowData,
        input: input || {},
        runId,
        signal: abortController.signal,
        onEvent: async (event: WorkflowEvent) => {
          await stream.writeSSE({ data: JSON.stringify(event) })
        },
      })
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        await stream.writeSSE({ data: JSON.stringify({ type: 'workflow_stopped' }) })
      } else {
        const message = error instanceof Error ? error.message : '执行失败'
        await stream.writeSSE({ data: JSON.stringify({ type: 'workflow_error', error: message }) })
      }
    } finally {
      sessionManager.unregister(runId)
    }
  })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       中止工作流执行                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
workflow.post('/stop/:runId', (c) => {
  const runId = c.req.param('runId')
  const stopped = sessionManager.abort(runId)
  return c.json({ success: stopped })
})

export default workflow
