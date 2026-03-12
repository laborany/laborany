#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn, spawnSync } = require('child_process')

const rootDir = path.resolve(__dirname, '..')
const agentDir = path.join(rootDir, 'agent-service')
const frontendDir = path.join(rootDir, 'frontend')

const args = new Set(process.argv.slice(2))
const skipBuild = args.has('--skip-build')
const keepHome = args.has('--keep-home')

function log(message) {
  console.log(`[verify-memory-fastpaths] ${message}`)
}

function fail(message) {
  throw new Error(message)
}

function assert(condition, message) {
  if (!condition) fail(message)
}

function getAppEnvPath() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'laborany', '.env')
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'laborany', '.env')
  }
  return path.join(os.homedir(), '.config', 'laborany', '.env')
}

function getPkgBuildScript() {
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'build:pkg:mac-arm64' : 'build:pkg:mac'
  }
  if (process.platform === 'win32') return 'build:pkg:win'
  if (process.platform === 'linux') return 'build:pkg:linux'
  return null
}

function getAgentLaunchSpec() {
  if (process.platform === 'darwin') {
    const target = path.join(agentDir, 'dist', 'laborany-agent-mac')
    if (fs.existsSync(target)) return { command: target, args: [] }
  }

  if (process.platform === 'win32') {
    const target = path.join(agentDir, 'dist', 'laborany-agent.exe')
    if (fs.existsSync(target)) return { command: target, args: [] }
  }

  if (process.platform === 'linux') {
    const target = path.join(agentDir, 'dist', 'laborany-agent-linux')
    if (fs.existsSync(target)) return { command: target, args: [] }
  }

  return {
    command: process.execPath,
    args: [path.join(agentDir, 'dist', 'bundle.cjs')],
  }
}

function getTsxBinary() {
  if (process.platform === 'win32') {
    return path.join(agentDir, 'node_modules', '.bin', 'tsx.cmd')
  }
  return path.join(agentDir, 'node_modules', '.bin', 'tsx')
}

function run(command, commandArgs, cwd, extraEnv) {
  const useShell = process.platform === 'win32'
  const result = spawnSync(command, commandArgs, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    shell: useShell,
  })

  if (result.status !== 0) {
    fail(`Command failed: ${command} ${commandArgs.join(' ')}`)
  }
}

function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'laborany-fastpaths-'))
}

function writeRuntimeEnv(tmpHome, port) {
  const appEnvPath = getAppEnvPath()
  const runtimeEnvPath = path.join(tmpHome, '.env')
  let content = ''

  if (fs.existsSync(appEnvPath)) {
    content = fs.readFileSync(appEnvPath, 'utf8')
    if (!content.endsWith('\n')) content += '\n'
  }

  content += [
    `AGENT_PORT=${port}`,
    'FEISHU_ENABLED=false',
    'QQ_ENABLED=false',
    '',
  ].join('\n')

  fs.writeFileSync(runtimeEnvPath, content, 'utf8')
  return runtimeEnvPath
}

function cleanupDir(dirPath) {
  if (!dirPath) return
  fs.rmSync(dirPath, { recursive: true, force: true })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
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

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.killed) return

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

  return { ok: res.ok, status: res.status, data, rawText }
}

async function postMemoryRecord(baseUrl, payload) {
  const res = await requestJson(baseUrl, '/memory/record-task', {
    method: 'POST',
    body: JSON.stringify({
      sync: true,
      ...payload,
    }),
  })

  assert(res.ok, `POST /memory/record-task failed: ${res.rawText}`)
  return res.data
}

function getProfileField(profilePayload, sectionName, key) {
  const sections = Array.isArray(profilePayload?.profile?.sections) ? profilePayload.profile.sections : []
  const section = sections.find(item => item && item.name === sectionName)
  if (!section || !Array.isArray(section.fields)) return null
  return section.fields.find(item => item && item.key === key) || null
}

async function waitForReady(baseUrl, logPath, timeoutMs = 30000) {
  const startedAt = Date.now()
  let lastError = ''

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/communication-preferences`)
      if (res.ok) return
      lastError = `status=${res.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await sleep(250)
  }

  const logTail = fs.existsSync(logPath)
    ? fs.readFileSync(logPath, 'utf8').split(/\r?\n/).slice(-60).join('\n')
    : '(log missing)'
  fail(`Agent did not become ready in ${timeoutMs}ms: ${lastError}\n${logTail}`)
}

function extractFirstSseText(raw) {
  const lines = raw.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== 'event: text') continue
    const nextLine = lines[index + 1] || ''
    if (!nextLine.startsWith('data: ')) continue
    const payload = JSON.parse(nextLine.slice(6))
    return typeof payload.content === 'string' ? payload.content : ''
  }
  return ''
}

async function converseText(baseUrl, message) {
  const res = await fetch(`${baseUrl}/converse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: message }],
    }),
  })

  assert(res.ok, `Converse request failed: status=${res.status}`)
  const raw = await res.text()
  const content = extractFirstSseText(raw)
  assert(content, `No text event returned for converse message: ${message}`)
  return content
}

async function verifyManualProtection() {
  const verifyHome = createTempHome()
  try {
    const tsxBinary = getTsxBinary()
    const code = `
      ;(async () => {
        process.env.LABORANY_HOME = ${JSON.stringify(verifyHome)}
        const mod = await import('./src/memory/communication-preferences.ts')
        const manager = mod.communicationPreferenceManager
        manager.clear()
        manager.setManualPreferences({ replyLanguage: 'zh', replyStyle: 'brief' })
        const languagePatch = manager.applyProfilePatch({
          section: '沟通风格',
          key: '回复语言',
          value: '默认使用英文回复',
          evidence: 'test-language',
          confidence: 0.92,
        })
        const stylePatch = manager.applyProfilePatch({
          section: '沟通风格',
          key: '回复风格',
          value: '偏好详细回复',
          evidence: 'test-style',
          confidence: 0.92,
        })
        const current = manager.get()
        if (!languagePatch.handled || languagePatch.applied) throw new Error('manual language should block profile patch')
        if (!stylePatch.handled || stylePatch.applied) throw new Error('manual style should block profile patch')
        if (current.replyLanguage.value !== 'zh' || current.replyLanguage.source !== 'manual') throw new Error('manual language should remain zh/manual')
        if (current.replyStyle.value !== 'brief' || current.replyStyle.source !== 'manual') throw new Error('manual style should remain brief/manual')
        console.log('manual-protection-ok')
      })().catch((error) => {
        console.error(error)
        process.exit(1)
      })
    `

    run(tsxBinary, ['--eval', code], agentDir)
    log('OK manual communication preferences are protected from auto profile overwrite')
  } finally {
    cleanupDir(verifyHome)
  }
}

async function verifyConclusionFirstLongTerm(baseUrl, tmpHome) {
  const sessionId = 'verify_conclusion_first_flow'

  await postMemoryRecord(baseUrl, {
    sessionId,
    skillId: '__converse__',
    userQuery: '以后默认先给我结论，再给详细步骤。',
    assistantResponse: '好的，后续我会先给结论，再补充详细步骤。',
  })

  const firstProfile = await waitForCondition('结论优先画像写入', async () => {
    const res = await requestJson(baseUrl, '/profile')
    if (!res.ok) return null
    const field = getProfileField(res.data, '沟通风格', '结论优先')
    return field ? { profile: res.data, field } : null
  })

  assert(
    firstProfile.field.description === '偏好回复时先给出结论，再展开步骤和细节',
    `Unexpected normalized conclusion-first description: ${firstProfile.field.description}`,
  )

  const firstPreferences = await requestJson(baseUrl, '/communication-preferences')
  assert(firstPreferences.ok, 'GET /communication-preferences after conclusion-first write failed')
  assert(
    firstPreferences.data.replyStyle.value === '',
    `Conclusion-first preference should not auto-set replyStyle, got ${firstPreferences.data.replyStyle.value}`,
  )

  await waitForCondition('结论优先候选入队', async () => {
    const res = await requestJson(baseUrl, '/memory/consolidation-candidates?analyze=false')
    if (!res.ok) return null
    const candidates = Array.isArray(res.data?.candidates) ? res.data.candidates : []
    return candidates.some(item =>
      item
      && item.scope === 'skill'
      && item.skillId === '__converse__'
      && item.content === '偏好回复时先给出结论，再展开步骤和细节'
    ) ? candidates : null
  })

  await postMemoryRecord(baseUrl, {
    sessionId,
    skillId: '__converse__',
    userQuery: '后续回复时先说结论，再展开步骤细节。',
    assistantResponse: '收到，之后我会先给结论，再展开说明。',
  })

  const skillMemoryPath = path.join(tmpHome, 'data', 'memory', 'skills', '__converse__', 'MEMORY.md')
  const globalMemoryPath = path.join(tmpHome, 'data', 'MEMORY.md')
  const longTermResult = await waitForCondition('结论优先长期记忆写入', async () => {
    const statsRes = await requestJson(baseUrl, '/memory/longterm/stats?days=30')
    if (!statsRes.ok) return null
    if (!fs.existsSync(skillMemoryPath)) return null
    if (!fs.existsSync(globalMemoryPath)) return null
    const memoryText = fs.readFileSync(skillMemoryPath, 'utf8')
    const globalMemoryText = fs.readFileSync(globalMemoryPath, 'utf8')
    if (!memoryText.includes('偏好回复时先给出结论，再展开步骤和细节')) return null
    if (!globalMemoryText.includes('偏好回复时先给出结论，再展开步骤和细节')) return null
    return { stats: statsRes.data, memoryText, globalMemoryText }
  })

  assert(
    Number(longTermResult.stats.accepted || 0) >= 1,
    `Expected at least one accepted long-term write, got ${JSON.stringify(longTermResult.stats)}`,
  )

  const finalCandidates = await requestJson(baseUrl, '/memory/consolidation-candidates?analyze=false')
  assert(finalCandidates.ok, 'GET /memory/consolidation-candidates after long-term write failed')
  const matchingCandidates = (Array.isArray(finalCandidates.data?.candidates) ? finalCandidates.data.candidates : [])
    .filter(item =>
      item
      && item.content === '偏好回复时先给出结论，再展开步骤和细节'
    )
  assert(
    matchingCandidates.length === 0,
    `Auto-written candidates should be cleared, found ${matchingCandidates.length}`,
  )

  const finalProfile = await requestJson(baseUrl, '/profile')
  assert(finalProfile.ok, 'GET /profile after long-term write failed')
  const pollutedReplyStyle = getProfileField(finalProfile.data, '沟通风格', '回复风格')
  assert(
    !pollutedReplyStyle || pollutedReplyStyle.description !== '偏好详细回复',
    'Conclusion-first preference should not pollute profile into replyStyle=detailed',
  )

  log('OK conclusion-first preference normalizes, writes skill long-term memory, and avoids style pollution')
}

async function verifyCombinedAddressingAndLongTermFastPath(baseUrl, tmpHome) {
  const reset = await requestJson(baseUrl, '/memory/reset-all', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  assert(reset.ok, `POST /memory/reset-all before combined fast path failed: ${reset.rawText}`)

  const preferredName = '联动阿晨'
  const firstReply = await converseText(baseUrl, `以后叫我${preferredName}，回复时先给结论再给步骤。`)
  assert(firstReply.includes(preferredName), `Unexpected combined fast-path reply: ${firstReply}`)

  await waitForCondition('combined fast-path addressing persistence', async () => {
    const res = await requestJson(baseUrl, '/addressing')
    if (!res.ok) return null
    return res.data?.preferredName === preferredName ? res.data : null
  })

  await waitForCondition('combined fast-path profile persistence', async () => {
    const res = await requestJson(baseUrl, '/profile')
    if (!res.ok) return null
    return getProfileField(res.data, '沟通风格', '结论优先')
  })

  const secondReply = await converseText(baseUrl, `后续还是叫我${preferredName}，回复时先说结论，再展开步骤细节。`)
  assert(secondReply.includes(preferredName), `Unexpected combined second fast-path reply: ${secondReply}`)

  const skillMemoryPath = path.join(tmpHome, 'data', 'memory', 'skills', '__converse__', 'MEMORY.md')
  const globalMemoryPath = path.join(tmpHome, 'data', 'MEMORY.md')
  await waitForCondition('combined fast-path long-term write', async () => {
    const addressingRes = await requestJson(baseUrl, '/addressing')
    const candidatesRes = await requestJson(baseUrl, '/memory/consolidation-candidates?analyze=false')
    if (!addressingRes.ok || !candidatesRes.ok) return null
    if (addressingRes.data?.preferredName !== preferredName) return null
    if (!fs.existsSync(skillMemoryPath) || !fs.existsSync(globalMemoryPath)) return null
    const skillMemoryText = fs.readFileSync(skillMemoryPath, 'utf8')
    const globalMemoryText = fs.readFileSync(globalMemoryPath, 'utf8')
    if (!skillMemoryText.includes('偏好回复时先给出结论，再展开步骤和细节')) return null
    if (!globalMemoryText.includes('偏好回复时先给出结论，再展开步骤和细节')) return null
    const matchingCandidates = (Array.isArray(candidatesRes.data?.candidates) ? candidatesRes.data.candidates : [])
      .filter(item => item && item.content === '偏好回复时先给出结论，再展开步骤和细节')
    return matchingCandidates.length === 0 ? true : null
  }, 120000)

  const metaReply = await converseText(baseUrl, '你现在叫我什么？')
  assert(metaReply === `${preferredName}。`, `Unexpected combined meta reply: ${metaReply}`)

  log('OK combined naming + long-term fast path persists addressing and long-term memory together')
}

async function main() {
  if (!skipBuild) {
    log('Building agent TypeScript output')
    run('npm', ['run', 'build'], agentDir)

    log('Building bundled agent runtime')
    run('npm', ['run', 'build:bundle'], agentDir)

    const pkgScript = getPkgBuildScript()
    if (pkgScript) {
      log(`Building packaged agent binary via ${pkgScript}`)
      run('npm', ['run', pkgScript], agentDir)
    }

    log('Building frontend for settings page verification')
    run('npm', ['run', 'build'], frontendDir)
  }

  const port = 3900 + Math.floor(Math.random() * 500)
  const tmpHome = createTempHome()
  const runtimeEnvPath = writeRuntimeEnv(tmpHome, port)
  const logPath = path.join(tmpHome, 'agent.log')
  const baseUrl = `http://127.0.0.1:${port}`
  const launchSpec = getAgentLaunchSpec()
  const logStream = fs.createWriteStream(logPath, { flags: 'a' })

  log(`Using isolated LABORANY_HOME at ${tmpHome}`)
  log(`Using runtime env at ${runtimeEnvPath}`)
  log(`Launching agent via ${launchSpec.command}`)

  const child = spawn(launchSpec.command, launchSpec.args, {
    cwd: agentDir,
    env: { ...process.env, LABORANY_HOME: tmpHome },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })

  child.stdout.pipe(logStream)
  child.stderr.pipe(logStream)

  let cleaned = false
  const cleanup = async () => {
    if (cleaned) return
    cleaned = true
    await stopChild(child)
    logStream.end()
    if (!keepHome) {
      cleanupDir(tmpHome)
    }
  }

  process.on('SIGINT', async () => {
    await cleanup()
    process.exit(1)
  })
  process.on('SIGTERM', async () => {
    await cleanup()
    process.exit(1)
  })

  try {
    await waitForReady(baseUrl, logPath)
    log('Agent is ready')

    const addressingInitial = await requestJson(baseUrl, '/addressing')
    assert(addressingInitial.ok, 'GET /addressing failed')
    assert(addressingInitial.data.preferredName === '', 'Initial addressing should be empty')
    log('OK initial addressing is empty')

    const initialPreferences = await requestJson(baseUrl, '/communication-preferences')
    assert(initialPreferences.ok, 'GET /communication-preferences failed')
    assert(initialPreferences.data.replyLanguage.value === '', 'Initial replyLanguage should be empty')
    assert(initialPreferences.data.replyStyle.value === '', 'Initial replyStyle should be empty')
    log('OK initial communication preferences are empty')

    const notificationCount = await requestJson(baseUrl, '/notifications/unread-count')
    assert(notificationCount.ok, `GET /notifications/unread-count failed: ${notificationCount.rawText}`)
    assert(typeof notificationCount.data.count === 'number', 'Unread notification count should be a number')
    log('OK packaged notifications unread-count endpoint is healthy')

    const autoNamingReply = await converseText(baseUrl, '我叫阿晨，你现在应该怎么称呼我？')
    assert(autoNamingReply.includes('阿晨'), `Unexpected naming fast-path reply: ${autoNamingReply}`)
    const autoAddressing = await requestJson(baseUrl, '/addressing')
    assert(autoAddressing.ok, 'GET /addressing after auto naming failed')
    assert(autoAddressing.data.preferredName === '阿晨', 'Auto naming did not persist preferredName=阿晨')
    assert(autoAddressing.data.source === 'auto', 'Auto naming should persist with source=auto')
    log(`OK explicit naming fast path replied "${autoNamingReply}" and persisted`)

    const manualAddressing = await requestJson(baseUrl, '/addressing', {
      method: 'PUT',
      body: JSON.stringify({ preferredName: 'Nathan' }),
    })
    assert(manualAddressing.ok, `PUT /addressing failed: ${manualAddressing.rawText}`)
    assert(manualAddressing.data.preferredName === 'Nathan', 'Manual addressing did not persist Nathan')
    assert(manualAddressing.data.source === 'manual', 'Manual addressing should persist with source=manual')
    const metaReply = await converseText(baseUrl, '你现在叫我什么？')
    assert(metaReply === 'Nathan。', `Unexpected meta addressing reply: ${metaReply}`)
    log('OK manual addressing overrides meta query response')

    const manualPreferences = await requestJson(baseUrl, '/communication-preferences', {
      method: 'PUT',
      body: JSON.stringify({ replyLanguage: 'zh', replyStyle: 'brief' }),
    })
    assert(manualPreferences.ok, `PUT /communication-preferences failed: ${manualPreferences.rawText}`)
    assert(manualPreferences.data.replyLanguage.value === 'zh', 'Manual replyLanguage should be zh')
    assert(manualPreferences.data.replyLanguage.source === 'manual', 'Manual replyLanguage source should be manual')
    assert(manualPreferences.data.replyStyle.value === 'brief', 'Manual replyStyle should be brief')
    assert(manualPreferences.data.replyStyle.source === 'manual', 'Manual replyStyle source should be manual')
    log('OK manual communication preferences persisted')

    const encodedQuery = encodeURIComponent('随便开始一个任务')
    const memoryContext = await requestJson(baseUrl, `/memory-context/general?query=${encodedQuery}`)
    assert(memoryContext.ok, 'GET /memory-context/general failed')
    const context = String(memoryContext.data.context || '')
    assert(context.includes('默认使用中文回复用户。'), 'Memory context missing manual replyLanguage section')
    assert(context.includes('默认尽量简洁回复。'), 'Memory context missing manual replyStyle section')
    log('OK memory context injects manual communication preferences')

    const autoPreferenceReply = await converseText(baseUrl, '以后都用英文回复我，后续尽量详细一点。')
    assert(autoPreferenceReply.includes('英文'), `Unexpected communication reply: ${autoPreferenceReply}`)
    assert(autoPreferenceReply.includes('详细'), `Unexpected communication reply: ${autoPreferenceReply}`)
    const updatedPreferences = await requestJson(baseUrl, '/communication-preferences')
    assert(updatedPreferences.ok, 'GET /communication-preferences after auto update failed')
    assert(updatedPreferences.data.replyLanguage.value === 'en', 'Auto preference update should set replyLanguage=en')
    assert(updatedPreferences.data.replyLanguage.source === 'auto', 'Auto preference update should set source=auto')
    assert(updatedPreferences.data.replyStyle.value === 'detailed', 'Auto preference update should set replyStyle=detailed')
    assert(updatedPreferences.data.replyStyle.source === 'auto', 'Auto preference update should set source=auto')
    log(`OK explicit communication preference fast path replied "${autoPreferenceReply}" and persisted`)

    const resetAll = await requestJson(baseUrl, '/memory/reset-all', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    assert(resetAll.ok, `POST /memory/reset-all failed: ${resetAll.rawText}`)
    const addressingAfterReset = await requestJson(baseUrl, '/addressing')
    const preferencesAfterReset = await requestJson(baseUrl, '/communication-preferences')
    assert(addressingAfterReset.data.preferredName === '', 'Reset-all should clear addressing')
    assert(preferencesAfterReset.data.replyLanguage.value === '', 'Reset-all should clear replyLanguage')
    assert(preferencesAfterReset.data.replyStyle.value === '', 'Reset-all should clear replyStyle')
    log('OK reset-all clears addressing and communication preferences')

    await verifyConclusionFirstLongTerm(baseUrl, tmpHome)
    await verifyCombinedAddressingAndLongTermFastPath(baseUrl, tmpHome)

    await verifyManualProtection()
    log('All checks passed')
  } finally {
    await cleanup()
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[verify-memory-fastpaths] FAILED: ${message}`)
  process.exit(1)
})
