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
const keepRoot = args.has('--keep-root')
const keepLogs = args.has('--keep-logs')

const ports = {
  api: 3726,
  agent: 3108,
}

const urls = {
  api: `http://127.0.0.1:${ports.api}`,
  agent: `http://127.0.0.1:${ports.agent}`,
}

const PLAYWRIGHT_VERSION = '1.52.0'
const WIDGET_PROMPT = '请不要推荐 skill，也不要写文件。直接用一个交互式组件画出复利计算器，并解释复利增长。'

function log(message) {
  console.log(`[verify-converse-widget-real] ${message}`)
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
    name: 'Widget Test User',
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
const OPENAI_COMPAT_REASONING_MODEL_RE = /(reasoner|reasoning|(?:^|[-_])r1(?:$|[-_])|(?:^|[-_])o1(?:$|[-_])|(?:^|[-_])o3(?:$|[-_])|qwq|thinking)/i

function normalizeInterfaceType(value) {
  return value === 'openai_compatible' ? 'openai_compatible' : 'anthropic'
}

function isReasoningFocusedOpenAiModel(model) {
  const normalized = typeof model === 'string' ? model.trim() : ''
  return normalized ? OPENAI_COMPAT_REASONING_MODEL_RE.test(normalized) : false
}

function isOfficialAnthropicBaseUrl(baseUrl) {
  const normalized = typeof baseUrl === 'string' ? baseUrl.trim() : ''
  return !normalized || OFFICIAL_ANTHROPIC_BASE_URL_RE.test(normalized)
}

function getWidgetProfileSupport(profile) {
  const interfaceType = normalizeInterfaceType(profile?.interfaceType)
  const model = typeof profile?.model === 'string' ? profile.model.trim().toLowerCase() : ''

  if (interfaceType === 'openai_compatible') {
    if (isReasoningFocusedOpenAiModel(model)) {
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

function pickSecondaryProfile(profiles, primaryProfile) {
  const primaryId = primaryProfile?.id
  if (!primaryId) return null

  const primarySupport = getWidgetProfileSupport(primaryProfile)
  const candidates = profiles.filter(profile => profile.id !== primaryId)

  const withDifferentCapability = candidates.find((profile) => {
    const support = getWidgetProfileSupport(profile)
    return support.enabled !== primarySupport.enabled
      || support.capability !== primarySupport.capability
      || support.provider !== primarySupport.provider
  })
  if (withDifferentCapability) return withDifferentCapability

  return candidates[0] || null
}

function getConverseSupportLabels(profile) {
  const support = getWidgetProfileSupport(profile)
  if (!support.enabled) {
    return {
      short: '文本',
      full: '对话: 文本模式',
    }
  }
  if (support.capability === 'full_stream') {
    return {
      short: '流式',
      full: '对话: 实时流式',
    }
  }
  return {
    short: '完成后',
    full: '对话: 完成后显示',
  }
}

function getExecuteSupportLabels(profile) {
  const support = getWidgetProfileSupport(profile)
  if (support.enabled && support.capability === 'full_stream') {
    return {
      short: '流式',
      full: '执行: 实时流式',
    }
  }
  return {
    short: '文本',
    full: '执行: 文本模式',
  }
}

async function expectActiveProfileUi(page, profile) {
  const homeCard = page.getByTestId('home-active-profile-card')
  await homeCard.waitFor({ state: 'visible', timeout: 30000 })
  const cardText = await homeCard.innerText()
  assert(cardText.includes(profile.name), `Home active profile card is missing profile name ${profile.name}`)
  assert(cardText.includes(getConverseSupportLabels(profile).full), `Home active profile card is missing converse support label for ${profile.name}`)
  assert(cardText.includes(getExecuteSupportLabels(profile).full), `Home active profile card is missing execute support label for ${profile.name}`)

  const trigger = page.getByTestId('active-profile-trigger')
  await trigger.waitFor({ state: 'visible', timeout: 30000 })
  const triggerText = await trigger.innerText()
  assert(triggerText.includes(profile.name), `Active profile trigger is missing profile name ${profile.name}`)
  assert(triggerText.includes(getConverseSupportLabels(profile).short), `Active profile trigger is missing converse short label for ${profile.name}`)
  assert(triggerText.includes(getExecuteSupportLabels(profile).short), `Active profile trigger is missing execute short label for ${profile.name}`)
}

async function promoteProfileAsCurrentDefault(page, profile) {
  const promoteButton = page.getByTestId(`profile-promote-${profile.id}`)
  await promoteButton.waitFor({ state: 'visible', timeout: 30000 })
  await promoteButton.click()

  await page.getByTestId(`profile-active-badge-${profile.id}`).waitFor({ state: 'visible', timeout: 30000 })
  await page.getByTestId(`profile-default-badge-${profile.id}`).waitFor({ state: 'visible', timeout: 30000 })
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

async function findLatestConverseSessionId(baseUrl) {
  return await waitForCondition('latest converse session id', async () => {
    const res = await requestJson(baseUrl, '/api/sessions')
    if (!res.ok) return null
    const sessions = Array.isArray(res.data) ? res.data : []
    const latest = sessions
      .filter(item => item && item.skill_id === '__converse__' && typeof item.id === 'string')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    return latest?.id || null
  }, 10000)
}

async function waitForPersistedWidget(baseUrl, sessionId) {
  return await waitForCondition('persisted widget session detail', async () => {
    const res = await requestJson(baseUrl, `/api/sessions/${encodeURIComponent(sessionId)}`)
    if (!res.ok) return null
    const detail = res.data
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
  }, 120000)
}

async function fetchSessionDetail(baseUrl, sessionId) {
  const res = await requestJson(baseUrl, `/api/sessions/${encodeURIComponent(sessionId)}`)
  assert(res.ok, `GET /api/sessions/${sessionId} failed: ${res.rawText}`)
  return res.data
}

function getUserMessageCount(detail) {
  const messages = Array.isArray(detail?.messages) ? detail.messages : []
  return messages.filter(item => item && item.type === 'user').length
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
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'laborany-converse-widget-real-'))
    const agentHome = path.join(tempRoot, 'agent-home')
    const apiCwd = path.join(tempRoot, 'api-cwd')
    const logDir = path.join(tempRoot, 'logs')

    seedAgentHome(realHome, agentHome)
    const modelProfiles = seedApiCwd(realHome, apiCwd)
    const widgetProfile = pickCliWidgetProfile(modelProfiles)
    const secondaryProfile = pickSecondaryProfile(modelProfiles, widgetProfile)
    assert(
      widgetProfile?.id,
      'verify-converse-widget-real requires at least one widget-capable Claude CLI profile in LaborAny settings',
    )

    log(`Using isolated test root: ${tempRoot}`)
    log(`Selected profile: ${widgetProfile.name || widgetProfile.id} (${widgetProfile.model || 'unknown model'})`)

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
      if (error instanceof Error) {
        pageErrors.push(error.stack || error.message)
        return
      }
      pageErrors.push(String(error))
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
        && (url.startsWith('blob:') || url.includes('/agent-api/converse'))
      if (isExpectedAbort) return
      requestFailures.push(`${errorText} ${request.url()}`)
    })

    await page.goto(`${urls.api}/`, { waitUntil: 'networkidle', timeout: 90000 })
    await expectActiveProfileUi(page, widgetProfile)

    await page.goto(`${urls.api}/settings#model`, { waitUntil: 'networkidle', timeout: 90000 })
    await page.getByTestId(`model-profile-card-${widgetProfile.id}`).waitFor({ state: 'visible', timeout: 30000 })
    await page.getByTestId(`profile-active-badge-${widgetProfile.id}`).waitFor({ state: 'visible', timeout: 30000 })

    if (secondaryProfile?.id) {
      await promoteProfileAsCurrentDefault(page, secondaryProfile)
      log(`Settings page switched current default profile to ${secondaryProfile.name || secondaryProfile.id}`)

      await page.goto(`${urls.api}/`, { waitUntil: 'networkidle', timeout: 90000 })
      await expectActiveProfileUi(page, secondaryProfile)

      await page.goto(`${urls.api}/settings#model`, { waitUntil: 'networkidle', timeout: 90000 })
      await page.getByTestId(`model-profile-card-${secondaryProfile.id}`).waitFor({ state: 'visible', timeout: 30000 })
      await promoteProfileAsCurrentDefault(page, widgetProfile)
      log(`Settings page restored current default profile to ${widgetProfile.name || widgetProfile.id}`)
    }

    await page.goto(`${urls.api}/`, { waitUntil: 'networkidle', timeout: 90000 })
    await expectActiveProfileUi(page, widgetProfile)

    const input = page.getByTestId('chat-input-textarea')
    await input.waitFor({ state: 'visible', timeout: 60000 })
    await input.fill(WIDGET_PROMPT)
    await input.press('Enter')

    await page.locator('iframe').first().waitFor({ state: 'visible', timeout: 240000 })
    await input.waitFor({ state: 'visible', timeout: 30000 })

    const liveAssistantText = await waitForCondition('widget explanation prose', async () => {
      const blocks = page.locator('.prose')
      const count = await blocks.count()
      if (count === 0) return null
      const text = (await blocks.last().innerText()).trim()
      return /复利/.test(text) ? text : null
    }, 60000)
    assert(/复利/.test(liveAssistantText), 'Live assistant explanation is missing the compound-interest content')
    log('Widget rendered in live converse page')

    const sessionId = await findLatestConverseSessionId(urls.api)
    const detail = await waitForPersistedWidget(urls.api, sessionId)
    const messages = Array.isArray(detail.messages) ? detail.messages : []
    const widgetMessages = messages.filter(item => item?.meta?.widget)
    assert(widgetMessages.length > 0, 'Persisted session is missing widget metadata')
    assert(getUserMessageCount(detail) === 1, 'Widget should not auto-inject a user turn during initial render')
    const messageCountBeforeRestore = messages.length
    log(`Widget persisted for session ${sessionId}`)

    await page.goto(`${urls.api}/?converseSid=${encodeURIComponent(sessionId)}`, {
      waitUntil: 'networkidle',
      timeout: 90000,
    })
    await page.locator('iframe').first().waitFor({ state: 'visible', timeout: 60000 })

    const restoredBodyText = await page.locator('body').innerText()
    assert(!restoredBodyText.includes('[widget:'), 'Restored converse page showed raw widget placeholder text')
    await input.waitFor({ state: 'visible', timeout: 30000 })
    const restoredAnchorCount = await page.locator('[data-widget-id]').count()
    assert(restoredAnchorCount >= 1, 'Restored converse page is missing the widget anchor card')
    await sleep(3000)
    const restoredDetail = await fetchSessionDetail(urls.api, sessionId)
    assert(
      Array.isArray(restoredDetail.messages) && restoredDetail.messages.length === messageCountBeforeRestore,
      'Restoring a widget should not append extra messages to the conversation',
    )
    log('Widget restored from persisted session')

    await page.evaluate(() => {
      const closeButton = document.querySelector('[aria-label="Close widget panel"]')
      if (closeButton instanceof HTMLElement) closeButton.click()
    })
    await waitForCondition('widget panel close', async () => {
      const count = await page.locator('iframe').count()
      return count === 0 ? true : null
    }, 10000)
    await page.locator('[data-widget-id]').first().click({ force: true })
    await page.locator('iframe').first().waitFor({ state: 'visible', timeout: 10000 })
    log('Widget close and reopen passed')

    const widgetId = await page.locator('[data-widget-id]').first().getAttribute('data-widget-id')
    assert(widgetId, 'Missing widget anchor data-widget-id')
    const spoofMessageCountBefore = (await fetchSessionDetail(urls.api, sessionId)).messages.length
    await page.evaluate((targetWidgetId) => {
      window.postMessage({
        type: 'widget_interaction',
        source: 'laborany-widget',
        widgetId: targetWidgetId,
        payload: { injected: true, from: 'host-page' },
      }, '*')
    }, widgetId)
    await sleep(3000)
    const spoofedDetail = await fetchSessionDetail(urls.api, sessionId)
    assert(
      Array.isArray(spoofedDetail.messages) && spoofedDetail.messages.length === spoofMessageCountBefore,
      'Host page should not be able to forge widget postMessage events',
    )
    const bodyTextAfterSpoof = await page.locator('body').innerText()
    assert(!bodyTextAfterSpoof.includes('host-page'), 'Forged widget interaction leaked into the UI')
    log('Widget postMessage spoof protection passed')

    assert(pageErrors.length === 0, `Page errors detected:\n${pageErrors.join('\n')}`)
    assert(requestFailures.length === 0, `Request failures detected:\n${requestFailures.join('\n')}`)
    assert(failedResponses.length === 0, `HTTP 5xx responses detected:\n${failedResponses.join('\n')}`)

    log('All widget converse checks passed')
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

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[verify-converse-widget-real] FAILED: ${message}`)
  process.exit(1)
})
