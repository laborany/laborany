const fs = require('fs')
const path = require('path')
const os = require('os')

function resolveDataDir() {
  if (process.env.LABORANY_DATA_DIR) {
    return process.env.LABORANY_DATA_DIR
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    return path.join(appData, 'LaborAny', 'data')
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'LaborAny', 'data')
  }
  return path.join(os.homedir(), '.config', 'laborany', 'data')
}

const NOISE_PATTERNS = [
  /工作流执行上下文/,
  /当前步骤[:：]/,
  /前序步骤结果/,
  /输入参数/,
  /\{\{\s*input\./,
  /尚未确认|尚未指定|未确认|待确认/,
  /LABORANY_ACTION|工具调用记录/,
  /老板好|让我(先|继续|开始)|采集完成|执行完成/,
  /Claude Opus|ChatGPT|巴基斯坦|台湾|Hacker News|Product Hunt|Twitter\/X|Reddit/,
]

function isNoise(line) {
  return NOISE_PATTERNS.some(pattern => pattern.test(line))
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function backupFile(filePath, backupRoot) {
  if (!fs.existsSync(filePath)) return null
  const rel = path.relative(path.dirname(backupRoot), filePath)
  const target = path.join(backupRoot, rel)
  ensureDir(path.dirname(target))
  fs.copyFileSync(filePath, target)
  return target
}

function dedupeAndFilter(lines) {
  const seen = new Set()
  const result = []
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      result.push(line)
      continue
    }
    if (/^---$/.test(line.trim())) {
      result.push(line)
      continue
    }
    if (/^\|[-\s|]+\|$/.test(line.trim())) {
      result.push(line)
      continue
    }
    if (isNoise(line)) continue
    const key = line.toLowerCase().replace(/[\s，。,.；;：:!?！？“”"'‘’（）()\[\]{}<>-]/g, '')
    if (!key) continue
    if (seen.has(key)) continue
    seen.add(key)
    result.push(line)
  }
  return result
}

function cleanProfile(profilePath) {
  if (!fs.existsSync(profilePath)) return { changed: false, removed: 0 }
  const raw = fs.readFileSync(profilePath, 'utf-8')
  const frontmatterMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  const frontmatter = frontmatterMatch ? frontmatterMatch[1] : ''
  const bodyRaw = frontmatterMatch ? raw.slice(frontmatterMatch[0].length) : raw
  const lines = bodyRaw.split(/\r?\n/)
  const currentVersion = (frontmatter.match(/version:\s*(\d+)/)?.[1]) || '1'
  const currentUpdated = (frontmatter.match(/updated:\s*([^\n\r]+)/)?.[1] || '').trim()
  const nowIso = new Date().toISOString()
  const cleaned = []
  let removed = 0

  for (const line of lines) {
    if (/^version:\s*\d+\s*$/.test(line.trim())) continue
    if (/^updated:\s*/.test(line.trim())) continue
    if (/^\|\s*[^|]+\|\s*[^|]+\|\s*[^|]+\|\s*$/.test(line) && !/^\|\s*偏好\s*\|/.test(line) && !/^\|[-\s|]+\|$/.test(line)) {
      if (isNoise(line)) {
        removed++
        continue
      }
    }
    cleaned.push(line)
  }

  const deduped = dedupeAndFilter(cleaned)
  const normalizedBody = deduped.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  const normalizedOldBody = bodyRaw.replace(/\n{3,}/g, '\n\n').trim()
  const bodyChanged = normalizedBody !== normalizedOldBody
  const targetUpdated = bodyChanged ? nowIso : (currentUpdated || nowIso)

  const merged = [
    '---',
    `version: ${currentVersion}`,
    `updated: ${targetUpdated}`,
    '---',
    '',
    ...deduped,
  ]

  const next = merged.join('\n').replace(/\n{3,}/g, '\n\n')
  if (next !== raw) {
    fs.writeFileSync(profilePath, next, 'utf-8')
    return { changed: true, removed }
  }
  return { changed: false, removed }
}

function cleanMemoryMd(memoryPath) {
  if (!fs.existsSync(memoryPath)) return { changed: false, removed: 0 }
  const raw = fs.readFileSync(memoryPath, 'utf-8')
  const lines = raw.split(/\r?\n/)
  const filtered = []
  let removed = 0

  for (const line of lines) {
    const trim = line.trim()
    if (trim.startsWith('- ') || trim.startsWith('### ') || trim.startsWith('**任务记录**') || trim.startsWith('> 归纳自')) {
      if (isNoise(trim)) {
        removed++
        continue
      }
    }
    filtered.push(line)
  }

  const next = dedupeAndFilter(filtered).join('\n').replace(/\n{3,}/g, '\n\n')
  if (next !== raw) {
    fs.writeFileSync(memoryPath, next, 'utf-8')
    return { changed: true, removed }
  }
  return { changed: false, removed }
}

function cleanCells(cellsDir) {
  if (!fs.existsSync(cellsDir)) return { changedFiles: 0, removedFacts: 0 }
  let changedFiles = 0
  let removedFacts = 0

  const walk = dir => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      const stat = fs.statSync(full)
      if (stat.isDirectory()) {
        walk(full)
        continue
      }
      if (!name.endsWith('.md')) continue
      const raw = fs.readFileSync(full, 'utf-8')
      const lines = raw.split(/\r?\n/)
      let changed = false
      const out = []
      for (const line of lines) {
        if (/^- \[(preference|fact|correction|context)\]/.test(line) && isNoise(line)) {
          removedFacts++
          changed = true
          continue
        }
        out.push(line)
      }
      const next = out.join('\n')
      if (changed && next !== raw) {
        fs.writeFileSync(full, next, 'utf-8')
        changedFiles++
      }
    }
  }

  walk(cellsDir)
  return { changedFiles, removedFacts }
}

function main() {
  const dataDir = resolveDataDir()
  if (!fs.existsSync(dataDir)) {
    console.log(`[clean-memory] data dir not found: ${dataDir}`)
    process.exit(0)
  }

  const stamp = new Date().toISOString().replace(/[.:]/g, '-')
  const backupRoot = path.join(dataDir, 'memory', 'cleanup-backups', stamp)
  ensureDir(backupRoot)

  const memoryPath = path.join(dataDir, 'MEMORY.md')
  const profilePath = path.join(dataDir, 'memory', 'profiles', 'PROFILE.md')
  const cellsDir = path.join(dataDir, 'memory', 'cells')

  backupFile(memoryPath, backupRoot)
  backupFile(profilePath, backupRoot)

  const memoryResult = cleanMemoryMd(memoryPath)
  const profileResult = cleanProfile(profilePath)
  const cellResult = cleanCells(cellsDir)

  console.log('[clean-memory] completed')
  console.log(`[clean-memory] dataDir=${dataDir}`)
  console.log(`[clean-memory] backup=${backupRoot}`)
  console.log(`[clean-memory] MEMORY.md changed=${memoryResult.changed} removed=${memoryResult.removed}`)
  console.log(`[clean-memory] PROFILE.md changed=${profileResult.changed} removed=${profileResult.removed}`)
  console.log(`[clean-memory] cells changedFiles=${cellResult.changedFiles} removedFacts=${cellResult.removedFacts}`)
}

main()
