#!/usr/bin/env node

const https = require('https')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync, execSync } = require('child_process')

const ROOT_DIR = path.join(__dirname, '..')
const CACHE_DIR = path.join(os.homedir(), '.laborany', 'cache')
const TARGET_DIR = path.join(ROOT_DIR, 'git-bash')
const RELEASE_API_URL = process.env.GIT_BASH_RELEASE_API || 'https://api.github.com/repos/git-for-windows/git/releases/latest'

function log(message) {
  console.log(`[bundle-git-bash] ${message}`)
}

function fail(message) {
  console.error(`[bundle-git-bash] ERROR: ${message}`)
  process.exit(1)
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'laborany-build',
        'Accept': 'application/vnd.github+json',
      },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        requestJson(res.headers.location).then(resolve).catch(reject)
        return
      }

      if ((res.statusCode || 500) >= 400) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }

      let raw = ''
      res.setEncoding('utf-8')
      res.on('data', chunk => { raw += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw))
        } catch (error) {
          reject(new Error(`Invalid JSON from ${url}: ${error instanceof Error ? error.message : String(error)}`))
        }
      })
    })

    req.setTimeout(15000, () => req.destroy(new Error(`Request timeout for ${url}`)))
    req.on('error', reject)
    req.end()
  })
}

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const tempFile = `${destination}.partial`
    fs.rmSync(tempFile, { force: true })
    const file = fs.createWriteStream(tempFile)
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'laborany-build',
      },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        fs.rmSync(tempFile, { force: true })
        downloadFile(res.headers.location, destination).then(resolve).catch(reject)
        return
      }

      if ((res.statusCode || 500) >= 400) {
        fs.rmSync(tempFile, { force: true })
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }

      res.pipe(file)
      file.on('finish', () => {
        file.close()
        fs.renameSync(tempFile, destination)
        resolve()
      })
      file.on('error', (error) => {
        fs.rmSync(tempFile, { force: true })
        reject(error)
      })
    })

    req.setTimeout(30000, () => req.destroy(new Error(`Download timeout for ${url}`)))
    req.on('error', (error) => {
      try {
        file.close()
      } catch {
        // ignore
      }
      fs.rmSync(tempFile, { force: true })
      reject(error)
    })
    req.end()
  })
}

async function downloadWithRetry(url, destination, retries = 3) {
  let lastError = null
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await downloadFile(url, destination)
      return
    } catch (error) {
      lastError = error
      if (attempt < retries) {
        const delayMs = attempt * 1500
        log(`Download failed (attempt ${attempt}/${retries}), retrying in ${delayMs}ms`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function selectAsset(assets) {
  const portableAssets = assets.filter(item => /PortableGit-.*-64-bit\.7z\.exe$/i.test(item.name || ''))
  if (portableAssets.length === 0) {
    return null
  }

  const preferred = portableAssets.find(item => !String(item.name || '').toLowerCase().includes('rc'))
  return preferred || portableAssets[0]
}

function copyDirRecursive(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true })
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(sourcePath, targetPath)
    } else {
      fs.copyFileSync(sourcePath, targetPath)
    }
  }
}

function findBashPath(baseDir) {
  const candidates = [
    path.join(baseDir, 'bin', 'bash.exe'),
    path.join(baseDir, 'usr', 'bin', 'bash.exe'),
  ]
  return candidates.find(item => fs.existsSync(item)) || null
}

function extractPortableGit(installerPath, destinationDir) {
  execFileSync(installerPath, [`-o${destinationDir}`, '-y'], { stdio: 'inherit' })
}

function resolveSystemGitRoot() {
  const candidates = []
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const programW6432 = process.env.ProgramW6432 || programFiles

  candidates.push(
    path.join(programFiles, 'Git'),
    path.join(programW6432, 'Git'),
    path.join(programFilesX86, 'Git'),
    'C:\\Git',
    'D:\\Git'
  )

  try {
    const output = execSync('where git', { encoding: 'utf-8' })
    for (const line of output.split(/\r?\n/)) {
      const gitPath = line.trim()
      if (!gitPath) continue
      const lower = gitPath.toLowerCase()
      if (lower.endsWith('\\cmd\\git.exe') || lower.endsWith('\\bin\\git.exe')) {
        candidates.push(path.dirname(path.dirname(gitPath)))
      }
    }
  } catch {
    // ignore
  }

  for (const candidate of candidates) {
    if (!candidate) continue
    const normalized = candidate.replace(/[\\/]+$/, '')
    if (findBashPath(normalized)) {
      return normalized
    }
  }
  return null
}

async function resolveGitBashUrl() {
  if (process.env.GIT_BASH_URL) {
    return process.env.GIT_BASH_URL
  }

  const payload = await requestJson(RELEASE_API_URL)
  const assets = Array.isArray(payload?.assets) ? payload.assets : []
  const selected = selectAsset(assets)
  if (!selected?.browser_download_url) {
    throw new Error('Unable to find PortableGit 64-bit package in latest release assets')
  }
  return selected.browser_download_url
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node scripts/bundle-git-bash.js')
    console.log('Downloads PortableGit and prepares ./git-bash for Windows packaging.')
    return
  }

  if (process.platform !== 'win32') {
    log('Non-Windows platform detected, skipping Git Bash bundle')
    return
  }

  const systemGitRoot = resolveSystemGitRoot()
  if (systemGitRoot) {
    log(`Using system Git installation: ${systemGitRoot}`)
    fs.rmSync(TARGET_DIR, { recursive: true, force: true })
    copyDirRecursive(systemGitRoot, TARGET_DIR)
    const bundledBash = findBashPath(TARGET_DIR)
    if (bundledBash) {
      log(`Done. Bundled Git Bash path: ${bundledBash}`)
      return
    }
    log('System Git copy did not contain bash.exe, fallback to PortableGit download')
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true })

  const downloadUrl = await resolveGitBashUrl()
  const fileName = path.basename(downloadUrl.split('?')[0])
  const cacheInstaller = path.join(CACHE_DIR, fileName)
  const tempDir = path.join(os.tmpdir(), `laborany-git-bash-${Date.now()}`)
  const minExpectedSizeBytes = 20 * 1024 * 1024

  if (fs.existsSync(cacheInstaller)) {
    const { size } = fs.statSync(cacheInstaller)
    if (size < minExpectedSizeBytes) {
      log(`Cached installer is too small (${size} bytes), re-downloading`)
      fs.rmSync(cacheInstaller, { force: true })
    }
  }

  if (!fs.existsSync(cacheInstaller)) {
    log(`Downloading PortableGit: ${downloadUrl}`)
    await downloadWithRetry(downloadUrl, cacheInstaller)
  } else {
    log(`Using cached PortableGit: ${cacheInstaller}`)
  }

  fs.rmSync(tempDir, { recursive: true, force: true })
  fs.mkdirSync(tempDir, { recursive: true })

  log('Extracting PortableGit...')
  try {
    extractPortableGit(cacheInstaller, tempDir)
  } catch (error) {
    log('Initial extraction failed, re-downloading installer and retrying once')
    fs.rmSync(cacheInstaller, { force: true })
    await downloadWithRetry(downloadUrl, cacheInstaller)
    extractPortableGit(cacheInstaller, tempDir)
  }

  const entries = fs.readdirSync(tempDir, { withFileTypes: true })
  const sourceRoot = entries.length === 1 && entries[0].isDirectory()
    ? path.join(tempDir, entries[0].name)
    : tempDir

  const extractedBash = findBashPath(sourceRoot)
  if (!extractedBash) {
    fail('PortableGit extracted successfully, but bash.exe was not found')
  }

  fs.rmSync(TARGET_DIR, { recursive: true, force: true })
  copyDirRecursive(sourceRoot, TARGET_DIR)

  const bundledBash = findBashPath(TARGET_DIR)
  if (!bundledBash) {
    fail('Failed to prepare git-bash directory: bash.exe not found in target')
  }

  fs.rmSync(tempDir, { recursive: true, force: true })
  log(`Done. Bundled Git Bash path: ${bundledBash}`)
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
})
