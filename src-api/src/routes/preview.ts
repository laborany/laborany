/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       Live Preview API 路由                               ║
 * ║                                                                          ║
 * ║  提供 Vite 预览服务器的启动、停止、状态查询接口                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { Hono } from 'hono'
import { getPreviewManager, isNodeAvailable } from '../services/preview.js'

const preview = new Hono()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       POST /start - 启动预览                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
preview.post('/start', async (c) => {
  console.log('[Preview API] POST /start 收到请求')

  // 检查 Node.js 是否可用
  const nodeAvailable = isNodeAvailable()
  console.log('[Preview API] Node.js 可用:', nodeAvailable)

  if (!nodeAvailable) {
    console.log('[Preview API] 错误: Node.js 不可用')
    return c.json({
      id: '',
      taskId: '',
      status: 'error',
      error: 'Live Preview 需要系统安装 Node.js',
    }, 400)
  }

  const body = await c.req.json<{ taskId: string; workDir: string }>()
  const { taskId, workDir } = body
  console.log('[Preview API] 请求参数: taskId=', taskId, 'workDir=', workDir)

  if (!taskId || !workDir) {
    console.log('[Preview API] 错误: 缺少参数')
    return c.json({
      id: '',
      taskId: taskId || '',
      status: 'error',
      error: '缺少 taskId 或 workDir 参数',
    }, 400)
  }

  const manager = getPreviewManager()
  console.log('[Preview API] 调用 manager.startPreview')
  const status = await manager.startPreview(taskId, workDir)
  console.log('[Preview API] startPreview 返回:', JSON.stringify(status))
  return c.json(status)
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       POST /stop - 停止预览                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
preview.post('/stop', async (c) => {
  const body = await c.req.json<{ taskId: string }>()
  const { taskId } = body

  if (!taskId) {
    return c.json({
      id: '',
      taskId: '',
      status: 'error',
      error: '缺少 taskId 参数',
    }, 400)
  }

  const manager = getPreviewManager()
  const status = await manager.stopPreview(taskId)
  return c.json(status)
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       GET /status/:taskId - 查询状态                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */
preview.get('/status/:taskId', (c) => {
  const taskId = c.req.param('taskId')
  console.log('[Preview API] GET /status/', taskId)
  const manager = getPreviewManager()
  const status = manager.getStatus(taskId)
  console.log('[Preview API] 状态:', JSON.stringify(status))
  return c.json(status)
})

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       GET /check - 检查 Node.js 可用性                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
preview.get('/check', (c) => {
  return c.json({ available: isNodeAvailable() })
})

export default preview
