const fs = require('fs')
const path = require('path')

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function normalizeComparablePath(input) {
  const resolved = path.resolve(input)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function isSamePath(a, b) {
  return normalizeComparablePath(a) === normalizeComparablePath(b)
}

function copyFileIfMissing(sourcePath, targetPath, counters) {
  if (fs.existsSync(targetPath)) {
    counters.skipped += 1
    return
  }

  ensureDir(path.dirname(targetPath))
  fs.copyFileSync(sourcePath, targetPath)
  counters.copied += 1
}

function copyDirIncremental(sourceDir, targetDir, counters) {
  if (!fs.existsSync(sourceDir)) return
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    const fromPath = path.join(sourceDir, entry.name)
    const toPath = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      ensureDir(toPath)
      copyDirIncremental(fromPath, toPath, counters)
      continue
    }
    if (entry.isFile()) {
      copyFileIfMissing(fromPath, toPath, counters)
    }
  }
}

function getLegacyCandidates(userDataDir, appDataDir, homeDir) {
  const candidates = []

  if (process.platform === 'win32') {
    candidates.push(
      path.join(appDataDir, 'LaborAny'),
      path.join(appDataDir, 'laborany'),
    )
  } else if (process.platform === 'darwin') {
    candidates.push(
      path.join(homeDir, 'Library', 'Application Support', 'LaborAny'),
      path.join(homeDir, 'Library', 'Application Support', 'laborany'),
    )
  } else {
    candidates.push(
      path.join(homeDir, '.config', 'LaborAny'),
      path.join(homeDir, '.config', 'laborany'),
    )
  }

  return Array.from(new Set(candidates.filter(item => !isSamePath(item, userDataDir))))
}

function migrateLegacyAppHomes(options) {
  const { userDataDir, appDataDir, homeDir } = options
  ensureDir(userDataDir)

  const candidates = getLegacyCandidates(userDataDir, appDataDir, homeDir)
  const report = {
    generatedAt: new Date().toISOString(),
    targetHome: userDataDir,
    sources: [],
    summary: {
      copied: 0,
      skipped: 0,
      migratedSources: 0,
    },
  }

  for (const sourceDir of candidates) {
    if (!fs.existsSync(sourceDir)) {
      report.sources.push({
        source: sourceDir,
        status: 'missing',
        copied: 0,
        skipped: 0,
      })
      continue
    }

    const counters = { copied: 0, skipped: 0 }
    try {
      copyDirIncremental(sourceDir, userDataDir, counters)
      report.sources.push({
        source: sourceDir,
        status: 'copied',
        copied: counters.copied,
        skipped: counters.skipped,
      })
      report.summary.copied += counters.copied
      report.summary.skipped += counters.skipped
      report.summary.migratedSources += 1
    } catch (error) {
      report.sources.push({
        source: sourceDir,
        status: 'error',
        copied: counters.copied,
        skipped: counters.skipped,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const reportPath = path.join(userDataDir, 'migration-report.json')
  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')
  } catch {
    // ignore write failure to avoid blocking startup
  }

  return {
    report,
    reportPath,
  }
}

module.exports = {
  migrateLegacyAppHomes,
}

