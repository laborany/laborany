#!/usr/bin/env node

const { spawnSync } = require('child_process')
const { existsSync, readFileSync } = require('fs')
const { dirname, join, resolve } = require('path')

const argv = process.argv.slice(2)
const tool = argv[0]
const args = argv.slice(1)
const DEBUG = ['1', 'true', 'yes', 'on'].includes(String(process.env.RUN_LOCAL_BIN_DEBUG || '').toLowerCase())

if (!tool) {
  console.error('[run-local-bin] Usage: node scripts/run-local-bin.js <tool> [...args]')
  process.exit(1)
}

const TOOL_PACKAGE_FALLBACK = {
  tsc: 'typescript',
  tsserver: 'typescript',
  pkg: '@yao-pkg/pkg',
  'pkg-fetch': '@yao-pkg/pkg-fetch',
}

function debugLog(message) {
  if (!DEBUG) return
  console.log(`[run-local-bin] Debug: ${message}`)
}

function listBinDirs(startDir) {
  const dirs = []
  let current = resolve(startDir)

  while (true) {
    dirs.push(join(current, 'node_modules', '.bin'))
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  return dirs
}

function findLocalBinary(startDir, binName) {
  const binDirs = listBinDirs(startDir)

  for (const binDir of binDirs) {
    const candidates = process.platform === 'win32'
      ? [
          join(binDir, `${binName}.cmd`),
          join(binDir, `${binName}.exe`),
          join(binDir, `${binName}.bat`),
        ]
      : [join(binDir, binName)]

    const found = candidates.find(p => existsSync(p))
    if (found) return found
  }

  return null
}

function resolvePackageBinary(startDir, binName) {
  const candidates = [binName, TOOL_PACKAGE_FALLBACK[binName]].filter(Boolean)
  const deduped = [...new Set(candidates)]

  for (const packageName of deduped) {
    let packageJsonPath
    try {
      packageJsonPath = require.resolve(`${packageName}/package.json`, { paths: [startDir] })
    } catch {
      continue
    }

    let packageJson
    try {
      packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    } catch {
      continue
    }

    const bin = packageJson.bin
    if (!bin) continue

    let relBin
    if (typeof bin === 'string') {
      relBin = bin
    } else if (typeof bin === 'object') {
      const shortName = packageName.includes('/') ? packageName.split('/').pop() : packageName
      relBin = bin[binName] || bin[packageName] || bin[shortName] || Object.values(bin)[0]
    }

    if (!relBin || typeof relBin !== 'string') continue

    const absoluteBin = resolve(dirname(packageJsonPath), relBin)
    if (!existsSync(absoluteBin)) continue

    return { binary: absoluteBin, packageName }
  }

  return null
}

function shouldRunViaNode(binaryPath) {
  const lower = binaryPath.toLowerCase()
  if (
    lower.endsWith('.js') ||
    lower.endsWith('.cjs') ||
    lower.endsWith('.mjs')
  ) {
    return true
  }
  if (
    lower.endsWith('.exe') ||
    lower.endsWith('.cmd') ||
    lower.endsWith('.bat') ||
    lower.endsWith('.ps1')
  ) {
    return false
  }

  try {
    const firstLine = readFileSync(binaryPath, 'utf-8').split(/\r?\n/, 1)[0]
    return firstLine.includes('node')
  } catch {
    return false
  }
}

const cwd = process.cwd()
debugLog(`cwd=${cwd}`)
debugLog(`tool=${tool} args=${JSON.stringify(args)}`)

if (DEBUG) {
  const searchDirs = listBinDirs(cwd)
  debugLog(`search bin dirs:\n- ${searchDirs.join('\n- ')}`)
}

const shimBinary = findLocalBinary(cwd, tool)

let command = shimBinary
let commandArgs = args

if (!command) {
  const resolved = resolvePackageBinary(cwd, tool)
  if (!resolved) {
    console.error(`[run-local-bin] Cannot find local tool "${tool}" from ${cwd}`)
    process.exit(1)
  }

  if (shouldRunViaNode(resolved.binary)) {
    command = process.execPath
    commandArgs = [resolved.binary, ...args]
  } else {
    command = resolved.binary
  }

  debugLog(`resolved package binary=${resolved.binary}`)
  console.warn(`[run-local-bin] Fallback: use package binary for "${tool}" from ${resolved.packageName}`)
} else {
  debugLog(`resolved shim binary=${command}`)
}

debugLog(`spawn command=${command}`)
debugLog(`spawn args=${JSON.stringify(commandArgs)}`)

const result = spawnSync(command, commandArgs, {
  cwd,
  stdio: 'inherit',
  shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command),
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
