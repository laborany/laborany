/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     LaborAny Electron 主进程                              ║
 * ║                                                                          ║
 * ║  职责：管理窗口、启动 API Sidecar、应用生命周期                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

const { app, BrowserWindow } = require('electron')
const { spawn, execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           全局变量                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
let mainWindow = null
let apiProcess = null
const API_PORT = 3620
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
            console.log(`[Electron] Killing process on port ${port}: PID ${pid}`)
            execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf8' })
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
 * │                           启动 API 服务                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function startApiServer() {
  killProcessOnPort(API_PORT)

  const apiPath = isDev
    ? path.join(__dirname, '..', 'src-api', 'dist', 'laborany-api.exe')
    : path.join(process.resourcesPath, 'api', 'laborany-api.exe')

  if (!fs.existsSync(apiPath)) {
    console.error(`[Electron] API executable not found: ${apiPath}`)
    return
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
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           创建窗口                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'LaborAny',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // 始终从 API 服务器加载（它会服务静态文件）
  const url = `http://localhost:${API_PORT}`
  console.log(`[Electron] Loading: ${url}`)
  mainWindow.loadURL(url)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           应用生命周期                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
app.whenReady().then(() => {
  startApiServer()

  // 等待 API 启动
  setTimeout(() => {
    createWindow()
  }, 2000)

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
  if (apiProcess) {
    apiProcess.kill()
  }
  killProcessOnPort(API_PORT)
})
