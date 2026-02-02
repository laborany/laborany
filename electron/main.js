/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     LaborAny Electron 主进程                              ║
 * ║                                                                          ║
 * ║  职责：管理窗口、启动 API Sidecar、应用生命周期                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

const { app, BrowserWindow } = require('electron')
const { spawn, execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const http = require('http')

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           全局变量                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
let mainWindow = null
let apiProcess = null
let agentProcess = null
const API_PORT = 3620
const AGENT_PORT = 3002
const isDev = !app.isPackaged

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           端口清理                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function killProcessOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const result = execSync(`netstat -ano -p TCP | findstr :${port}`, { encoding: 'utf8' })
      const lines = result.split('\n')
      for (const line of lines) {
        if (line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/)
          const pid = parts[parts.length - 1]
          if (pid && pid !== '0') {
            /* ═════════════════════════════════════════════════════════════════════
             *  使用 /T 参数杀死整个进程树（包括子进程）
             *  这是解决安装时提示未关闭的关键
             * ═════════════════════════════════════════════════════════════════════ */
            console.log(`[Electron] Killing process tree on port ${port}: PID ${pid}`)
            execSync(`taskkill /F /T /PID ${pid}`, { encoding: 'utf8', stdio: 'ignore' })
          }
        }
      }
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { encoding: 'utf8' })
    }
  } catch (e) {
    // 忽略错误（可能没有进程在该端口）
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           检查 API 是否就绪                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function checkApiReady() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${API_PORT}/health`, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 404)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function waitForApi(maxAttempts = 30, interval = 500) {
  for (let i = 0; i < maxAttempts; i++) {
    console.log(`[Electron] Waiting for API... (${i + 1}/${maxAttempts})`)
    if (await checkApiReady()) {
      console.log('[Electron] API is ready!')
      return true
    }
    await new Promise(r => setTimeout(r, interval))
  }
  console.error('[Electron] API failed to start')
  return false
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           启动 API 服务                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function startApiServer() {
  killProcessOnPort(API_PORT)

  // 根据平台选择正确的可执行文件
  const isWin = process.platform === 'win32'
  const apiExeName = isWin ? 'laborany-api.exe' : 'laborany-api'

  const apiPath = isDev
    ? path.join(__dirname, '..', 'src-api', 'dist', apiExeName)
    : path.join(process.resourcesPath, 'api', apiExeName)

  if (!fs.existsSync(apiPath)) {
    console.error(`[Electron] API executable not found: ${apiPath}`)
    return false
  }

  console.log(`[Electron] Starting API server: ${apiPath}`)

  apiProcess = spawn(apiPath, [], {
    env: {
      ...process.env,
      PORT: API_PORT.toString(),
      NODE_ENV: 'production'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  apiProcess.stdout.on('data', (data) => {
    console.log(`[API] ${data.toString().trim()}`)
  })

  apiProcess.stderr.on('data', (data) => {
    console.error(`[API Error] ${data.toString().trim()}`)
  })

  apiProcess.on('close', (code) => {
    console.log(`[API] Process exited with code ${code}`)
  })

  apiProcess.on('error', (err) => {
    console.error(`[API] Failed to start: ${err.message}`)
  })

  return true
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           启动 Agent 服务                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function startAgentServer() {
  killProcessOnPort(AGENT_PORT)

  const isWin = process.platform === 'win32'
  const agentExeName = isWin ? 'laborany-agent.exe' : 'laborany-agent'

  const agentPath = isDev
    ? path.join(__dirname, '..', 'agent-service', 'dist', agentExeName)
    : path.join(process.resourcesPath, 'agent', agentExeName)

  if (!fs.existsSync(agentPath)) {
    console.warn(`[Electron] Agent executable not found: ${agentPath}`)
    console.warn('[Electron] Agent service will not be available')
    return false
  }

  console.log(`[Electron] Starting Agent server: ${agentPath}`)

  agentProcess = spawn(agentPath, [], {
    env: {
      ...process.env,
      PORT: AGENT_PORT.toString(),
      NODE_ENV: 'production'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  agentProcess.stdout.on('data', (data) => {
    console.log(`[Agent] ${data.toString().trim()}`)
  })

  agentProcess.stderr.on('data', (data) => {
    console.error(`[Agent Error] ${data.toString().trim()}`)
  })

  agentProcess.on('close', (code) => {
    console.log(`[Agent] Process exited with code ${code}`)
  })

  agentProcess.on('error', (err) => {
    console.error(`[Agent] Failed to start: ${err.message}`)
  })

  return true
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           创建窗口                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'LaborAny',
    show: false,  // 先隐藏，等加载完成再显示
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  const url = `http://localhost:${API_PORT}`
  console.log(`[Electron] Loading: ${url}`)

  // 加载完成后显示窗口
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.show()
  })

  // 加载失败时显示错误
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`[Electron] Failed to load: ${errorDescription}`)
    mainWindow.loadFile(path.join(__dirname, 'error.html')).catch(() => {
      // 如果没有 error.html，显示空白页面并重试
      setTimeout(() => {
        mainWindow.loadURL(url)
      }, 2000)
    })
  })

  mainWindow.loadURL(url)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           应用生命周期                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/* ═════════════════════════════════════════════════════════════════════
 *  强制杀死所有相关进程
 *  • 用于确保安装时不会有残留进程
 *  • 先杀端口监听进程，再杀 API 进程
 * ═════════════════════════════════════════════════════════════════════ */
function forceCleanup() {
  console.log('[Electron] Force cleanup starting...')
  killProcessOnPort(API_PORT)
  killProcessOnPort(AGENT_PORT)

  if (process.platform === 'win32') {
    /* ┌──────────────────────────────────────────────────────────────────────────┐
     *  Windows 下强制杀死进程树
     *  /T - 杀死指定进程及其子进程
     *  /F - 强制终止
     * └──────────────────────────────────────────────────────────────────────────┘ */
    if (apiProcess && apiProcess.pid) {
      try {
        execSync(`taskkill /F /T /PID ${apiProcess.pid}`, { encoding: 'utf8', stdio: 'ignore' })
        console.log(`[Electron] Killed API process tree: PID ${apiProcess.pid}`)
      } catch (e) {
        console.log('[Electron] API process already exited')
      }
    }
    if (agentProcess && agentProcess.pid) {
      try {
        execSync(`taskkill /F /T /PID ${agentProcess.pid}`, { encoding: 'utf8', stdio: 'ignore' })
        console.log(`[Electron] Killed Agent process tree: PID ${agentProcess.pid}`)
      } catch (e) {
        console.log('[Electron] Agent process already exited')
      }
    }
  } else {
    if (apiProcess) apiProcess.kill()
    if (agentProcess) agentProcess.kill()
  }

  // 再次清理端口，确保子进程也被杀掉
  setTimeout(() => {
    killProcessOnPort(API_PORT)
    killProcessOnPort(AGENT_PORT)
    console.log('[Electron] Force cleanup completed')
  }, 500)
}
app.whenReady().then(async () => {
  const apiStarted = startApiServer()
  startAgentServer()  // Agent 服务可选，不影响主流程

  if (apiStarted) {
    // 等待 API 真正启动
    const ready = await waitForApi()
    if (ready) {
      createWindow()
    } else {
      // API 启动失败，仍然尝试创建窗口（可能会显示错误）
      createWindow()
    }
  } else {
    // API 可执行文件不存在
    createWindow()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  console.log('[Electron] Cleaning up...')
  forceCleanup()
})
