const { app, BrowserWindow } = require('electron')
const { spawn, execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { createLogger } = require('./app-logger')
const { migrateLegacyAppHomes } = require('./app-home')

let mainWindow = null
let apiProcess = null
let agentProcess = null
let appLogger = null
let isQuitting = false
let isRestartingSidecars = false
let pendingRestartTimer = null

let runtimePaths = {
  bootstrapHome: '',
  appHome: '',
  logsDir: '',
  migrationReportPath: '',
  runtimeMetaPath: '',
  runtimeCommandPath: '',
}

const API_PORT = 3620
const AGENT_PORT = 3002
const isDev = !app.isPackaged

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeJsonFile(filePath, value) {
  ensureDirSync(path.dirname(filePath))
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
}

function normalizeComparablePath(input) {
  const resolved = path.resolve(input)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function isSamePath(a, b) {
  return normalizeComparablePath(a) === normalizeComparablePath(b)
}

function isSubPath(parentPath, candidatePath) {
  const parent = normalizeComparablePath(parentPath)
  const child = normalizeComparablePath(candidatePath)
  if (parent === child) return false
  return child.startsWith(`${parent}${path.sep}`)
}

function setRuntimeHome(nextHome, options = {}) {
  const bootstrapHome = options.bootstrapHome || runtimePaths.bootstrapHome || app.getPath('userData')
  const appHome = path.resolve(nextHome)
  const logsDir = path.join(appHome, 'logs')

  ensureDirSync(bootstrapHome)
  ensureDirSync(appHome)
  ensureDirSync(logsDir)

  runtimePaths = {
    bootstrapHome,
    appHome,
    logsDir,
    migrationReportPath: path.join(appHome, 'migration-report.json'),
    runtimeMetaPath: path.join(bootstrapHome, 'runtime-meta.json'),
    runtimeCommandPath: path.join(bootstrapHome, 'runtime-command.json'),
  }

  process.env.LABORANY_HOME = runtimePaths.appHome
  process.env.LABORANY_LOG_DIR = runtimePaths.logsDir
  process.env.LABORANY_RUNTIME_META_PATH = runtimePaths.runtimeMetaPath
  process.env.LABORANY_RUNTIME_COMMAND_PATH = runtimePaths.runtimeCommandPath
}

function persistRuntimeMeta(appHome) {
  writeJsonFile(runtimePaths.runtimeMetaPath, {
    appHome,
    updatedAt: new Date().toISOString(),
  })
}

function loadInitialRuntimeHome(bootstrapHome) {
  const metaPath = path.join(bootstrapHome, 'runtime-meta.json')
  const meta = readJsonFile(metaPath)
  const savedHome = typeof meta?.appHome === 'string' ? meta.appHome.trim() : ''

  if (savedHome && path.isAbsolute(savedHome)) {
    return path.resolve(savedHome)
  }

  return bootstrapHome
}

function shouldSkipDirName(dirName, skipDirNames) {
  const key = process.platform === 'win32' ? dirName.toLowerCase() : dirName
  return skipDirNames.has(key)
}

function shouldSkipFileName(fileName, skipFileNames) {
  const key = process.platform === 'win32' ? fileName.toLowerCase() : fileName
  return skipFileNames.has(key)
}

function copyFileIfMissing(sourcePath, targetPath, counters, skipFileNames) {
  const fileName = path.basename(sourcePath)
  if (shouldSkipFileName(fileName, skipFileNames)) {
    counters.skipped += 1
    return
  }

  if (fs.existsSync(targetPath)) {
    counters.skipped += 1
    return
  }

  try {
    ensureDirSync(path.dirname(targetPath))
    fs.copyFileSync(sourcePath, targetPath)
    counters.copied += 1
  } catch (error) {
    counters.failed += 1
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`[Electron] Skip file during migration (${fileName}): ${reason}`)
  }
}

function copyDirIncremental(sourceDir, targetDir, counters, options = {}) {
  if (!fs.existsSync(sourceDir)) return

  const skipFileNames = options.skipFileNames || new Set()
  const skipDirNames = options.skipDirNames || new Set()
  const targetInsideSource = isSubPath(sourceDir, targetDir)

  let entries = []
  try {
    entries = fs.readdirSync(sourceDir, { withFileTypes: true })
  } catch (error) {
    counters.failed += 1
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`[Electron] Skip directory during migration (${sourceDir}): ${reason}`)
    return
  }

  for (const entry of entries) {
    const fromPath = path.join(sourceDir, entry.name)
    const toPath = path.join(targetDir, entry.name)

    if (targetInsideSource && isSamePath(fromPath, targetDir)) {
      continue
    }

    if (entry.isDirectory()) {
      if (shouldSkipDirName(entry.name, skipDirNames)) {
        counters.skipped += 1
        continue
      }

      try {
        ensureDirSync(toPath)
      } catch (error) {
        counters.failed += 1
        const reason = error instanceof Error ? error.message : String(error)
        console.warn(`[Electron] Skip target directory during migration (${toPath}): ${reason}`)
        continue
      }

      copyDirIncremental(fromPath, toPath, counters, options)
      continue
    }

    if (entry.isFile()) {
      copyFileIfMissing(fromPath, toPath, counters, skipFileNames)
    }
  }
}

function processRuntimeCommand() {
  const commandPath = runtimePaths.runtimeCommandPath
  const command = readJsonFile(commandPath)

  if (!command || typeof command !== 'object') {
    return false
  }

  try {
    if (command.type !== 'switch-home') {
      console.warn(`[Electron] Unknown runtime command: ${String(command.type)}`)
      return false
    }

    const targetRaw = typeof command.targetHome === 'string' ? command.targetHome.trim() : ''
    if (!targetRaw || !path.isAbsolute(targetRaw)) {
      throw new Error('runtime switch-home targetHome must be an absolute path')
    }

    const currentHome = runtimePaths.appHome
    const targetHome = path.resolve(targetRaw)

    if (isSamePath(currentHome, targetHome)) {
      persistRuntimeMeta(targetHome)
      console.log('[Electron] Runtime home unchanged, metadata refreshed')
      return true
    }

    if (isSubPath(currentHome, targetHome)) {
      throw new Error('target home cannot be a subdirectory of current home')
    }

    ensureDirSync(targetHome)

    const counters = { copied: 0, skipped: 0, failed: 0 }
    copyDirIncremental(currentHome, targetHome, counters, {
      skipFileNames: new Set([
        'runtime-meta.json',
        'runtime-command.json',
        'cookies',
        'cookies-journal',
        'lock',
        'lock-journal',
      ]),
      skipDirNames: new Set([
        'cache',
        'code cache',
        'gpucache',
        'dawncache',
        'shadercache',
        'logs',
        'Logs',
      ]),
    })

    if (counters.failed > 0) {
      throw new Error(`migration failed for ${counters.failed} entries, switch aborted`)
    }

    persistRuntimeMeta(targetHome)
    setRuntimeHome(targetHome, { bootstrapHome: runtimePaths.bootstrapHome })

    console.log(
      `[Electron] Runtime home switched: ${currentHome} -> ${targetHome} (copied=${counters.copied}, skipped=${counters.skipped}, failed=${counters.failed})`,
    )

    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[Electron] Failed to process runtime command: ${message}`)
    return false
  } finally {
    try {
      fs.unlinkSync(commandPath)
    } catch {
      // ignore cleanup failure
    }
  }
}

function buildSidecarEnv(extra = {}) {
  return {
    ...process.env,
    LABORANY_HOME: runtimePaths.appHome || process.env.LABORANY_HOME || '',
    LABORANY_LOG_DIR: runtimePaths.logsDir || process.env.LABORANY_LOG_DIR || '',
    LABORANY_RUNTIME_META_PATH: runtimePaths.runtimeMetaPath || process.env.LABORANY_RUNTIME_META_PATH || '',
    LABORANY_RUNTIME_COMMAND_PATH: runtimePaths.runtimeCommandPath || process.env.LABORANY_RUNTIME_COMMAND_PATH || '',
    ...extra,
  }
}

function initRuntimePathsAndLogger() {
  const bootstrapHome = app.getPath('userData')
  const initialHome = loadInitialRuntimeHome(bootstrapHome)
  setRuntimeHome(initialHome, { bootstrapHome })

  // Apply pending command left by API route before sidecars are started.
  processRuntimeCommand()

  const migration = migrateLegacyAppHomes({
    userDataDir: runtimePaths.appHome,
    appDataDir: app.getPath('appData'),
    homeDir: app.getPath('home'),
  })
  runtimePaths.migrationReportPath = migration.reportPath

  appLogger = createLogger({
    source: 'electron',
    minLevel: 'info',
    retentionDays: 7,
    maxFileSizeMB: 10,
    logRootDir: runtimePaths.logsDir,
  })
  appLogger.patchConsole()
  appLogger.installGlobalErrorHandlers()

  console.log(`[Electron] LABORANY_HOME: ${runtimePaths.appHome}`)
  console.log(`[Electron] LABORANY_LOG_DIR: ${runtimePaths.logsDir}`)
  console.log(`[Electron] LABORANY_RUNTIME_META_PATH: ${runtimePaths.runtimeMetaPath}`)
  console.log(`[Electron] LABORANY_RUNTIME_COMMAND_PATH: ${runtimePaths.runtimeCommandPath}`)
  console.log(`[Electron] migration report: ${runtimePaths.migrationReportPath}`)
}

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
            execSync(`taskkill /F /T /PID ${pid}`, { encoding: 'utf8', stdio: 'ignore' })
          }
        }
      }
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { encoding: 'utf8' })
    }
  } catch {
    // ignore when no process is using this port
  }
}

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
    if (await checkApiReady()) {
      console.log('[Electron] API is ready')
      return true
    }
    await delay(interval)
  }
  console.error('[Electron] API failed to start')
  return false
}

function checkAgentReady() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${AGENT_PORT}/health`, (res) => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function waitForAgent(maxAttempts = 30, interval = 500) {
  for (let i = 0; i < maxAttempts; i++) {
    if (await checkAgentReady()) {
      console.log('[Electron] Agent is ready')
      return true
    }
    await delay(interval)
  }
  console.warn('[Electron] Agent failed to start (non-critical)')
  return false
}

function handleSidecarExit(name, code) {
  if (isQuitting || isRestartingSidecars) return
  scheduleSidecarRestart(`${name} exited (code=${String(code)})`)
}

function startApiServer() {
  killProcessOnPort(API_PORT)

  const isWin = process.platform === 'win32'
  const apiExeName = isWin ? 'laborany-api.exe' : 'laborany-api'

  const apiPath = isDev
    ? path.join(__dirname, '..', 'src-api', 'dist', apiExeName)
    : path.join(process.resourcesPath, 'api', apiExeName)

  if (!fs.existsSync(apiPath)) {
    console.error(`[Electron] API executable not found: ${apiPath}`)
    return false
  }

  const proc = spawn(apiPath, [], {
    env: buildSidecarEnv({
      PORT: API_PORT.toString(),
      NODE_ENV: 'production',
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  apiProcess = proc
  appLogger?.attachChildProcessLogs(proc, 'api', 'api-sidecar')

  proc.stdout.on('data', (data) => {
    console.log(`[API] ${data.toString().trim()}`)
  })

  proc.stderr.on('data', (data) => {
    console.error(`[API Error] ${data.toString().trim()}`)
  })

  proc.on('close', (code) => {
    if (apiProcess === proc) {
      apiProcess = null
    }
    console.log(`[API] Process exited with code ${String(code)}`)
    handleSidecarExit('api', code)
  })

  proc.on('error', (err) => {
    console.error(`[API] Failed to start: ${err.message}`)
  })

  return true
}

function startAgentServer() {
  killProcessOnPort(AGENT_PORT)

  const isWin = process.platform === 'win32'
  const agentExeName = isWin ? 'laborany-agent.exe' : 'laborany-agent'

  const agentPath = isDev
    ? path.join(__dirname, '..', 'agent-service', 'dist', agentExeName)
    : path.join(process.resourcesPath, 'agent', agentExeName)

  if (!fs.existsSync(agentPath)) {
    console.warn(`[Electron] Agent executable not found: ${agentPath}`)
    return false
  }

  const sqliteBindingPath = isDev
    ? path.join(__dirname, '..', 'agent-service', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')
    : path.join(process.resourcesPath, 'agent', 'better_sqlite3.node')

  const proc = spawn(agentPath, [], {
    env: buildSidecarEnv({
      AGENT_PORT: AGENT_PORT.toString(),
      NODE_ENV: 'production',
      BETTER_SQLITE3_BINDING: sqliteBindingPath,
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  agentProcess = proc
  appLogger?.attachChildProcessLogs(proc, 'agent', 'agent-sidecar')

  proc.stdout.on('data', (data) => {
    console.log(`[Agent] ${data.toString().trim()}`)
  })

  proc.stderr.on('data', (data) => {
    console.error(`[Agent Error] ${data.toString().trim()}`)
  })

  proc.on('close', (code) => {
    if (agentProcess === proc) {
      agentProcess = null
    }
    console.log(`[Agent] Process exited with code ${String(code)}`)
    handleSidecarExit('agent', code)
  })

  proc.on('error', (err) => {
    console.error(`[Agent] Failed to start: ${err.message}`)
  })

  return true
}

async function stopSidecars() {
  const api = apiProcess
  const agent = agentProcess
  apiProcess = null
  agentProcess = null

  if (process.platform === 'win32') {
    if (api?.pid) {
      try {
        execSync(`taskkill /F /T /PID ${api.pid}`, { encoding: 'utf8', stdio: 'ignore' })
      } catch {
        // ignore
      }
    }
    if (agent?.pid) {
      try {
        execSync(`taskkill /F /T /PID ${agent.pid}`, { encoding: 'utf8', stdio: 'ignore' })
      } catch {
        // ignore
      }
    }
  } else {
    try {
      api?.kill('SIGTERM')
    } catch {
      // ignore
    }
    try {
      agent?.kill('SIGTERM')
    } catch {
      // ignore
    }
  }

  await delay(300)
  killProcessOnPort(API_PORT)
  killProcessOnPort(AGENT_PORT)
}

async function restartSidecars(reason) {
  if (isRestartingSidecars || isQuitting) return

  isRestartingSidecars = true
  console.log(`[Electron] Restarting sidecars: ${reason}`)

  try {
    await stopSidecars()

    processRuntimeCommand()

    const apiStarted = startApiServer()
    const agentStarted = startAgentServer()

    if (apiStarted) {
      await waitForApi(60, 500)
    }
    if (agentStarted) {
      await waitForAgent(40, 500)
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reloadIgnoringCache()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[Electron] Failed to restart sidecars: ${message}`)
  } finally {
    isRestartingSidecars = false
  }
}

function scheduleSidecarRestart(reason) {
  if (isQuitting) return
  if (pendingRestartTimer) return

  pendingRestartTimer = setTimeout(() => {
    pendingRestartTimer = null
    void restartSidecars(reason)
  }, 600)
}

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'src-tauri', 'icons', 'icon.png')
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'LaborAny',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  const url = `http://localhost:${API_PORT}`
  console.log(`[Electron] Loading: ${url}`)

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.show()
  })

  mainWindow.webContents.on('did-fail-load', () => {
    mainWindow.loadFile(path.join(__dirname, 'error.html')).catch(() => {
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

function forceCleanup() {
  console.log('[Electron] Force cleanup starting')
  killProcessOnPort(API_PORT)
  killProcessOnPort(AGENT_PORT)

  if (process.platform === 'win32') {
    if (apiProcess?.pid) {
      try {
        execSync(`taskkill /F /T /PID ${apiProcess.pid}`, { encoding: 'utf8', stdio: 'ignore' })
      } catch {
        // ignore
      }
    }
    if (agentProcess?.pid) {
      try {
        execSync(`taskkill /F /T /PID ${agentProcess.pid}`, { encoding: 'utf8', stdio: 'ignore' })
      } catch {
        // ignore
      }
    }
  } else {
    try {
      apiProcess?.kill()
    } catch {
      // ignore
    }
    try {
      agentProcess?.kill()
    } catch {
      // ignore
    }
  }

  apiProcess = null
  agentProcess = null

  setTimeout(() => {
    killProcessOnPort(API_PORT)
    killProcessOnPort(AGENT_PORT)
    console.log('[Electron] Force cleanup completed')
  }, 400)
}

app.whenReady().then(async () => {
  initRuntimePathsAndLogger()

  const apiStarted = startApiServer()
  const agentStarted = startAgentServer()

  if (apiStarted) {
    const [apiReady, agentReady] = await Promise.all([
      waitForApi(),
      agentStarted ? waitForAgent() : Promise.resolve(false),
    ])

    if (apiReady && agentReady) {
      console.log('[Electron] API and Agent are ready')
    } else if (apiReady) {
      console.log('[Electron] API ready, Agent unavailable')
    }
  }

  createWindow()

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
  isQuitting = true
  if (pendingRestartTimer) {
    clearTimeout(pendingRestartTimer)
    pendingRestartTimer = null
  }
  forceCleanup()
})
