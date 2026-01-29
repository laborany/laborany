/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工作流 API 路由                                   ║
 * ║                                                                          ║
 * ║  端点：列表、详情、创建、更新、删除、安装为技能                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Hono } from 'hono'
import { loadWorkflow } from '../core/workflow/index.js'
import { loadSkill } from '../core/agent/skill-loader.js'

const workflow = new Hono()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       获取工作流列表                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
workflow.get('/list', async (c) => {
  const workflows = await loadWorkflow.listAll()
  return c.json({ workflows })
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
 * │                       安装工作流为技能                                     │
 * │  将工作流转化为技能，安装到用户 skills 目录                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
workflow.post('/:workflowId/install', async (c) => {
  const workflowId = c.req.param('workflowId')

  try {
    const result = await loadWorkflow.installAsSkill(workflowId)

    // 清除技能缓存，确保新安装的技能可以被加载
    loadSkill.clearCache()

    return c.json({ success: true, skillId: result.skillId })
  } catch (error) {
    const message = error instanceof Error ? error.message : '安装失败'
    return c.json({ error: message }, 400)
  }
})

export default workflow
