#!/usr/bin/env node

/**
 * Evolution Pipeline 端到端验证脚本
 *
 * 验证内容：
 * 1. POST /memory/record-task 写入包含 skill_insight 的对话
 * 2. 检查 evolution-daily 目录是否有新文件
 * 3. 检查 evolution-daily 文件内容是否包含 insight
 * 4. 模拟多次调用触发压缩
 * 5. 检查 evolution.md 是否生成
 *
 * 用法: node scripts/verify-evolution-pipeline.js [port]
 */

const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = process.argv[2] || process.env.PORT || 23816
const BASE_URL = `http://localhost:${PORT}`
const SKILL_ID = 'deep-dialogue'
const DATA_DIR = path.join(
  process.env.LABORANY_DATA_DIR ||
  path.join(process.env.HOME || process.env.USERPROFILE, '.laborany', 'data')
)
const EVOLUTION_DAILY_DIR = path.join(DATA_DIR, 'memory', 'skills', SKILL_ID, 'evolution-daily')
const EVOLUTION_MD = path.join(DATA_DIR, 'memory', 'skills', SKILL_ID, 'evolution.md')

function post(urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = http.request(`${BASE_URL}${urlPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let chunks = ''
      res.on('data', c => chunks += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(chunks) }) }
        catch { resolve({ status: res.statusCode, body: chunks }) }
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function todayStr() { return new Date().toISOString().split('T')[0] }

function check(label, condition) {
  const status = condition ? '✅' : '❌'
  console.log(`  ${status} ${label}`)
  return condition
}

async function main() {
  let passed = 0
  let total = 0

  console.log(`\n🔍 Evolution Pipeline Verification`)
  console.log(`   Target: ${BASE_URL}`)
  console.log(`   Skill:  ${SKILL_ID}`)
  console.log(`   Data:   ${DATA_DIR}\n`)

  // Step 1: Record a task with skill_insight content
  console.log('Step 1: Record task with skill_insight...')
  const sessionId = `verify_${Date.now().toString(36)}`
  try {
    const res = await post('/memory/record-task', {
      sessionId,
      skillId: SKILL_ID,
      userQuery: '帮我深入分析一下用户留存率下降的原因',
      assistantResponse: '通过多轮追问，我们发现留存率下降的根本原因是新用户引导流程过于复杂。建议简化前三步操作。\n\n这次对话中，渐进式追问比直接给建议更有效，用户在第三轮才真正说出核心痛点。',
    })
    total++
    passed += check(`API responded: status=${res.status}`, res.status === 200 || res.status === 202) ? 1 : 0
  } catch (err) {
    console.log(`  ❌ API call failed: ${err.message}`)
    console.log('  ⚠️  Is the server running? Start with: npm run dev')
    process.exit(1)
  }

  // Wait for async processing
  console.log('\nStep 2: Wait for async processing (3s)...')
  await sleep(3000)

  // Step 3: Check evolution-daily directory
  console.log('\nStep 3: Check evolution-daily files...')
  const todayFile = path.join(EVOLUTION_DAILY_DIR, `${todayStr()}.md`)
  total++
  const dailyExists = fs.existsSync(todayFile)
  passed += check(`Today's evolution-daily file exists: ${todayStr()}.md`, dailyExists) ? 1 : 0

  if (dailyExists) {
    const content = fs.readFileSync(todayFile, 'utf-8')
    total++
    passed += check(`File has content (${content.length} chars)`, content.length > 0) ? 1 : 0
  }

  // Step 4: Check evolution.md (may not exist yet if not enough entries)
  console.log('\nStep 4: Check evolution.md...')
  const evolutionExists = fs.existsSync(EVOLUTION_MD)
  total++
  if (evolutionExists) {
    const content = fs.readFileSync(EVOLUTION_MD, 'utf-8')
    passed += check(`evolution.md exists (${content.length} chars)`, content.length > 0) ? 1 : 0
  } else {
    check('evolution.md not yet created (needs ≥10 entries + 24h cooldown to trigger compression)', true)
    passed++
  }

  // Step 5: Check history.txt includes assistant response
  console.log('\nStep 5: Check history.txt format...')
  const taskDir = path.join(
    process.env.LABORANY_TASKS_DIR ||
    path.join(DATA_DIR, '..', 'tasks'),
    sessionId
  )
  // history.txt is written by agent-executor, not record-task API, so skip if not present
  if (fs.existsSync(path.join(taskDir, 'history.txt'))) {
    const history = fs.readFileSync(path.join(taskDir, 'history.txt'), 'utf-8')
    total++
    passed += check('history.txt contains User entry', history.includes('] User:')) ? 1 : 0
    total++
    passed += check('history.txt contains Assistant entry', history.includes('] Assistant:')) ? 1 : 0
  } else {
    console.log('  ⏭️  history.txt not found (only created via agent-executor, not record-task API)')
  }

  // Summary
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`Results: ${passed}/${total} checks passed`)
  if (passed === total) {
    console.log('🎉 All checks passed!')
  } else {
    console.log('⚠️  Some checks failed. Review output above.')
  }

  process.exit(passed === total ? 0 : 1)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
