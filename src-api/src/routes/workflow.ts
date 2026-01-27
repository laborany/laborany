/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流 API 路由                                   ║
 * ║                                                                          ║
 * ║  端点：列表、详情、创建、更新、删除、执行                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { v4 as uuid } from 'uuid'
import { sessionManager } from '../core/agent/index.js'
import { dbHelper } from '../core/database.js'
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
  const runs = dbHelper.query<{
    id: string
    workflow_id: string
    status: string
    input: string
    current_step: number
    total_steps: number
    started_at: string
    completed_at: string | null
  }>(`
    SELECT id, workflow_id, status, input, current_step, total_steps, started_at, completed_at
    FROM workflow_runs
    ORDER BY started_at DESC
    LIMIT 50
  `)

  // 获取工作流名称和图标
  const enrichedRuns = await Promise.all(runs.map(async (run) => {
    const wf = await loadWorkflow.byId(run.workflow_id)
    return {
      id: run.id,
      workflowId: run.workflow_id,
      workflowName: wf?.name || run.workflow_id,
      workflowIcon: wf?.icon,
      status: run.status,
      input: JSON.parse(run.input || '{}'),
      currentStep: run.current_step,
      totalSteps: run.total_steps,
      startedAt: run.started_at,
      completedAt: run.completed_at,
    }
  }))

  return c.json({ runs: enrichedRuns })
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取单次执行详情                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
workflow.get('/run/:runId', async (c) => {
  const runId = c.req.param('runId')

  const run = dbHelper.get<{
    id: string
    workflow_id: string
    status: string
    input: string
    context: string | null
    current_step: number
    total_steps: number
    started_at: string
    completed_at: string | null
  }>(`SELECT * FROM workflow_runs WHERE id = ?`, [runId])

  if (!run) {
    return c.json({ error: '执行记录不存在' }, 404)
  }

  const steps = dbHelper.query<{
    step_index: number
    skill_id: string
    session_id: string | null
    status: string
    output: string | null
    error: string | null
    started_at: string | null
    completed_at: string | null
  }>(`SELECT * FROM workflow_step_runs WHERE run_id = ? ORDER BY step_index`, [runId])

  const wf = await loadWorkflow.byId(run.workflow_id)

  return c.json({
    id: run.id,
    workflowId: run.workflow_id,
    workflowName: wf?.name || run.workflow_id,
    workflowIcon: wf?.icon,
    status: run.status,
    input: JSON.parse(run.input || '{}'),
    context: run.context ? JSON.parse(run.context) : null,
    currentStep: run.current_step,
    totalSteps: run.total_steps,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    steps: steps.map(s => ({
      stepIndex: s.step_index,
      skillId: s.skill_id,
      sessionId: s.session_id,
      status: s.status,
      output: s.output,
      error: s.error,
      startedAt: s.started_at,
      completedAt: s.completed_at,
    })),
  })
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

  // 创建执行记录
  dbHelper.run(`
    INSERT INTO workflow_runs (id, workflow_id, user_id, status, input, total_steps)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [runId, workflowId, 'default', 'running', JSON.stringify(input || {}), workflowData.steps.length])

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ data: JSON.stringify({ type: 'run', runId }) })

    let finalStatus = 'completed'

    try {
      await executeWorkflow({
        workflow: workflowData,
        input: input || {},
        runId,
        signal: abortController.signal,
        onEvent: async (event: WorkflowEvent) => {
          await stream.writeSSE({ data: JSON.stringify(event) })

          // 保存步骤状态到数据库
          if (event.type === 'step_start') {
            dbHelper.run(`
              INSERT INTO workflow_step_runs (run_id, step_index, skill_id, status, started_at)
              VALUES (?, ?, ?, ?, datetime('now'))
            `, [runId, event.stepIndex, event.skillId, 'running'])
            dbHelper.run(`UPDATE workflow_runs SET current_step = ? WHERE id = ?`, [event.stepIndex, runId])
          } else if (event.type === 'step_done') {
            const result = event.result as { output?: string; sessionId?: string }
            dbHelper.run(`
              UPDATE workflow_step_runs
              SET status = 'completed', output = ?, session_id = ?, completed_at = datetime('now')
              WHERE run_id = ? AND step_index = ?
            `, [result?.output || '', result?.sessionId || '', runId, event.stepIndex])
          } else if (event.type === 'step_error') {
            dbHelper.run(`
              UPDATE workflow_step_runs
              SET status = 'failed', error = ?, completed_at = datetime('now')
              WHERE run_id = ? AND step_index = ?
            `, [event.error, runId, event.stepIndex])
          } else if (event.type === 'workflow_done') {
            finalStatus = 'completed'
          } else if (event.type === 'workflow_error') {
            finalStatus = 'failed'
          } else if (event.type === 'workflow_stopped') {
            finalStatus = 'stopped'
          }
        },
      })
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        finalStatus = 'stopped'
        await stream.writeSSE({ data: JSON.stringify({ type: 'workflow_stopped' }) })
      } else {
        finalStatus = 'failed'
        const message = error instanceof Error ? error.message : '执行失败'
        await stream.writeSSE({ data: JSON.stringify({ type: 'workflow_error', error: message }) })
      }
    } finally {
      // 更新执行记录状态
      dbHelper.run(`
        UPDATE workflow_runs SET status = ?, completed_at = datetime('now') WHERE id = ?
      `, [finalStatus, runId])
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
