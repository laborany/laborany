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
  api: 3732,
  agent: 3114,
}

const urls = {
  api: `http://127.0.0.1:${ports.api}`,
  agent: `http://127.0.0.1:${ports.agent}`,
}

const PLAYWRIGHT_VERSION = '1.52.0'
const GOOGLE_QUERY = 'OpenAI Sora 2 official site'
const GOOGLE_SITE = 'openai.com'
const DIRECT_SITE_QUERY = 'fastapi'
const DIRECT_SITE_DOMAIN = 'pypi.org'
const READ_TEST_URL = 'https://pypi.org/project/fastapi/'
const CONVERSE_PROMPT = '请在 pypi.org 站内搜索 fastapi。必须先查站点经验，再搜索，再至少读取其中一个结果页。最后用 markdown 列表返回两个结果，每条格式为 [标题](完整URL) - 一句话说明，不要凭记忆回答。'
const CONVERSE_TIMEOUT_MS = 600000
const SEARCH_TIMEOUT_MS = 180000
const READ_TIMEOUT_MS = 180000

function log(message) {
  console.log(`[verify-web-research-real] ${message}`)
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
    name: 'Web Research Real Test User',
    createdAt: now,
    updatedAt: now,
  }, null, 2), 'utf8')
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

function scoreProfile(profile) {
  if (!profile || typeof profile !== 'object') return -1
  if (!profile.apiKey) return -1

  const baseUrl = String(profile.baseUrl || '').toLowerCase()
  const model = String(profile.model || '').toLowerCase()
  const interfaceType = String(profile.interfaceType || '').toLowerCase()

  if (/deepseek-reasoner/.test(model)) return 50
  if (model.startsWith('claude')) return 400
  if (interfaceType === 'anthropic' && !baseUrl.includes('bigmodel.cn')) return 350
  if (interfaceType === 'openai_compatible') return 200
  if (baseUrl.includes('bigmodel.cn')) return 150
  return 100
}

function pickResearchProfile(profiles, selector) {
  if (selector) {
    return findProfileBySelector(profiles, selector)
  }

  const ranked = profiles
    .map((profile, index) => ({ profile, index, score: scoreProfile(profile) }))
    .filter(item => item.score >= 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.index - b.index
    })[0]

  return ranked?.profile || null
}

function copyModelProfiles(realHome, apiDataDir, selector) {
  const sourcePath = path.join(realHome, 'model-profiles.json')
  if (!fs.existsSync(sourcePath)) {
    return { profiles: [], selectedProfile: null }
  }

  const raw = fs.readFileSync(sourcePath, 'utf8')
  const parsed = JSON.parse(raw)
  const profiles = Array.isArray(parsed.profiles) ? parsed.profiles : []
  const selectedProfile = pickResearchProfile(profiles, selector)

  if (selectedProfile) {
    const reordered = [
      selectedProfile,
      ...profiles.filter(profile => profile.id !== selectedProfile.id),
    ]
    parsed.profiles = reordered
    fs.writeFileSync(path.join(apiDataDir, 'model-profiles.json'), JSON.stringify(parsed, null, 2), 'utf8')
  } else {
    fs.writeFileSync(path.join(apiDataDir, 'model-profiles.json'), raw, 'utf8')
  }

  return { profiles, selectedProfile }
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

function seedApiCwd(realHome, apiCwd, selector) {
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
  return copyModelProfiles(realHome, dataDir, selector)
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

async function listSessions(baseUrl) {
  const res = await requestJson(baseUrl, '/api/sessions')
  assert(res.ok, `GET /api/sessions failed: ${res.rawText}`)
  return Array.isArray(res.data) ? res.data : []
}

async function findLatestConverseSessionId(baseUrl, previousIds = new Set()) {
  return await waitForCondition('latest converse session id', async () => {
    const sessions = await listSessions(baseUrl)
    const latest = sessions
      .filter(item => item && item.skill_id === '__converse__' && item.id && !previousIds.has(item.id))
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0]
    return latest?.id || null
  }, 120000)
}

async function fetchSessionDetail(baseUrl, sessionId) {
  const res = await requestJson(baseUrl, `/api/sessions/${encodeURIComponent(sessionId)}`)
  assert(res.ok, `GET /api/sessions/${sessionId} failed: ${res.rawText}`)
  return res.data
}

async function waitForCompletedConverseSession(baseUrl, sessionId, timeoutMs = CONVERSE_TIMEOUT_MS) {
  return await waitForCondition('completed converse session detail', async () => {
    const detail = await fetchSessionDetail(baseUrl, sessionId)
    if (detail?.status !== 'completed') return null
    const messages = Array.isArray(detail?.messages) ? detail.messages : []
    const latestAssistant = messages
      .filter(item => item && item.type === 'assistant' && typeof item.content === 'string')
      .slice(-1)[0]
    if (!latestAssistant?.content) return null
    return detail
  }, timeoutMs)
}

async function fillAndSend(page, text) {
  const input = page.getByTestId('chat-input-textarea')
  await input.waitFor({ state: 'visible', timeout: 60000 })
  await input.fill(text)
  await input.press('Enter')
}

async function expectSearchResultSummary(page) {
  return await waitForCondition('search test summary', async () => {
    const text = await page.locator('body').innerText()
    if (!/backend:\s*/.test(text) || !/strategy:\s*/.test(text)) return null
    return text
  }, SEARCH_TIMEOUT_MS)
}

async function expectReadResultSummary(page) {
  return await waitForCondition('read test summary', async () => {
    const text = await page.locator('body').innerText()
    if (!/fetchMethod:\s*/.test(text) || !/format:\s*/.test(text)) return null
    return text
  }, READ_TIMEOUT_MS)
}

async function clickButtonByText(page, text) {
  const button = page.getByRole('button', { name: text }).first()
  await button.waitFor({ state: 'visible', timeout: 30000 })
  await button.click({ force: true })
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
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'laborany-web-research-real-'))
    const agentHome = path.join(tempRoot, 'agent-home')
    const apiCwd = path.join(tempRoot, 'api-cwd')
    const logDir = path.join(tempRoot, 'logs')

    seedAgentHome(realHome, agentHome)
    const { selectedProfile } = seedApiCwd(realHome, apiCwd, forcedProfileSelector)
    assert(selectedProfile?.id, forcedProfileSelector
      ? `verify-web-research-real could not find the requested profile: ${forcedProfileSelector}`
      : 'verify-web-research-real requires at least one usable model profile in LaborAny settings')

    log(`Using isolated test root: ${tempRoot}`)
    log(`Selected profile: ${selectedProfile.name || selectedProfile.id} (${selectedProfile.model || 'unknown model'})`)

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
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
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

    await page.goto(`${urls.api}/settings#tools`, { waitUntil: 'networkidle', timeout: 90000 })
    await page.getByText('浏览器增强研究').waitFor({ state: 'visible', timeout: 60000 })
    log('Settings page is ready')

    {
      const openInspectButton = page.getByRole('button', { name: '打开 Chrome 调试页' }).first()
      const visible = await openInspectButton.isVisible().catch(() => false)
      if (visible) {
        const [openInspectRequest] = await Promise.all([
          page.waitForRequest(request => request.url() === `${urls.api}/api/files/open` && request.method() === 'POST', { timeout: 10000 }),
          openInspectButton.click({ force: true }),
        ])
        const payload = JSON.parse(openInspectRequest.postData() || '{}')
        assert(payload.url === 'chrome://inspect/#remote-debugging', `Open inspect should send chrome inspect URL, got ${JSON.stringify(payload)}`)
        log('Settings external URL open action passed')
      }
    }

    await clickButtonByText(page, '测试连接')
    await waitForCondition('browser connected status', async () => {
      const statusRes = await requestJson(urls.agent, '/_internal/web-research/status?detailed=1')
      if (!statusRes.ok) return null
      return statusRes.data?.browser?.available ? statusRes.data : null
    }, 120000)
    log('Browser research connection is ready')

    const statusRes = await requestJson(urls.agent, '/_internal/web-research/status?detailed=1')
    assert(statusRes.ok, `web research status failed: ${statusRes.rawText}`)
    assert(statusRes.data?.browser?.available === true, 'Web research browser should be connected during real test')
    const candidateDir = statusRes.data?.paths?.sitePatternsCandidate
    const verifiedDir = statusRes.data?.paths?.sitePatternsVerified
    assert(candidateDir && verifiedDir, 'Web research status should expose candidate and verified paths')

    {
      const [openRequest] = await Promise.all([
        page.waitForRequest(request => request.url() === `${urls.api}/api/files/open` && request.method() === 'POST', { timeout: 10000 }),
        page.getByRole('button', { name: '打开目录' }).first().click({ force: true }),
      ])
      const payload = JSON.parse(openRequest.postData() || '{}')
      assert(typeof payload.path === 'string' && payload.path.length > 0, 'Open directory should send a path payload')
      await page.getByText('已尝试打开目录：').waitFor({ state: 'visible', timeout: 10000 })
      log('Settings path open action passed')
    }

    {
      await page.getByPlaceholder('搜索词，例如 OpenAI Sora 2 official site').fill(GOOGLE_QUERY)
      await page.getByPlaceholder('可选站点，例如 openai.com').fill(GOOGLE_SITE)
      await page.locator('select').nth(0).selectOption('google')
      await clickButtonByText(page, '运行测试')
      const text = await expectSearchResultSummary(page)
      assert(/strategy:\s*google/i.test(text), `Forced Google search should use google strategy, got:\n${text}`)
      assert(/results:\s*[1-9]/.test(text), `Forced Google search should return at least one result, got:\n${text}`)
      log('Google search engine flow passed')
    }

    {
      const bingRes = await requestJson(urls.agent, '/_internal/web-research/search', {
        method: 'POST',
        body: JSON.stringify({
          query: GOOGLE_QUERY,
          site: GOOGLE_SITE,
          engine: 'bing',
        }),
      })
      assert(bingRes.ok, `Forced Bing search failed: ${bingRes.rawText}`)
      const bingResults = Array.isArray(bingRes.data?.results) ? bingRes.data.results : []
      const bingReason = String(bingRes.data?.reason || '')
      const bingStrategy = String(bingRes.data?.strategy || '')
      const bingPassed = (
        (bingResults.length > 0 && bingStrategy.includes('bing'))
        || /反爬拦截|挑战|驗證|验证/i.test(bingReason)
      )
      assert(bingPassed, `Forced Bing search should either return results or clearly report a challenge page. strategy=${bingStrategy} reason=${bingReason}`)
      log('Bing search engine flow passed')
    }

    {
      await page.getByPlaceholder('搜索词，例如 OpenAI Sora 2 official site').fill(DIRECT_SITE_QUERY)
      await page.getByPlaceholder('可选站点，例如 openai.com').fill(DIRECT_SITE_DOMAIN)
      await page.locator('select').nth(0).selectOption('auto')
      await clickButtonByText(page, '运行测试')
      const text = await expectSearchResultSummary(page)
      assert(/results:\s*[1-9]/.test(text), `Explicit site search should return results, got:\n${text}`)

      const directRes = await requestJson(urls.agent, '/_internal/web-research/search', {
        method: 'POST',
        body: JSON.stringify({
          query: DIRECT_SITE_QUERY,
          site: DIRECT_SITE_DOMAIN,
          engine: 'auto',
        }),
      })
      assert(directRes.ok, `Explicit site search verification failed: ${directRes.rawText}`)
      assert(Array.isArray(directRes.data?.results) && directRes.data.results.length > 0, 'Explicit site search verification should return results')

      const strategy = String(directRes.data?.strategy || '')
      const observationText = Array.isArray(directRes.data?.observations)
        ? directRes.data.observations.map(item => item?.message || item?.kind || '').join('；')
        : ''
      const usedDirectSitePath = strategy.startsWith('site:') || /站内搜索.*fallback/i.test(observationText)
      assert(usedDirectSitePath, `Explicit site search should go through site-specific path before engine fallback. strategy=${strategy} observations=${observationText}`)

      const candidatePath = path.join(candidateDir, `${DIRECT_SITE_DOMAIN}.md`)
      await waitForCondition('candidate pattern file created', async () => (
        fs.existsSync(candidatePath) ? candidatePath : null
      ), 30000)
      const candidateMarkdown = fs.readFileSync(candidatePath, 'utf8')
      assert(candidateMarkdown.includes('domain: pypi.org'), 'Candidate pattern should be written for pypi.org')
      assert(candidateMarkdown.includes('## 自动化配置'), 'Candidate pattern should contain automation config')

      const siteInfoRes = await requestJson(urls.agent, `/_internal/web-research/site-info?domain=${encodeURIComponent(DIRECT_SITE_DOMAIN)}`)
      assert(siteInfoRes.ok, `Site info lookup failed: ${siteInfoRes.rawText}`)
      assert(siteInfoRes.data?.candidate?.domain === DIRECT_SITE_DOMAIN, 'Site info should expose pypi.org candidate pattern')
      log('Explicit site search and candidate sedimentation passed')
    }

    {
      const readRes = await requestJson(urls.agent, '/_internal/web-research/read-page', {
        method: 'POST',
        body: JSON.stringify({
          url: READ_TEST_URL,
          extract_mode: 'markdown',
        }),
      })
      assert(readRes.ok, `Read page request failed: ${readRes.rawText}`)
      assert(typeof readRes.data?.title === 'string' && readRes.data.title.length > 0, 'Read page should return a title')
      assert(typeof readRes.data?.content === 'string' && readRes.data.content.length > 500, 'Read page should return substantial content')
      assert(typeof readRes.data?.fetchMethod === 'string' && readRes.data.fetchMethod.length > 0, 'Read page should report fetch method')
      log('Read page runtime flow passed')
    }

    {
      await page.goto(`${urls.api}/`, { waitUntil: 'networkidle', timeout: 90000 })
      const activeProfile = page.getByTestId('active-profile-trigger')
      await activeProfile.waitFor({ state: 'visible', timeout: 60000 })
      const activeProfileText = await activeProfile.innerText()
      assert(activeProfileText.includes(selectedProfile.name), `Active profile should be ${selectedProfile.name}, got ${activeProfileText}`)

      const sessionsBefore = await listSessions(urls.api)
      const previousIds = new Set(sessionsBefore.map(item => item.id))

      await fillAndSend(page, CONVERSE_PROMPT)

      const converseSessionId = await findLatestConverseSessionId(urls.api, previousIds)
      const detail = await waitForCompletedConverseSession(urls.api, converseSessionId, CONVERSE_TIMEOUT_MS)
      const messages = Array.isArray(detail?.messages) ? detail.messages : []
      const researchLog = await waitForCondition('converse research log lines', async () => {
        const text = fs.readFileSync(agentHandle.logPath, 'utf8')
        const usedDirectSearch = text.includes('Searching via pypi.org direct site search:')
          || text.includes('Trying direct search URL for pypi.org:')
        const usedReadPage = /\[WebResearch:(?:Jina|CDP|Static)\] Reading page: https:\/\/pypi\.org\/project\//.test(text)
        return usedDirectSearch && usedReadPage ? text : null
      }, 30000)
      assert(researchLog.includes('Web Research MCP injected'), 'Converse session should inject LaborAny web research MCP')

      const latestAssistant = messages
        .filter(item => item && item.type === 'assistant' && typeof item.content === 'string')
        .slice(-1)[0]
      const assistantContent = String(latestAssistant?.content || '')
      assert(/\[.+\]\(https:\/\/pypi\.org\//i.test(assistantContent), `Assistant should return clickable PyPI links, got:\n${assistantContent}`)

      const assistantLink = await waitForCondition('assistant markdown link', async () => {
        const locator = page.locator('.prose a[href^="https://pypi.org/"]').first()
        return await locator.isVisible().catch(() => false) ? locator : null
      }, 30000)
      await assistantLink.scrollIntoViewIfNeeded().catch(() => {})
      log('Converse research toolchain and assistant link rendering passed')
    }

    {
      await page.goto(`${urls.api}/settings#tools`, { waitUntil: 'networkidle', timeout: 90000 })
      await page.getByText('待评审候选经验').waitFor({ state: 'visible', timeout: 30000 })
      const candidateCard = await waitForCondition('pypi candidate card', async () => {
        const locator = page.locator('div').filter({ hasText: DIRECT_SITE_DOMAIN }).filter({ hasText: '策略：' }).first()
        return await locator.isVisible().catch(() => false) ? locator : null
      }, 30000)

      await candidateCard.getByRole('button', { name: '批准' }).first().click({ force: true })

      await waitForCondition('candidate removed from backend list', async () => {
        const candidatesRes = await requestJson(urls.agent, '/_internal/web-research/site-patterns/candidates')
        if (!candidatesRes.ok) return null
        const candidates = Array.isArray(candidatesRes.data?.candidates) ? candidatesRes.data.candidates : []
        return candidates.some(item => item?.domain === DIRECT_SITE_DOMAIN) ? null : true
      }, 30000)

      const candidatePath = path.join(candidateDir, `${DIRECT_SITE_DOMAIN}.md`)
      const verifiedPath = path.join(verifiedDir, `${DIRECT_SITE_DOMAIN}.md`)
      await waitForCondition('candidate moved to verified', async () => (
        !fs.existsSync(candidatePath) && fs.existsSync(verifiedPath) ? verifiedPath : null
      ), 30000)
      const verifiedMarkdown = fs.readFileSync(verifiedPath, 'utf8')
      assert(verifiedMarkdown.includes('domain: pypi.org'), 'Verified pattern should exist after review approval')
      log('Candidate review flow passed')
    }

    assert(pageErrors.length === 0, `Page errors detected:\n${pageErrors.join('\n')}`)
    assert(requestFailures.length === 0, `Request failures detected:\n${requestFailures.join('\n')}`)
    assert(failedResponses.length === 0, `HTTP 5xx responses detected:\n${failedResponses.join('\n')}`)

    log('All web research real checks passed')
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
  console.error(`[verify-web-research-real] FAILED: ${message}`)
  process.exit(1)
})
