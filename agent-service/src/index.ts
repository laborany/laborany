/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     LaborAny Agent Service                               ║
 * ║                                                                          ║
 * ║  Express 服务入口 - SSE 流式响应                                          ║
 * ║  核心职责：初始化中间件 → 挂载路由 → 启动服务                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { config } from 'dotenv'
import { resolve, dirname, join } from 'path'
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

import express from 'express'
import cors from 'cors'
import { existsSync, mkdirSync } from 'fs'
import { SessionManager } from './session-manager.js'
import { taskManager } from './task-manager.js'
import { DATA_DIR } from './paths.js'
import { startCronTimer } from './cron/index.js'
import {
  memoryRouter, cronRouter, notificationsRouter, filesRouter,
  createSkillsRouter, createExecuteRouter,
  createCapabilitiesRouter,
  converseRouter,
  smartRouter,
} from './routes/index.js'

const app = express()
const PORT = process.env.AGENT_PORT || 3002
const sessionManager = new SessionManager()

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
app.use('/route', smartRouter)
app.use('/converse', converseRouter)
app.use(filesRouter)
app.use(createSkillsRouter(sessionManager))
app.use(createExecuteRouter(sessionManager, taskManager))
app.use(createCapabilitiesRouter(sessionManager))

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
