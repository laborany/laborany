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

const args = new Set(process.argv.slice(2))
const forceBuild = args.has('--build')
const keepHome = args.has('--keep-home')
const keepLogs = args.has('--keep-logs')

const ports = {
  api: 3620,
  agent: 3002,
}

const urls = {
  api: `http://127.0.0.1:${ports.api}`,
  agent: `http://127.0.0.1:${ports.agent}`,
}

const testValues = {
  autoName: '小陈',
  manualName: 'UI真实测试名',
}

const PLAYWRIGHT_VERSION = '1.52.0'

function log(message) {
  console.log(`[verify-memory-ui-real] ${message}`)
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

function getPlatformBuildScript(prefix) {
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? `${prefix}:mac-arm64` : `${prefix}:mac`
  }
  if (process.platform === 'win32') return `${prefix}:win`
  if (process.platform === 'linux') return `${prefix}:linux`
  return null
}

function getApiBinaryPath() {
  if (process.platform === 'darwin') return path.join(apiDir, 'dist', 'laborany-api-mac')
  if (process.platform === 'win32') return path.join(apiDir, 'dist', 'laborany-api.exe')
  if (process.platform === 'linux') return path.join(apiDir, 'dist', 'laborany-api-linux')
  return path.join(apiDir, 'dist', 'bundle.cjs')
}

function getAgentBinaryPath() {
  if (process.platform === 'darwin') return path.join(agentDir, 'dist', 'laborany-agent-mac')
  if (process.platform === 'win32') return path.join(agentDir, 'dist', 'laborany-agent.exe')
  if (process.platform === 'linux') return path.join(agentDir, 'dist', 'laborany-agent-linux')
  return path.join(agentDir, 'dist', 'bundle.cjs')
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

function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'laborany-ui-real-'))
}

function removeDir(dirPath) {
  if (!dirPath) return
  fs.rmSync(dirPath, { recursive: true, force: true })
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

function seedTempHome(realHome, tempHome) {
  const envPath = path.join(realHome, '.env')
  assert(fs.existsSync(envPath), `Missing app env file: ${envPath}`)

  let envContent = fs.readFileSync(envPath, 'utf8')
  envContent = upsertEnvValue(envContent, 'AGENT_PORT', String(ports.agent))
  envContent = upsertEnvValue(envContent, 'PORT', String(ports.api))
  envContent = upsertEnvValue(envContent, 'FEISHU_ENABLED', 'false')
  envContent = upsertEnvValue(envContent, 'QQ_ENABLED', 'false')
  envContent = upsertEnvValue(envContent, 'NOTIFY_ON_SUCCESS', 'false')
  envContent = upsertEnvValue(envContent, 'NOTIFY_ON_ERROR', 'false')

  fs.mkdirSync(tempHome, { recursive: true })
  fs.writeFileSync(path.join(tempHome, '.env'), envContent, 'utf8')

  const profilePath = path.join(realHome, 'profile.json')
  if (fs.existsSync(profilePath)) {
    fs.copyFileSync(profilePath, path.join(tempHome, 'profile.json'))
  } else {
    const now = new Date().toISOString()
    fs.writeFileSync(path.join(tempHome, 'profile.json'), JSON.stringify({
      name: 'UI Test User',
      createdAt: now,
      updatedAt: now,
    }, null, 2))
  }

  fs.mkdirSync(path.join(tempHome, 'data', 'memory', 'profiles'), { recursive: true })
}

function ensureArtifacts() {
  const frontendIndex = path.join(frontendDir, 'dist', 'index.html')
  const apiBinary = getApiBinaryPath()
  const agentBinary = getAgentBinaryPath()

  if (forceBuild || !fs.existsSync(frontendIndex)) {
    log('Building frontend dist')
    run('npm', ['run', 'build'], frontendDir)
  }

  if (forceBuild || !fs.existsSync(apiBinary)) {
    const script = getPlatformBuildScript('build')
    assert(script, 'Unsupported platform for src-api packaged build')
    log(`Building packaged src-api via ${script}`)
    run('npm', ['run', script], apiDir)
  }

  if (forceBuild || !fs.existsSync(agentBinary)) {
    const script = getPlatformBuildScript('build:pkg')
    assert(script, 'Unsupported platform for agent packaged build')
    log('Building agent TypeScript output')
    run('npm', ['run', 'build'], agentDir)
    log('Building agent bundled output')
    run('npm', ['run', 'build:bundle'], agentDir)
    log(`Building packaged agent via ${script}`)
    run('npm', ['run', script], agentDir)
  }
}

function ensureStaticFrontendLink() {
  const linkPath = path.join(apiDir, 'dist', 'frontend')
  if (fs.existsSync(linkPath)) {
    return () => {}
  }

  const frontendDist = path.join(frontendDir, 'dist')
  assert(fs.existsSync(frontendDist), `Missing frontend dist: ${frontendDist}`)
  fs.symlinkSync(frontendDist, linkPath, 'dir')
  return () => removeDir(linkPath)
}

function launchSpec(binaryPath, fallbackPath, cwd) {
  if (fs.existsSync(binaryPath)) {
    return { command: binaryPath, args: [], cwd }
  }
  return { command: process.execPath, args: [fallbackPath], cwd }
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

async function waitForHttp(url, matcher, logPath, timeoutMs = 45000) {
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
    ? fs.readFileSync(logPath, 'utf8').split(/\r?\n/).slice(-80).join('\n')
    : '(log missing)'
  fail(`Timed out waiting for ${url}: ${lastError}\n${logTail}`)
}

async function waitForCondition(label, fn, timeoutMs = 45000) {
  const startedAt = Date.now()
  let lastError = ''
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await fn()
      if (result) return result
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await sleep(300)
  }
  fail(`Timed out waiting for ${label}${lastError ? `: ${lastError}` : ''}`)
}

function normalizeAddressing(data) {
  return {
    preferredName: String(data?.preferredName || ''),
    fallbackMode: String(data?.fallbackMode || 'boss'),
    source: String(data?.source || 'none'),
    updatedAt: data?.updatedAt ? String(data.updatedAt) : null,
  }
}

function normalizeCommunicationPreferences(data) {
  return {
    replyLanguage: {
      value: String(data?.replyLanguage?.value || ''),
      source: String(data?.replyLanguage?.source || 'none'),
      updatedAt: data?.replyLanguage?.updatedAt ? String(data.replyLanguage.updatedAt) : null,
    },
    replyStyle: {
      value: String(data?.replyStyle?.value || ''),
      source: String(data?.replyStyle?.source || 'none'),
      updatedAt: data?.replyStyle?.updatedAt ? String(data.replyStyle.updatedAt) : null,
    },
  }
}

function getProfileField(profilePayload, sectionName, key) {
  const sections = Array.isArray(profilePayload?.profile?.sections) ? profilePayload.profile.sections : []
  const section = sections.find(item => item && item.name === sectionName)
  if (!section || !Array.isArray(section.fields)) return null
  return section.fields.find(item => item && item.key === key) || null
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
  const errors = []

  const attempts = [
    { label: 'system chrome', options: { headless: true, channel: 'chrome' } },
    { label: 'bundled chromium', options: { headless: true } },
  ]

  for (const attempt of attempts) {
    try {
      return await chromium.launch(attempt.options)
    } catch (error) {
      errors.push(`${attempt.label}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  log('Installing Playwright chromium browser')
  run('npx', ['-y', `playwright@${PLAYWRIGHT_VERSION}`, 'install', 'chromium'], rootDir)

  try {
    return await chromium.launch({ headless: true })
  } catch (error) {
    errors.push(`installed chromium: ${error instanceof Error ? error.message : String(error)}`)
  }

  fail(`Unable to launch browser:\n${errors.join('\n')}`)
}

async function sendChatMessage(page, text) {
  const input = page.getByTestId('chat-input-textarea')
  await input.waitFor({ state: 'visible', timeout: 60000 })
  await input.fill(text)

  const sendButton = page.getByTestId('chat-send-button')
  await sendButton.waitFor({ state: 'visible', timeout: 15000 })
  await sendButton.click()
}

async function main() {
  let tempHome = ''
  let logDir = ''
  let cleanupFrontendLink = () => {}
  let apiHandle = null
  let agentHandle = null
  let browser = null

  try {
    await ensurePortsFree()
    ensureArtifacts()

    const realHome = getRealAppHome()
    tempHome = createTempHome()
    logDir = path.join(tempHome, 'ui-test-logs')
    seedTempHome(realHome, tempHome)
    cleanupFrontendLink = ensureStaticFrontendLink()

    const apiSpec = launchSpec(
      getApiBinaryPath(),
      path.join(apiDir, 'dist', 'bundle.cjs'),
      apiDir,
    )
    const agentSpec = launchSpec(
      getAgentBinaryPath(),
      path.join(agentDir, 'dist', 'bundle.cjs'),
      agentDir,
    )

    log(`Using isolated LABORANY_HOME: ${tempHome}`)
    agentHandle = startChild('agent-service', agentSpec, {
      LABORANY_HOME: tempHome,
      AGENT_PORT: String(ports.agent),
    }, logDir)
    await waitForHttp(
      `${urls.agent}/communication-preferences`,
      (res) => res.ok,
      agentHandle.logPath,
    )
    log('Agent service is ready')

    apiHandle = startChild('src-api', apiSpec, {
      LABORANY_HOME: tempHome,
      PORT: String(ports.api),
      AGENT_SERVICE_URL: urls.agent,
    }, logDir)
    await waitForHttp(
      `${urls.api}/api/setup/status`,
      (res) => res.ok,
      apiHandle.logPath,
    )
    log('Src-api is ready')

    const setupStatus = await requestJson(urls.api, '/api/setup/status')
    assert(setupStatus.ok, `GET /api/setup/status failed: ${setupStatus.rawText}`)
    assert(setupStatus.data?.ready === true, `Isolated setup is not ready: ${JSON.stringify(setupStatus.data?.errors || [])}`)
    log('Isolated runtime setup is ready')

    const unreadCount = await requestJson(urls.agent, '/notifications/unread-count')
    assert(unreadCount.ok, `GET /notifications/unread-count failed: ${unreadCount.rawText}`)
    assert(typeof unreadCount.data?.count === 'number', 'Unread notification count should be numeric')

    const notifications = await requestJson(urls.agent, '/notifications?limit=20')
    assert(notifications.ok, `GET /notifications?limit=20 failed: ${notifications.rawText}`)
    assert(Array.isArray(notifications.data?.notifications), 'Notifications payload should contain notifications array')
    log('Notification endpoints are healthy')

    const playwright = loadPlaywright()
    browser = await launchBrowser(playwright)
    const context = await browser.newContext()
    const page = await context.newPage()

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
      if (errorText.includes('ERR_ABORTED') && url.includes('/agent-api/converse')) {
        return
      }
      requestFailures.push(`${errorText} ${url}`)
    })

    await page.goto(`${urls.api}/`, { waitUntil: 'networkidle', timeout: 90000 })
    await page.getByTestId('chat-input-textarea').waitFor({ state: 'visible', timeout: 60000 })
    log('Home UI is ready')

    await sendChatMessage(page, `以后请叫我${testValues.autoName}。只需简短确认。`)
    const autoAddressing = await waitForCondition('auto addressing persistence', async () => {
      const res = await requestJson(urls.agent, '/addressing')
      if (!res.ok) return null
      const data = normalizeAddressing(res.data)
      return data.preferredName === testValues.autoName ? data : null
    })
    assert(autoAddressing.source === 'auto', `Expected auto naming source=auto, got ${autoAddressing.source}`)
    await page.getByTestId('chat-send-button').waitFor({ state: 'visible', timeout: 60000 })
    await page.waitForTimeout(500)
    log('Explicit naming fast path updated addressing via real chat UI')

    await page.goto(`${urls.api}/memory`, { waitUntil: 'networkidle', timeout: 90000 })
    const preferredNameInput = page.getByTestId('preferred-name-input')
    await preferredNameInput.waitFor({ state: 'visible', timeout: 30000 })
    assert((await preferredNameInput.inputValue()) === testValues.autoName, 'Memory page did not reflect auto learned preferred name')
    log('Memory UI reflects auto learned name')

    await page.goto(`${urls.api}/`, { waitUntil: 'networkidle', timeout: 90000 })
    await page.getByTestId('chat-input-textarea').waitFor({ state: 'visible', timeout: 60000 })
    await sendChatMessage(page, '以后都用英文回复我，尽量详细一点。只需简短确认。')
    const autoPreferences = await waitForCondition('auto communication preference persistence', async () => {
      const res = await requestJson(urls.agent, '/communication-preferences')
      if (!res.ok) return null
      const data = normalizeCommunicationPreferences(res.data)
      if (data.replyLanguage.value === 'en' && data.replyStyle.value === 'detailed') return data
      return null
    })
    assert(autoPreferences.replyLanguage.source === 'auto', `Expected replyLanguage source=auto, got ${autoPreferences.replyLanguage.source}`)
    assert(autoPreferences.replyStyle.source === 'auto', `Expected replyStyle source=auto, got ${autoPreferences.replyStyle.source}`)
    await page.getByTestId('chat-send-button').waitFor({ state: 'visible', timeout: 60000 })
    await page.waitForTimeout(500)
    log('Explicit communication preferences updated via real chat UI')

    await page.goto(`${urls.api}/memory`, { waitUntil: 'networkidle', timeout: 90000 })
    const replyLanguageSelect = page.getByTestId('reply-language-select')
    const replyStyleSelect = page.getByTestId('reply-style-select')
    await replyLanguageSelect.waitFor({ state: 'visible', timeout: 30000 })
    assert((await replyLanguageSelect.inputValue()) === 'en', 'Memory page did not reflect auto learned replyLanguage=en')
    assert((await replyStyleSelect.inputValue()) === 'detailed', 'Memory page did not reflect auto learned replyStyle=detailed')
    log('Memory UI reflects auto learned communication preferences')

    await preferredNameInput.fill(testValues.manualName)
    await page.getByTestId('addressing-save-button').click()
    const manualAddressing = await waitForCondition('manual addressing save', async () => {
      const res = await requestJson(urls.agent, '/addressing')
      if (!res.ok) return null
      const data = normalizeAddressing(res.data)
      return data.preferredName === testValues.manualName && data.source === 'manual' ? data : null
    })
    assert(manualAddressing.preferredName === testValues.manualName, 'Manual addressing save did not persist the new preferred name')

    await replyLanguageSelect.selectOption('zh')
    await replyStyleSelect.selectOption('brief')
    await page.getByTestId('communication-preferences-save-button').click()
    const manualPreferences = await waitForCondition('manual communication preference save', async () => {
      const res = await requestJson(urls.agent, '/communication-preferences')
      if (!res.ok) return null
      const data = normalizeCommunicationPreferences(res.data)
      if (data.replyLanguage.value === 'zh' && data.replyLanguage.source === 'manual'
        && data.replyStyle.value === 'brief' && data.replyStyle.source === 'manual') {
        return data
      }
      return null
    })
    assert(manualPreferences.replyLanguage.value === 'zh', 'Manual replyLanguage save did not persist zh')
    assert(manualPreferences.replyStyle.value === 'brief', 'Manual replyStyle save did not persist brief')
    log('Manual memory settings save succeeded')

    await page.reload({ waitUntil: 'networkidle', timeout: 90000 })
    assert((await page.getByTestId('preferred-name-input').inputValue()) === testValues.manualName, 'Reload did not preserve manual preferred name')
    assert((await page.getByTestId('reply-language-select').inputValue()) === 'zh', 'Reload did not preserve manual replyLanguage')
    assert((await page.getByTestId('reply-style-select').inputValue()) === 'brief', 'Reload did not preserve manual replyStyle')
    log('Manual memory settings survive reload')

    await page.getByTestId('addressing-reset-button').click()
    await waitForCondition('addressing reset', async () => {
      const res = await requestJson(urls.agent, '/addressing')
      if (!res.ok) return null
      const data = normalizeAddressing(res.data)
      return data.preferredName === '' ? data : null
    })

    await page.getByTestId('communication-preferences-reset-button').click()
    await waitForCondition('communication preferences reset', async () => {
      const res = await requestJson(urls.agent, '/communication-preferences')
      if (!res.ok) return null
      const data = normalizeCommunicationPreferences(res.data)
      if (data.replyLanguage.value === '' && data.replyStyle.value === '') return data
      return null
    })

    await page.reload({ waitUntil: 'networkidle', timeout: 90000 })
    assert((await page.getByTestId('preferred-name-input').inputValue()) === '', 'Reload after reset did not clear preferred name')
    assert((await page.getByTestId('reply-language-select').inputValue()) === '', 'Reload after reset did not clear replyLanguage')
    assert((await page.getByTestId('reply-style-select').inputValue()) === '', 'Reload after reset did not clear replyStyle')
    log('Reset flow succeeded and remained cleared after reload')

    await page.goto(`${urls.api}/`, { waitUntil: 'networkidle', timeout: 90000 })
    await page.getByTestId('chat-input-textarea').waitFor({ state: 'visible', timeout: 60000 })
    await sendChatMessage(page, '以后默认先给我结论，再给详细步骤。只需简短确认。')
    await waitForCondition('conclusion-first profile persistence', async () => {
      const res = await requestJson(urls.agent, '/profile')
      if (!res.ok) return null
      return getProfileField(res.data, '沟通风格', '结论优先')
    }, 120000)

    const communicationPreferencesAfterConclusion = await requestJson(urls.agent, '/communication-preferences')
    assert(communicationPreferencesAfterConclusion.ok, 'GET /communication-preferences after conclusion-first message failed')
    const normalizedConclusionPreferences = normalizeCommunicationPreferences(communicationPreferencesAfterConclusion.data)
    assert(
      normalizedConclusionPreferences.replyStyle.value === '',
      `Conclusion-first message should not auto-set replyStyle, got ${normalizedConclusionPreferences.replyStyle.value}`,
    )

    await sendChatMessage(page, '后续回复时先说结论，再展开步骤细节。只需简短确认。')
    const skillMemoryPath = path.join(tempHome, 'data', 'memory', 'skills', '__converse__', 'MEMORY.md')
    await waitForCondition('conclusion-first long-term memory write', async () => {
      const statsRes = await requestJson(urls.agent, '/memory/longterm/stats?days=30')
      if (!statsRes.ok) return null
      if (Number(statsRes.data?.accepted || 0) < 1) return null
      if (!fs.existsSync(skillMemoryPath)) return null
      const globalMemoryPath = path.join(tempHome, 'data', 'MEMORY.md')
      if (!fs.existsSync(globalMemoryPath)) return null
      const content = fs.readFileSync(skillMemoryPath, 'utf8')
      const globalContent = fs.readFileSync(globalMemoryPath, 'utf8')
      return (
        content.includes('偏好回复时先给出结论，再展开步骤和细节')
        && globalContent.includes('偏好回复时先给出结论，再展开步骤和细节')
      ) ? content : null
    }, 120000)

    await page.goto(`${urls.api}/memory`, { waitUntil: 'networkidle', timeout: 90000 })
    const memoryTabProfile = page.getByTestId('memory-tab-profile')
    await memoryTabProfile.waitFor({ state: 'visible', timeout: 30000 })
    await memoryTabProfile.click()
    const longTermProfileStat = page.getByTestId('profile-stat-长期记忆')
    await longTermProfileStat.waitFor({ state: 'visible', timeout: 30000 })
    const longTermProfileText = await longTermProfileStat.textContent()
    assert(
      /\d+/.test(longTermProfileText || '') && !/^0/.test((longTermProfileText || '').trim()),
      `Profile long-term stat did not update: ${longTermProfileText}`,
    )

    const memoryTabArchive = page.getByTestId('memory-tab-archive')
    await memoryTabArchive.waitFor({ state: 'visible', timeout: 30000 })
    await memoryTabArchive.click()
    await page.getByTestId('longterm-overview-panel').waitFor({ state: 'visible', timeout: 30000 })
    await waitForCondition('archive normalized conclusion-first memory visibility', async () => {
      const auditText = await page.getByTestId('longterm-audit-panel').textContent()
      const candidateText = await page.getByTestId('longterm-candidates-panel').textContent()
      return (auditText || '').includes('偏好回复时先给出结论，再展开步骤和细节')
        || (candidateText || '').includes('偏好回复时先给出结论，再展开步骤和细节')
    }, 30000)
    log('Real UI conclusion-first long-term memory flow passed')

    const resetAllRes = await requestJson(urls.agent, '/memory/reset-all', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    assert(resetAllRes.ok, `POST /memory/reset-all before combined UI flow failed: ${resetAllRes.rawText}`)

    const combinedName = '联动小陈'
    await page.goto(`${urls.api}/`, { waitUntil: 'networkidle', timeout: 90000 })
    await page.getByTestId('chat-input-textarea').waitFor({ state: 'visible', timeout: 60000 })
    await sendChatMessage(page, `以后叫我${combinedName}，回复时先给结论再给步骤。只需简短确认。`)
    await waitForCondition('combined ui addressing persistence', async () => {
      const res = await requestJson(urls.agent, '/addressing')
      if (!res.ok) return null
      const data = normalizeAddressing(res.data)
      return data.preferredName === combinedName ? data : null
    }, 120000)
    await waitForCondition('combined ui profile persistence', async () => {
      const res = await requestJson(urls.agent, '/profile')
      if (!res.ok) return null
      return getProfileField(res.data, '沟通风格', '结论优先')
    }, 120000)

    await sendChatMessage(page, `后续还是叫我${combinedName}，回复时先说结论，再展开步骤细节。只需简短确认。`)
    await waitForCondition('combined ui long-term write', async () => {
      const addressingRes = await requestJson(urls.agent, '/addressing')
      const candidatesRes = await requestJson(urls.agent, '/memory/consolidation-candidates?analyze=false')
      if (!addressingRes.ok || !candidatesRes.ok) return null
      const addressing = normalizeAddressing(addressingRes.data)
      if (addressing.preferredName !== combinedName) return null
      const skillMemoryCombinedPath = path.join(tempHome, 'data', 'memory', 'skills', '__converse__', 'MEMORY.md')
      const globalMemoryCombinedPath = path.join(tempHome, 'data', 'MEMORY.md')
      if (!fs.existsSync(skillMemoryCombinedPath) || !fs.existsSync(globalMemoryCombinedPath)) return null
      const skillContent = fs.readFileSync(skillMemoryCombinedPath, 'utf8')
      const globalContent = fs.readFileSync(globalMemoryCombinedPath, 'utf8')
      if (!skillContent.includes('偏好回复时先给出结论，再展开步骤和细节')) return null
      if (!globalContent.includes('偏好回复时先给出结论，再展开步骤和细节')) return null
      const matchingCandidates = (Array.isArray(candidatesRes.data?.candidates) ? candidatesRes.data.candidates : [])
        .filter(item => item && item.content === '偏好回复时先给出结论，再展开步骤和细节')
      return matchingCandidates.length === 0 ? true : null
    }, 120000)

    await page.goto(`${urls.api}/memory`, { waitUntil: 'networkidle', timeout: 90000 })
    const combinedMemoryTabArchive = page.getByTestId('memory-tab-archive')
    await combinedMemoryTabArchive.waitFor({ state: 'visible', timeout: 30000 })
    await combinedMemoryTabArchive.click()
    await page.getByTestId('longterm-overview-panel').waitFor({ state: 'visible', timeout: 30000 })
    await waitForCondition('combined archive visibility', async () => {
      const auditText = await page.getByTestId('longterm-audit-panel').textContent()
      return (auditText || '').includes('偏好回复时先给出结论，再展开步骤和细节')
    }, 30000)
    log('Real UI combined naming + long-term flow passed')

    assert(pageErrors.length === 0, `Page errors detected:\n${pageErrors.join('\n')}`)
    assert(requestFailures.length === 0, `Request failures detected:\n${requestFailures.join('\n')}`)
    assert(failedResponses.length === 0, `HTTP 5xx responses detected:\n${failedResponses.join('\n')}`)

    log('All real UI checks passed')
  } finally {
    if (browser) {
      await browser.close().catch(() => {})
    }
    await stopChild(apiHandle)
    await stopChild(agentHandle)
    cleanupFrontendLink()
    if (!keepHome) {
      removeDir(tempHome)
    } else {
      log(`Kept isolated LABORANY_HOME at: ${tempHome}`)
    }
    if (logDir && (keepHome || keepLogs)) {
      log(`Logs available at: ${logDir}`)
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[verify-memory-ui-real] FAILED: ${message}`)
  process.exit(1)
})
