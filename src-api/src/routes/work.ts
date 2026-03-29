import { Hono } from 'hono'
import { dbHelper } from '../core/database.js'
import { runtimeTaskManager } from '../core/agent/index.js'
import { getWorkDetail, listWorks } from '../core/work-items.js'

const work = new Hono()

work.get('/', (c) => {
  return c.json({ works: listWorks(100) })
})

work.get('/:workId', (c) => {
  const workId = c.req.param('workId')
  const detail = getWorkDetail(workId)
  if (!detail.work) {
    return c.json({ error: '工作不存在' }, 404)
  }
  return c.json(detail)
})

work.delete('/:workId', (c) => {
  const workId = c.req.param('workId')
  const detail = getWorkDetail(workId)
  if (!detail.work) {
    return c.json({ error: '工作不存在' }, 404)
  }

  const running = detail.sessions.find((session) => {
    if (runtimeTaskManager.getStatus(session.id)?.isRunning) return true
    return false
  })
  if (running) {
    return c.json({ error: '无法删除正在运行的工作，请先停止任务' }, 400)
  }

  for (const session of detail.sessions) {
    dbHelper.run(`DELETE FROM messages WHERE session_id = ?`, [session.id])
    dbHelper.run(`DELETE FROM sessions WHERE id = ?`, [session.id])
  }
  dbHelper.run(`DELETE FROM works WHERE id = ?`, [workId])

  return c.json({ success: true })
})

export default work
