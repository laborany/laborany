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
  api: 3720,
  agent: 3102,
}

const urls = {
  api: `http://127.0.0.1:${ports.api}`,
  agent: `http://127.0.0.1:${ports.agent}`,
}

const PLAYWRIGHT_VERSION = '1.52.0'
function log(message) {
  console.log(`[verify-converse-ui-real] ${message}`)
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

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
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
    name: 'UI Test User',
    createdAt: now,
    updatedAt: now,
  }, null, 2), 'utf8')
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

async function waitForCondition(label, fn, timeoutMs = 60000) {
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

async function fillAndSend(page, text) {
  const input = page.getByTestId('chat-input-textarea')
  await input.waitFor({ state: 'visible', timeout: 60000 })
  await input.fill(text)
  await input.press('Enter')
}

async function getClipboardText(page) {
  return await page.evaluate(() => {
    const store = window.__laboranyClipboardStore
    return store && typeof store.text === 'string' ? store.text : ''
  })
}

function getCopyButtons(page) {
  return page.locator('button').filter({ hasText: /复制/ })
}

async function waitForCopyButtonCount(page, minimumCount) {
  return await waitForCondition(`at least ${minimumCount} copy buttons`, async () => {
    const count = await getCopyButtons(page).count()
    return count >= minimumCount ? count : null
  })
}

async function clickCopyButton(page, index) {
  const buttons = getCopyButtons(page)
  const count = await buttons.count()
  assert(count > index, `Copy button index ${index} out of range; count=${count}`)
  await buttons.nth(index).click({ force: true })
}

async function clickLatestAssistantCopy(page) {
  const regenerateButton = page.locator('button').filter({ hasText: /^重做/ }).first()
  await regenerateButton.waitFor({ state: 'attached', timeout: 30000 })
  const actionBar = regenerateButton.locator('xpath=..')
  const copyButton = actionBar.locator('button').filter({ hasText: /复制/ }).first()
  await copyButton.waitFor({ state: 'attached', timeout: 30000 })
  await copyButton.click({ force: true })
}

async function getLastAssistantText(page) {
  const blocks = page.locator('.prose')
  const count = await blocks.count()
  assert(count > 0, 'No assistant prose blocks found')
  return (await blocks.nth(count - 1).innerText()).trim()
}

async function maybeRegenerateUntilVariantExists(page, maxAttempts) {
  let currentLabel = ''
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const buttons = page.locator('button').filter({ hasText: /^重做/ })
    await buttons.first().click({ force: true })

    currentLabel = await waitForCondition('variant pager after regenerate', async () => {
      const labels = await page.locator('span').allInnerTexts()
      const match = labels.find(item => /^\d+\s*\/\s*\d+$/.test(item.trim()))
      if (!match) return null
      const parts = match.split('/').map(item => Number.parseInt(item.trim(), 10))
      if (parts.length !== 2 || !Number.isFinite(parts[1]) || parts[1] < 2) return null
      return match.trim()
    }, 180000)

    const total = Number.parseInt(currentLabel.split('/')[1].trim(), 10)
    if (Number.isFinite(total) && total >= 2) {
      return currentLabel
    }
  }

  fail(`Unable to produce variant pager after ${maxAttempts} regenerate attempts`)
}

async function clickVariantPrev(page) {
  await page.getByRole('button', { name: '上一版本' }).click({ force: true })
}

async function upsertExternalSession(baseUrl, payload) {
  const res = await requestJson(baseUrl, '/api/sessions/external/upsert', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  assert(res.ok, `external upsert failed: ${res.rawText}`)
  return res.data
}

async function appendExternalMessage(baseUrl, payload) {
  const res = await requestJson(baseUrl, '/api/sessions/external/message', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  assert(res.ok, `external message failed: ${res.rawText}`)
  return res.data
}

async function findLatestConverseSessionId(baseUrl) {
  const res = await requestJson(baseUrl, '/api/sessions')
  assert(res.ok, `GET /api/sessions failed: ${res.rawText}`)
  const sessions = Array.isArray(res.data) ? res.data : []
  const converseSession = sessions.find(item => item && item.skill_id === '__converse__')
  assert(converseSession?.id, 'Unable to locate converse session in isolated API database')
  return converseSession.id
}

async function fetchSessionDetail(baseUrl, sessionId) {
  const res = await requestJson(baseUrl, `/api/sessions/${encodeURIComponent(sessionId)}`)
  assert(res.ok, `GET /api/sessions/${sessionId} failed: ${res.rawText}`)
  return res.data
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
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'laborany-converse-ui-real-'))
    const agentHome = path.join(tempRoot, 'agent-home')
    const apiCwd = path.join(tempRoot, 'api-cwd')
    const logDir = path.join(tempRoot, 'logs')

    seedAgentHome(realHome, agentHome)
    seedApiCwd(realHome, apiCwd)

    log(`Using isolated test root: ${tempRoot}`)

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

    const setupStatus = await requestJson(urls.api, '/api/setup/status')
    assert(setupStatus.ok, `GET /api/setup/status failed: ${setupStatus.rawText}`)
    assert(setupStatus.data?.ready === true, `Isolated setup is not ready: ${JSON.stringify(setupStatus.data?.errors || [])}`)

    const playwright = loadPlaywright()
    browser = await launchBrowser(playwright)
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
    })
    await context.addInitScript(() => {
      const store = { text: '' }
      Object.defineProperty(window, '__laboranyClipboardStore', {
        configurable: true,
        enumerable: false,
        writable: false,
        value: store,
      })

      try {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          enumerable: true,
          value: {
            writeText: async (text) => {
              store.text = String(text)
            },
            readText: async () => store.text || '',
          },
        })
      } catch {
        // ignore clipboard override failures
      }
    })

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
      requestFailures.push(`${errorText} ${request.url()}`)
    })

    await page.goto(`${urls.api}/`, { waitUntil: 'networkidle', timeout: 90000 })
    const input = page.getByTestId('chat-input-textarea')
    await input.waitFor({ state: 'visible', timeout: 60000 })
    log('Home UI is ready')

    await input.fill('以后请叫我端测小陈。')
    await input.press('Control+Enter')

    await waitForCondition('Ctrl+Enter inserts newline', async () => {
      const value = await input.inputValue()
      return value === '以后请叫我端测小陈。\n' ? value : null
    })

    await sleep(500)
    const copyCountBeforeSend = await getCopyButtons(page).count()
    assert(copyCountBeforeSend === 0, `Ctrl+Enter should not send message, found ${copyCountBeforeSend} copy buttons`)

    await input.type('只需简短确认。')
    assert((await input.inputValue()) === '以后请叫我端测小陈。\n只需简短确认。', 'Textarea newline value mismatch before send')

    await input.press('Enter')
    await page.getByTestId('chat-send-button').waitFor({ state: 'visible', timeout: 120000 })

    const firstUserText = await waitForCondition('first user bubble', async () => {
      const bubbles = page.locator('div.whitespace-pre-wrap')
      const count = await bubbles.count()
      if (count === 0) return null
      return (await bubbles.first().innerText()).trim()
    })
    assert(firstUserText === '以后请叫我端测小陈。\n只需简短确认。', `User bubble should preserve newline, got: ${JSON.stringify(firstUserText)}`)

    await waitForCopyButtonCount(page, 1)
    await clickCopyButton(page, 0)
    const copiedUserText = await waitForCondition('user copy result', async () => {
      const value = await getClipboardText(page)
      return value ? value : null
    })
    assert(copiedUserText === '以后请叫我端测小陈。\n只需简短确认。', `User copy mismatch: ${JSON.stringify(copiedUserText)}`)
    log('Enter/Ctrl+Enter and user copy passed')

    const explainPrompt = '请用一个生动比喻解释什么是端到端测试，20字以内。'
    await fillAndSend(page, explainPrompt)

    await waitForCondition('regenerate button visible', async () => {
      const count = await page.locator('button').filter({ hasText: /^重做/ }).count()
      return count > 0 ? count : null
    }, 180000)
    await page.getByTestId('chat-send-button').waitFor({ state: 'visible', timeout: 180000 })

    const originalAssistantText = await getLastAssistantText(page)
    assert(originalAssistantText.length > 0, 'Assistant reply should not be empty')
    const converseSessionId = await findLatestConverseSessionId(urls.api)
    const sessionDetailAfterAssistant = await fetchSessionDetail(urls.api, converseSessionId)
    const persistedAssistantMessages = (Array.isArray(sessionDetailAfterAssistant?.messages)
      ? sessionDetailAfterAssistant.messages
      : [])
      .filter(item => item && item.type === 'assistant' && typeof item.content === 'string')
    const latestPersistedAssistantContent = persistedAssistantMessages[persistedAssistantMessages.length - 1]?.content || ''
    assert(latestPersistedAssistantContent, 'Persisted assistant reply should not be empty')

    await waitForCopyButtonCount(page, 4)
    await clickLatestAssistantCopy(page)
    const copiedAssistantText = await waitForCondition('assistant copy result', async () => {
      const value = await getClipboardText(page)
      return value ? value : null
    })
    assert(
      normalizeText(copiedAssistantText) === normalizeText(latestPersistedAssistantContent),
      `Assistant copy should match persisted reply content.\npersisted=${JSON.stringify(latestPersistedAssistantContent)}\nvisible=${JSON.stringify(originalAssistantText)}\ncopied=${JSON.stringify(copiedAssistantText)}`,
    )
    log('Assistant copy passed')

    const variantLabel = await maybeRegenerateUntilVariantExists(page, 3)
    log(`Regenerate created variants: ${variantLabel}`)

    await clickVariantPrev(page)
    await waitForCondition('switch to previous variant', async () => {
      const labels = await page.locator('span').allInnerTexts()
      return labels.find(item => /^1\s*\/\s*\d+$/.test(item.trim())) || null
    })
    const selectedVariantText = await getLastAssistantText(page)
    assert(selectedVariantText.length > 0, 'Selected variant text should not be empty')
    await clickLatestAssistantCopy(page)
    const selectedVariantCopiedContent = await waitForCondition('selected variant copy result', async () => {
      const value = await getClipboardText(page)
      return value ? value : null
    })
    assert(selectedVariantCopiedContent.length > 0, 'Selected variant copied content should not be empty')

    let capturedConversePayload = null
    await page.route('**/agent-api/converse', async (route) => {
      if (!capturedConversePayload) {
        try {
          capturedConversePayload = JSON.parse(route.request().postData() || '{}')
        } catch {
          capturedConversePayload = { parseError: true }
        }
      }
      await route.continue()
    })

    await fillAndSend(page, '继续，顺着上一版比喻补一句适用场景。')
    await waitForCondition('follow-up converse payload captured', async () => capturedConversePayload, 20000)
    assert(Array.isArray(capturedConversePayload?.messages), 'Follow-up payload should contain messages array')
    assert(
      capturedConversePayload.messages.some((item) =>
        item
        && item.role === 'assistant'
        && normalizeText(item.content) === normalizeText(selectedVariantCopiedContent),
      ),
      'Follow-up payload should include the selected assistant variant as context',
    )

    await page.getByTestId('chat-send-button').waitFor({ state: 'visible', timeout: 180000 })
    log('Selected variant is used in follow-up context')

    await page.goto(`${urls.api}/history/${encodeURIComponent(converseSessionId)}`, {
      waitUntil: 'networkidle',
      timeout: 90000,
    })
    await waitForCondition('history variant pager restore', async () => {
      const labels = await page.locator('span').allInnerTexts()
      return labels.find(item => /^1\s*\/\s*\d+$/.test(item.trim())) || null
    }, 30000)
    const historyAssistantText = await page.locator('.prose').nth(1).innerText()
    assert(
      normalizeText(historyAssistantText) === normalizeText(selectedVariantText),
      'History page should restore the previously selected variant',
    )
    log('History variant restore passed')

    const executionSessionId = `e2e-execution-${Date.now()}`
    await upsertExternalSession(urls.api, {
      sessionId: executionSessionId,
      skillId: 'demo-skill',
      query: '执行型验证任务',
      status: 'completed',
      source: 'desktop',
    })
    await appendExternalMessage(urls.api, {
      sessionId: executionSessionId,
      type: 'user',
      content: '请执行这个桌面任务。',
      meta: {
        sessionMode: 'execution',
        messageKind: 'user',
        source: 'user',
        capabilities: { canCopy: true, canRegenerate: false },
      },
    })
    await appendExternalMessage(urls.api, {
      sessionId: executionSessionId,
      type: 'assistant',
      content: '执行型会话的文本可以复制，但不能重做。',
      meta: {
        sessionMode: 'execution',
        messageKind: 'assistant_reply',
        source: 'llm',
        capabilities: { canCopy: true, canRegenerate: false },
      },
    })

    await page.goto(`${urls.api}/history/${encodeURIComponent(executionSessionId)}`, {
      waitUntil: 'networkidle',
      timeout: 90000,
    })
    await page.getByText('执行型会话的文本可以复制，但不能重做。').waitFor({ state: 'visible', timeout: 30000 })
    const regenerateCountOnExecution = await page.locator('button').filter({ hasText: /^重做/ }).count()
    assert(regenerateCountOnExecution === 0, 'Execution session should not render regenerate button')

    await waitForCopyButtonCount(page, 2)
    const execCopyButtons = await getCopyButtons(page)
    const execCopyCount = await execCopyButtons.count()
    await execCopyButtons.nth(execCopyCount - 1).click({ force: true })
    const copiedExecutionText = await waitForCondition('execution assistant copy result', async () => {
      const value = await getClipboardText(page)
      return value ? value : null
    })
    assert(
      normalizeText(copiedExecutionText) === normalizeText('执行型会话的文本可以复制，但不能重做。'),
      'Execution assistant copy should still work',
    )
    log('Execution session compatibility passed')

    assert(pageErrors.length === 0, `Page errors detected:\n${pageErrors.join('\n')}`)
    assert(requestFailures.length === 0, `Request failures detected:\n${requestFailures.join('\n')}`)
    assert(failedResponses.length === 0, `HTTP 5xx responses detected:\n${failedResponses.join('\n')}`)

    log('All converse UI end-to-end checks passed')
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
  console.error(`[verify-converse-ui-real] FAILED: ${message}`)
  process.exit(1)
})
