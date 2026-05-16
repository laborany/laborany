#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

const PLATFORM_SPECS = {
  'darwin-arm64': { dir: 'ffmpeg-bundle-darwin-arm64', exe: 'ffmpeg' },
  'darwin-x64': { dir: 'ffmpeg-bundle-darwin-x64', exe: 'ffmpeg' },
  'linux-x64': { dir: 'ffmpeg-bundle-linux-x64', exe: 'ffmpeg' },
  'win-x64': { dir: 'ffmpeg-bundle-win-x64', exe: 'ffmpeg.exe' },
}

function currentPlatformKey() {
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'
  if (process.platform === 'linux' && process.arch === 'x64') return 'linux-x64'
  if (process.platform === 'win32' && process.arch === 'x64') return 'win-x64'
  return null
}

function parseTargets() {
  const arg = process.argv.find(item => item.startsWith('--platform='))
  const target = arg ? arg.split('=')[1] : 'current'

  if (target === 'current') {
    const key = currentPlatformKey()
    if (!key) throw new Error(`Unsupported current platform: ${process.platform}/${process.arch}`)
    return [key]
  }
  if (target === 'all') return Object.keys(PLATFORM_SPECS)
  if (target === 'mac-universal') return ['darwin-arm64', 'darwin-x64']
  if (PLATFORM_SPECS[target]) return [target]
  throw new Error(`Unknown platform: ${target}`)
}

function verifyOne(key) {
  const spec = PLATFORM_SPECS[key]
  const binaryPath = path.join(REPO_ROOT, spec.dir, spec.exe)

  if (!fs.existsSync(binaryPath)) {
    throw new Error(`${key}: missing ${binaryPath}. Run npm run bundle:ffmpeg:${key === 'win-x64' ? 'win' : key === 'linux-x64' ? 'linux' : key}.`)
  }

  const fileStat = fs.statSync(binaryPath)
  if (!fileStat.isFile() || fileStat.size < 1_000_000) {
    throw new Error(`${key}: invalid ffmpeg binary at ${binaryPath} (${fileStat.size} bytes)`)
  }

  if (process.platform !== 'win32' && !key.startsWith('win-')) {
    fs.chmodSync(binaryPath, fileStat.mode | 0o755)
  }

  if (key === currentPlatformKey()) {
    const result = spawnSync(binaryPath, ['-version'], { encoding: 'utf8' })
    if (result.error || result.status !== 0) {
      throw new Error(`${key}: ffmpeg cannot execute: ${result.error?.message || result.stderr || result.status}`)
    }
    const firstLine = (result.stdout || '').split('\n')[0] || 'ffmpeg'
    console.log(`[ok] ${key}: ${binaryPath} (${(fileStat.size / 1e6).toFixed(1)} MB) ${firstLine}`)
    return
  }

  console.log(`[ok] ${key}: ${binaryPath} (${(fileStat.size / 1e6).toFixed(1)} MB)`)
}

try {
  for (const key of parseTargets()) {
    verifyOne(key)
  }
} catch (error) {
  console.error(`[verify-ffmpeg-bundle] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
