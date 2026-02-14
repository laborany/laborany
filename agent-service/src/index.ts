import express from 'express'
import cors from 'cors'
import { existsSync, mkdirSync } from 'fs'
import { SessionManager } from './session-manager.js'
import { taskManager } from './task-manager.js'
import { DATA_DIR } from './paths.js'
import { startCronTimer } from './cron/index.js'
import { memoryAsyncQueue } from './memory/index.js'
import { refreshRuntimeConfig } from './runtime-config.js'
import {
  memoryRouter,
  cronRouter,
  notificationsRouter,
  filesRouter,
  createSkillsRouter,
  createExecuteRouter,
  createCapabilitiesRouter,
  converseRouter,
  smartRouter,
} from './routes/index.js'

const runtimeConfig = refreshRuntimeConfig()
console.log(`[Agent Service] Loaded runtime env from: ${runtimeConfig.loadedFrom.join(', ') || 'none'}`)

const app = express()
const PORT = process.env.AGENT_PORT || 3002
const sessionManager = new SessionManager()

app.use(cors())
app.use(express.json())

app.use(memoryRouter)
app.use('/cron', cronRouter)
app.use('/notifications', notificationsRouter)
app.use('/route', smartRouter)
app.use('/converse', converseRouter)
app.use(filesRouter)
app.use(createSkillsRouter(sessionManager))
app.use(createExecuteRouter(sessionManager, taskManager))
app.use(createCapabilitiesRouter(sessionManager))

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true })
}

app.listen(PORT, () => {
  console.log(`[Agent Service] 运行在 http://localhost:${PORT}`)
  console.log(`[Agent Service] 数据目录: ${DATA_DIR}`)
  startCronTimer()
})

let shuttingDown = false

async function gracefulShutdown(signal: 'SIGINT' | 'SIGTERM'): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true

  try {
    console.log(`[Agent Service] Received ${signal}, draining memory queue...`)
    const result = await memoryAsyncQueue.drain(5000)
    if (result.drained) {
      console.log('[Agent Service] Memory queue drained')
    } else {
      console.warn(`[Agent Service] Memory queue drain timeout, pending=${result.pending}`)
    }
  } catch (error) {
    console.error('[Agent Service] Failed to drain memory queue:', error)
  } finally {
    process.exit(0)
  }
}

process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT')
})

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM')
})
