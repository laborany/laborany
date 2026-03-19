#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const net = require('net')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const { createRequire } = require('module')

const rootDir = path.resolve(__dirname, '..')
const frontendDir = path.join(rootDir, 'frontend')
const apiDir = path.join(rootDir, 'src-api')
const agentDir = path.join(rootDir, 'agent-service')

const argv = process.argv.slice(2)
const args = new Set(argv)
const forceBuild = args.has('--build')
const keepRoot = args.has('--keep-root')
const keepLogs = args.has('--keep-logs')
const profileArgIndex = argv.indexOf('--profile')
const forcedProfileSelector = profileArgIndex >= 0 ? (argv[profileArgIndex + 1] || '').trim() : ''

const ports = {
  api: 3728,
  agent: 3110,
}

const urls = {
  api: `http://127.0.0.1:${ports.api}`,
  agent: `http://127.0.0.1:${ports.agent}`,
}

const PLAYWRIGHT_VERSION = '1.52.0'
const WIDGET_PROMPT = '请不要写文件，直接用一个交互式组件解释复利，并给出可操作的复利计算器。'
const FULL_STREAM_LIVE_WAIT_MS = 60000
const FINAL_ONLY_LIVE_WAIT_MS = 180000
const FULL_STREAM_WIDGET_WAIT_MS = 240000
const FINAL_ONLY_WIDGET_WAIT_MS = 420000
const FULL_STREAM_PERSIST_WAIT_MS = 240000
const FINAL_ONLY_PERSIST_WAIT_MS = 420000

function log(message) {
  console.log(`[verify-execute-widget-real] ${message}`)
}

function fail(message) {
  throw new Error(message)
}

function assert(condition, message) {
  if (!condition) fail(message)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function run(command, commandArgs, cwd, extraEnv) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    fail(`Command failed: ${command} ${commandArgs.join(' ')}`)
  }
}

function getRealAppHome() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'laborany')
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'laborany')
  }
  return path.join(os.homedir(), '.config', 'laborany')
}

function upsertEnvValue(content, key, value) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const line = `${key}=${value}`
  const matcher = new RegExp(`^${escaped}=.*$`, 'm')
  if (matcher.test(content)) {
    return content.replace(matcher, line)
  }
  const normalized = content.endsWith('\n') || content.length === 0 ? content : `${content}\n`
  return `${normalized}${line}\n`
}

function readRealEnv(realHome) {
  const envPath = path.join(realHome, '.env')
  assert(fs.existsSync(envPath), `Missing app env file: ${envPath}`)
  return fs.readFileSync(envPath, 'utf8')
}

function writeProfile(targetDir, realHome) {
  const profilePath = path.join(realHome, 'profile.json')
  if (fs.existsSync(profilePath)) {
    fs.copyFileSync(profilePath, path.join(targetDir, 'profile.json'))
    return
  }

  const now = new Date().toISOString()
  fs.writeFileSync(path.join(targetDir, 'profile.json'), JSON.stringify({
    name: 'Execute Widget Test User',
    createdAt: now,
    updatedAt: now,
  }, null, 2), 'utf8')
}

function copyModelProfiles(realHome, apiDataDir) {
  const sourcePath = path.join(realHome, 'model-profiles.json')
  if (!fs.existsSync(sourcePath)) return []

  const raw = fs.readFileSync(sourcePath, 'utf8')
  fs.writeFileSync(path.join(apiDataDir, 'model-profiles.json'), raw, 'utf8')

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed.profiles) ? parsed.profiles : []
  } catch {
    return []
  }
}

const OFFICIAL_ANTHROPIC_BASE_URL_RE = /^https?:\/\/(?:[^/]+\.)?anthropic\.com(?:\/|$)/i
const OPENAI_COMPAT_TEXT_FIRST_MODEL_RE = /(?:^|[-_])o1(?:$|[-_])|(?:^|[-_])o3(?:$|[-_])|qwq/i
const EXECUTE_WIDGET_STALL_MODEL_RE = /deepseek.*reasoner|deepseek-reasoner/i

function normalizeInterfaceType(value) {
  return value === 'openai_compatible' ? 'openai_compatible' : 'anthropic'
}

function isTextFirstOpenAiModel(model) {
  const normalized = typeof model === 'string' ? model.trim() : ''
  return normalized ? OPENAI_COMPAT_TEXT_FIRST_MODEL_RE.test(normalized) : false
}

function isKnownExecuteWidgetStallModel(model) {
  const normalized = typeof model === 'string' ? model.trim() : ''
  return normalized ? EXECUTE_WIDGET_STALL_MODEL_RE.test(normalized) : false
}

function isOfficialAnthropicBaseUrl(baseUrl) {
  const normalized = typeof baseUrl === 'string' ? baseUrl.trim() : ''
  return !normalized || OFFICIAL_ANTHROPIC_BASE_URL_RE.test(normalized)
}

function getWidgetProfileSupport(profile) {
  const interfaceType = normalizeInterfaceType(profile?.interfaceType)
  const model = typeof profile?.model === 'string' ? profile.model.trim().toLowerCase() : ''

  if (interfaceType === 'openai_compatible') {
    if (isTextFirstOpenAiModel(model) || isKnownExecuteWidgetStallModel(model)) {
      return {
        enabled: false,
        capability: 'disabled',
        provider: 'openai_compatible',
      }
    }
    return {
      enabled: true,
      capability: 'final_only',
      provider: 'openai_compatible',
    }
  }

  const provider = isOfficialAnthropicBaseUrl(profile?.baseUrl)
    ? 'anthropic_official'
    : 'anthropic_compatible'

  return {
    enabled: true,
    capability: provider === 'anthropic_official' && (!model || model.startsWith('claude'))
      ? 'full_stream'
      : 'final_only',
    provider,
  }
}

function getWidgetProfilePriority(profile) {
  const support = getWidgetProfileSupport(profile)
  if (!support.enabled) return -1
  if (support.capability === 'full_stream') return 300
  const model = typeof profile?.model === 'string' ? profile.model.trim().toLowerCase() : ''
  if (support.provider === 'anthropic_compatible' && model.startsWith('claude')) return 275
  if (support.provider === 'anthropic_compatible') return 250
  if (support.provider === 'openai_compatible') return 200
  return 100
}

function pickCliWidgetProfile(profiles) {
  const ranked = profiles
    .map((profile, index) => ({ profile, index, priority: getWidgetProfilePriority(profile) }))
    .filter(item => item.priority >= 0)
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      return a.index - b.index
    })[0]

  return ranked?.profile || null
}

function findProfileBySelector(profiles, selector) {
  const normalized = (selector || '').trim().toLowerCase()
  if (!normalized) return null
  return profiles.find((profile) => {
    const id = typeof profile?.id === 'string' ? profile.id.trim().toLowerCase() : ''
    const name = typeof profile?.name === 'string' ? profile.name.trim().toLowerCase() : ''
    return id === normalized || name === normalized
  }) || null
}

function getExecuteSupportLabel(profile) {
  const support = getWidgetProfileSupport(profile)
  if (!support.enabled) return '执行: 文本模式'
  return support.capability === 'full_stream'
    ? '执行: 实时流式'
    : '执行: 完成后显示'
}

function seedAgentHome(realHome, agentHome) {
  fs.mkdirSync(agentHome, { recursive: true })
  let envContent = readRealEnv(realHome)
  envContent = upsertEnvValue(envContent, 'AGENT_PORT', String(ports.agent))
  envContent = upsertEnvValue(envContent, 'SRC_API_BASE_URL', `${urls.api}/api`)
  envContent = upsertEnvValue(envContent, 'FEISHU_ENABLED', 'false')
  envContent = upsertEnvValue(envContent, 'QQ_ENABLED', 'false')
  envContent = upsertEnvValue(envContent, 'NOTIFY_ON_SUCCESS', 'false')
  envContent = upsertEnvValue(envContent, 'NOTIFY_ON_ERROR', 'false')
  fs.writeFileSync(path.join(agentHome, '.env'), envContent, 'utf8')

  fs.mkdirSync(path.join(agentHome, 'data', 'memory', 'profiles'), { recursive: true })
  writeProfile(agentHome, realHome)
}

function seedApiCwd(realHome, apiCwd) {
  const dataDir = path.join(apiCwd, 'data')
  fs.mkdirSync(dataDir, { recursive: true })

  let envContent = readRealEnv(realHome)
  envContent = upsertEnvValue(envContent, 'PORT', String(ports.api))
  envContent = upsertEnvValue(envContent, 'AGENT_SERVICE_URL', urls.agent)
  envContent = upsertEnvValue(envContent, 'FEISHU_ENABLED', 'false')
  envContent = upsertEnvValue(envContent, 'QQ_ENABLED', 'false')
  envContent = upsertEnvValue(envContent, 'NOTIFY_ON_SUCCESS', 'false')
  envContent = upsertEnvValue(envContent, 'NOTIFY_ON_ERROR', 'false')
  fs.writeFileSync(path.join(dataDir, '.env'), envContent, 'utf8')

  writeProfile(dataDir, realHome)
  return copyModelProfiles(realHome, dataDir)
}

function removeDir(dirPath) {
  if (!dirPath) return
  fs.rmSync(dirPath, { recursive: true, force: true })
}

function getTsxPath() {
  return path.join(agentDir, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx')
}

function ensureArtifacts() {
  const frontendIndex = path.join(frontendDir, 'dist', 'index.html')
  const apiBundle = path.join(apiDir, 'dist', 'bundle.cjs')
  const tsxPath = getTsxPath()

  if (forceBuild || !fs.existsSync(frontendIndex)) {
    log('Building frontend dist')
    run('npm', ['--prefix', 'frontend', 'run', 'build'], rootDir)
  }

  if (forceBuild || !fs.existsSync(apiBundle)) {
    log('Building src-api bundle')
    run('npm', ['--prefix', 'src-api', 'run', 'build:bundle'], rootDir)
  }

  assert(fs.existsSync(frontendIndex), `Missing frontend dist: ${frontendIndex}`)
  assert(fs.existsSync(apiBundle), `Missing src-api bundle: ${apiBundle}`)
  assert(fs.existsSync(tsxPath), `Missing tsx binary: ${tsxPath}`)
}

async function isPortFree(port) {
  return await new Promise(resolve => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

async function ensurePortsFree() {
  for (const port of Object.values(ports)) {
    const free = await isPortFree(port)
    assert(free, `Port ${port} is already in use; please stop the existing process and rerun`)
  }
}

function startChild(label, spec, env, logDir) {
  fs.mkdirSync(logDir, { recursive: true })
  const logPath = path.join(logDir, `${label}.log`)
  const stream = fs.createWriteStream(logPath, { flags: 'a' })
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', chunk => stream.write(chunk))
  child.stderr.on('data', chunk => stream.write(chunk))

  return { child, logPath, stream }
}

async function stopChild(childHandle) {
  if (!childHandle) return
  const { child, stream } = childHandle
  if (child && child.exitCode === null && !child.killed) {
    child.kill('SIGTERM')
    const startedAt = Date.now()
    while (child.exitCode === null && Date.now() - startedAt < 5000) {
      await sleep(100)
    }
    if (child.exitCode === null) {
      child.kill('SIGKILL')
      const killStartedAt = Date.now()
      while (child.exitCode === null && Date.now() - killStartedAt < 2000) {
        await sleep(100)
      }
    }
  }
  if (stream) {
    await new Promise(resolve => stream.end(resolve))
  }
}

async function requestJson(baseUrl, routePath, options) {
  const res = await fetch(`${baseUrl}${routePath}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options && options.headers ? options.headers : {}),
    },
  })

  const rawText = await res.text()
  let data = null
  if (rawText) {
    try {
      data = JSON.parse(rawText)
    } catch {
      data = rawText
    }
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
    rawText,
  }
}

async function waitForHttp(url, matcher, logPath, timeoutMs = 60000) {
  const startedAt = Date.now()
  let lastError = ''

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url)
      const rawText = await res.text()
      let data = null
      if (rawText) {
        try {
          data = JSON.parse(rawText)
        } catch {
          data = rawText
        }
      }
      if (matcher({ ok: res.ok, status: res.status, data, rawText })) return
      lastError = `status=${res.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await sleep(250)
  }

  const logTail = fs.existsSync(logPath)
    ? fs.readFileSync(logPath, 'utf8').split(/\r?\n/).slice(-120).join('\n')
    : '(log missing)'
  fail(`Timed out waiting for ${url}: ${lastError}\n${logTail}`)
}

async function waitForCondition(label, fn, timeoutMs = 120000) {
  const startedAt = Date.now()
  let lastError = ''
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await fn()
      if (result) return result
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await sleep(250)
  }
  fail(`Timed out waiting for ${label}${lastError ? `: ${lastError}` : ''}`)
}

function searchPlaywrightInNpxCache(baseDir) {
  if (!fs.existsSync(baseDir)) return ''

  let entries = []
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true })
  } catch {
    return ''
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidate = path.join(baseDir, entry.name, 'node_modules', 'playwright', 'package.json')
    if (fs.existsSync(candidate)) return candidate
  }

  return ''
}

function findPlaywrightPackagePath() {
  try {
    return require.resolve('playwright/package.json', { paths: [rootDir] })
  } catch {}

  const npmCache = path.join(os.homedir(), '.npm', '_npx')
  return searchPlaywrightInNpxCache(npmCache)
}

function ensurePlaywrightPackage() {
  let packagePath = findPlaywrightPackagePath()
  if (packagePath) return packagePath

  log(`Bootstrapping Playwright ${PLAYWRIGHT_VERSION} into npx cache`)
  run('npx', ['-y', `playwright@${PLAYWRIGHT_VERSION}`, '--version'], rootDir)
  packagePath = findPlaywrightPackagePath()
  assert(packagePath, 'Unable to locate Playwright package after npx bootstrap')
  return packagePath
}

function loadPlaywright() {
  const packagePath = ensurePlaywrightPackage()
  const localRequire = createRequire(packagePath)
  return localRequire('playwright')
}

async function launchBrowser(playwright) {
  const { chromium } = playwright

  try {
    return await chromium.launch({ headless: true, channel: 'chrome' })
  } catch {
    return await chromium.launch({ headless: true })
  }
}

async function listSessions(baseUrl) {
  const res = await requestJson(baseUrl, '/api/sessions')
  assert(res.ok, `GET /api/sessions failed: ${res.rawText}`)
  return Array.isArray(res.data) ? res.data : []
}

async function waitForNewExecuteSession(baseUrl, previousIds) {
  return await waitForCondition('new execute session id', async () => {
    const sessions = await listSessions(baseUrl)
    const newest = sessions
      .filter(item =>
        item
        && typeof item.id === 'string'
        && item.skill_id === '__generic__'
        && !previousIds.has(item.id),
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    return newest?.id || null
  }, 30000)
}

async function fetchSessionDetail(baseUrl, sessionId) {
  const res = await requestJson(baseUrl, `/api/sessions/${encodeURIComponent(sessionId)}`)
  assert(res.ok, `GET /api/sessions/${sessionId} failed: ${res.rawText}`)
  return res.data
}

async function waitForPersistedExecuteWidget(baseUrl, sessionId) {
  return await waitForCondition('persisted execute widget session detail', async () => {
    const detail = await fetchSessionDetail(baseUrl, sessionId)
    const messages = Array.isArray(detail?.messages) ? detail.messages : []
    const widgetMessage = messages.find(item =>
      item
      && typeof item === 'object'
      && item.meta
      && item.meta.widget
      && typeof item.meta.widget.html === 'string'
      && item.meta.widget.html.length > 100,
    )
    if (!widgetMessage) return null
    if (detail?.status !== 'completed') return null
    return detail
  }, 240000)
}

async function waitForPersistedExecuteWidgetWithTimeout(baseUrl, sessionId, timeoutMs) {
  return await waitForCondition('persisted execute widget session detail', async () => {
    const detail = await fetchSessionDetail(baseUrl, sessionId)
    const messages = Array.isArray(detail?.messages) ? detail.messages : []
    const widgetMessage = messages.find(item =>
      item
      && typeof item === 'object'
      && item.meta
      && item.meta.widget
      && typeof item.meta.widget.html === 'string'
      && item.meta.widget.html.length > 100,
    )
    if (!widgetMessage) return null
    if (detail?.status !== 'completed') return null
    return detail
  }, timeoutMs)
}

async function waitForCompletedExecuteSession(baseUrl, sessionId) {
  return await waitForCondition('completed execute session detail', async () => {
    const detail = await fetchSessionDetail(baseUrl, sessionId)
    if (detail?.status !== 'completed') return null
    const messages = Array.isArray(detail?.messages) ? detail.messages : []
    const assistantMessage = messages.find(item =>
      item
      && item.type === 'assistant'
      && typeof item.content === 'string'
      && /复利/.test(item.content),
    )
    return assistantMessage ? detail : null
  }, 240000)
}

async function main() {
  let tempRoot = ''
  let agentHandle = null
  let apiHandle = null
  let browser = null

  try {
    await ensurePortsFree()
    ensureArtifacts()

    const realHome = getRealAppHome()
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'laborany-execute-widget-real-'))
    const agentHome = path.join(tempRoot, 'agent-home')
    const apiCwd = path.join(tempRoot, 'api-cwd')
    const logDir = path.join(tempRoot, 'logs')

    seedAgentHome(realHome, agentHome)
    const modelProfiles = seedApiCwd(realHome, apiCwd)
    const widgetProfile = forcedProfileSelector
      ? findProfileBySelector(modelProfiles, forcedProfileSelector)
      : pickCliWidgetProfile(modelProfiles)
    assert(
      widgetProfile?.id,
      forcedProfileSelector
        ? `verify-execute-widget-real could not find the requested profile: ${forcedProfileSelector}`
        : 'verify-execute-widget-real requires at least one widget-capable Claude CLI profile in LaborAny settings',
    )
    const profileSupport = getWidgetProfileSupport(widgetProfile)
    const expectWidget = profileSupport.enabled
    const liveAssistantWaitMs = profileSupport.capability === 'full_stream'
      ? FULL_STREAM_LIVE_WAIT_MS
      : FINAL_ONLY_LIVE_WAIT_MS
    const widgetWaitMs = profileSupport.capability === 'full_stream'
      ? FULL_STREAM_WIDGET_WAIT_MS
      : FINAL_ONLY_WIDGET_WAIT_MS
    const persistedWidgetWaitMs = profileSupport.capability === 'full_stream'
      ? FULL_STREAM_PERSIST_WAIT_MS
      : FINAL_ONLY_PERSIST_WAIT_MS

    log(`Using isolated test root: ${tempRoot}`)
    log(`Selected profile: ${widgetProfile.name || widgetProfile.id} (${widgetProfile.model || 'unknown model'})`)
    log(`Execute expectation: ${expectWidget ? 'widget render' : 'text fallback'}`)

    agentHandle = startChild('agent-service', {
      command: getTsxPath(),
      args: ['src/index.ts'],
      cwd: agentDir,
    }, {
      LABORANY_HOME: agentHome,
      AGENT_PORT: String(ports.agent),
      SRC_API_BASE_URL: `${urls.api}/api`,
    }, logDir)
    await waitForHttp(`${urls.agent}/health`, res => res.ok, agentHandle.logPath)
    log('Agent service is ready')

    apiHandle = startChild('src-api', {
      command: process.execPath,
      args: [path.join(apiDir, 'dist', 'bundle.cjs')],
      cwd: apiCwd,
    }, {
      PORT: String(ports.api),
      AGENT_SERVICE_URL: urls.agent,
    }, logDir)
    await waitForHttp(`${urls.api}/api/setup/status`, res => res.ok, apiHandle.logPath)
    log('Src-api bundle is ready')

    const sessionsBefore = await listSessions(urls.api)
    const previousIds = new Set(sessionsBefore.map(item => item.id))

    const playwright = loadPlaywright()
    browser = await launchBrowser(playwright)
    const page = await browser.newPage({
      viewport: { width: 1440, height: 960 },
    })
    await page.addInitScript((profileId) => {
      try {
        if (window.top !== window) return
        if (!window.localStorage.getItem('laborany:active-model-profile-id')) {
          window.localStorage.setItem('laborany:active-model-profile-id', profileId)
        }
      } catch {
        // Ignore sandboxed child frames.
      }
    }, widgetProfile.id)

    const pageErrors = []
    const failedResponses = []
    const requestFailures = []

    page.on('pageerror', (error) => {
      pageErrors.push(error instanceof Error ? error.message : String(error))
    })
    page.on('response', (response) => {
      if (response.status() >= 500) {
        failedResponses.push(`${response.status()} ${response.url()}`)
      }
    })
    page.on('requestfailed', (request) => {
      const errorText = request.failure()?.errorText || 'request failed'
      const url = request.url()
      const isExpectedAbort = errorText.includes('ERR_ABORTED')
        && (url.startsWith('blob:') || url.includes('/api/skill/execute'))
      if (isExpectedAbort) return
      requestFailures.push(`${errorText} ${request.url()}`)
    })

    await page.goto(`${urls.api}/execute/__generic__?q=${encodeURIComponent(WIDGET_PROMPT)}`, {
      waitUntil: 'load',
      timeout: 90000,
    })

    const executeProfileCard = page.getByTestId('execute-active-profile-card')
    const executeProfileCardCount = await executeProfileCard.count()
    if (executeProfileCardCount > 0) {
      await executeProfileCard.waitFor({ state: 'visible', timeout: 30000 })
      const executeProfileCardText = await executeProfileCard.innerText()
      assert(executeProfileCardText.includes(widgetProfile.name), 'Execute page is missing the active profile name in the summary card')
      assert(executeProfileCardText.includes(getExecuteSupportLabel(widgetProfile)), 'Execute page is missing the execute support label in the summary card')
    }

    const liveAssistantText = await waitForCondition('execute widget explanation prose', async () => {
      const blocks = page.locator('.prose')
      const count = await blocks.count()
      if (count === 0) return null
      const text = (await blocks.last().innerText()).trim()
      return /复利/.test(text) ? text : null
    }, liveAssistantWaitMs)
    assert(/复利/.test(liveAssistantText), 'Execute page explanation is missing compound-interest content')

    if (expectWidget) {
      await page.locator('iframe').first().waitFor({ state: 'visible', timeout: widgetWaitMs })
      const liveWidgetMode = await waitForCondition('live execute widget mode', async () => {
        const expandVisible = await page.locator('[aria-label="展开到面板"]').first().isVisible().catch(() => false)
        if (expandVisible) return 'inline'
        const anchorVisible = await page.locator('[data-widget-id]').first().isVisible().catch(() => false)
        if (anchorVisible) return 'anchor'
        const panelCloseVisible = await page.locator('[aria-label="Close widget panel"]').first().isVisible().catch(() => false)
        if (panelCloseVisible) return 'panel'
        return null
      }, 15000)
      log(`Widget rendered in live execute page (${liveWidgetMode})`)
    } else {
      const iframeCount = await page.locator('iframe').count()
      assert(iframeCount === 0, 'Execute page unexpectedly rendered a widget for a text-fallback profile')
      log('Execute page fell back to text explanation as expected')
    }

    const sessionId = await waitForNewExecuteSession(urls.api, previousIds)
    const detail = expectWidget
      ? await waitForPersistedExecuteWidgetWithTimeout(urls.api, sessionId, persistedWidgetWaitMs)
      : await waitForCompletedExecuteSession(urls.api, sessionId)
    const messages = Array.isArray(detail.messages) ? detail.messages : []
    const widgetMessages = messages.filter(item => item?.meta?.widget)
    if (expectWidget) {
      assert(widgetMessages.length > 0, 'Persisted execute session is missing widget metadata')
      log(`Widget persisted for execute session ${sessionId}`)

      const liveExpandButton = page.locator('[aria-label="展开到面板"]').first()
      if (await liveExpandButton.isVisible().catch(() => false)) {
        await liveExpandButton.click({ force: true })
        await page.locator('[aria-label="Close widget panel"]').first().waitFor({ state: 'visible', timeout: 10000 })
        await page.locator('[aria-label="Close widget panel"]').first().click({ force: true })
        await waitForCondition('execute widget panel close', async () => {
          const closeVisible = await page.locator('[aria-label="Close widget panel"]').first().isVisible().catch(() => false)
          return closeVisible ? null : true
        }, 10000)
        await page.locator('iframe').first().waitFor({ state: 'visible', timeout: 10000 })
        log('Execute widget expand and close passed')
      } else if (await page.locator('[data-widget-id]').first().isVisible().catch(() => false)) {
        await page.locator('[data-widget-id]').first().click({ force: true })
        await page.locator('[aria-label="Close widget panel"]').first().waitFor({ state: 'visible', timeout: 10000 })
        await page.locator('[aria-label="Close widget panel"]').first().click({ force: true })
        await waitForCondition('execute widget panel close', async () => {
          const closeVisible = await page.locator('[aria-label="Close widget panel"]').first().isVisible().catch(() => false)
          return closeVisible ? null : true
        }, 10000)
        log('Execute widget close and reopen passed')
      }

      await page.goto(`${urls.api}/history/${encodeURIComponent(sessionId)}`, {
        waitUntil: 'load',
        timeout: 90000,
      })
      const historyBodyText = await page.locator('body').innerText()
      assert(!historyBodyText.includes('[widget:'), 'History page showed raw widget placeholder text')
      const historyWidgetMode = await waitForCondition('history widget visible', async () => {
        const inlineIframeVisible = await page.locator('iframe').first().isVisible().catch(() => false)
        if (inlineIframeVisible) return 'iframe'
        const anchorVisible = await page.locator('[data-widget-id]').first().isVisible().catch(() => false)
        if (anchorVisible) return 'anchor'
        return null
      }, 30000)
      if (historyWidgetMode === 'iframe') {
        log('History page inline widget restore passed')
      } else {
        await page.locator('[data-widget-id]').first().click({ force: true })
        await page.locator('iframe').first().waitFor({ state: 'visible', timeout: 10000 })
        log('History page widget restore passed')
      }
    } else {
      assert(widgetMessages.length === 0, 'Text-fallback execute session should not persist widget metadata')
      log(`Execute session ${sessionId} completed with text fallback`)
    }

    assert(pageErrors.length === 0, `Page errors detected:\n${pageErrors.join('\n')}`)
    assert(requestFailures.length === 0, `Request failures detected:\n${requestFailures.join('\n')}`)
    assert(failedResponses.length === 0, `HTTP 5xx responses detected:\n${failedResponses.join('\n')}`)
    log('All execute widget checks passed')
  } finally {
    if (browser) {
      await browser.close().catch(() => {})
    }
    await stopChild(apiHandle)
    await stopChild(agentHandle)
    if (!keepRoot && !keepLogs) {
      removeDir(tempRoot)
    } else {
      log(`Kept isolated test root at: ${tempRoot}`)
    }
    if (tempRoot && (keepRoot || keepLogs)) {
      log(`Logs available under: ${path.join(tempRoot, 'logs')}`)
    }
  }
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[verify-execute-widget-real] FAILED: ${message}`)
    process.exit(1)
  })
