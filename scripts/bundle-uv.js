#!/usr/bin/env node
/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    uv Bundle Script                                       ║
 * ║                                                                          ║
 * ║  功能：下载 uv 二进制到 bundle 目录                                        ║
 * ║  用法：node scripts/bundle-uv.js [platform]                               ║
 * ║  平台：win, mac, mac-x64, mac-arm64, mac-universal, linux                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

const https = require('https')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const os = require('os')

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           配置                                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const UV_VERSION = '0.5.14'
const ROOT_DIR = path.join(__dirname, '..')
const CACHE_DIR = path.join(os.homedir(), '.laborany', 'cache')

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           工具函数                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function log(msg) {
  console.log(`[bundle-uv] ${msg}`)
}

function getPlatform() {
  const arg = process.argv[2]
  if (arg) return arg

  const platform = os.platform()
  if (platform === 'win32') return 'win'
  if (platform === 'darwin') return 'mac'
  return 'linux'
}

function parseArg(arg) {
  if (!arg || !arg.includes('-')) return { platform: arg, arch: null, universal: false }

  const parts = arg.split('-')
  const platform = parts[0]
  const archOrUniversal = parts[1]

  if (archOrUniversal === 'universal') {
    return { platform, arch: null, universal: true }
  }

  // 转换为 uv 使用的架构名称
  let uvArch = archOrUniversal
  if (archOrUniversal === 'arm64') uvArch = 'aarch64'
  if (archOrUniversal === 'x64') uvArch = 'x86_64'

  return { platform, arch: uvArch, universal: false }
}

function getUvUrl(platform, arch) {
  const base = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}`

  if (platform === 'win') {
    return `${base}/uv-x86_64-pc-windows-msvc.zip`
  } else if (platform === 'mac') {
    return `${base}/uv-${arch}-apple-darwin.tar.gz`
  } else {
    return `${base}/uv-${arch}-unknown-linux-gnu.tar.gz`
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    log(`下载: ${url}`)

    const makeRequest = (requestUrl) => {
      https.get(requestUrl, {
        headers: { 'User-Agent': 'LaborAny-Bundler' }
      }, (response) => {
        // 处理重定向
        if (response.statusCode === 302 || response.statusCode === 301) {
          makeRequest(response.headers.location)
          return
        }

        if (response.statusCode !== 200) {
          reject(new Error(`下载失败: HTTP ${response.statusCode}`))
          return
        }

        const file = fs.createWriteStream(dest)
        response.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve()
        })
      }).on('error', reject)
    }

    makeRequest(url)
  })
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           辅助函数                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function findFile(dir, filename) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findFile(fullPath, filename)
      if (found) return found
    } else if (entry.name === filename) {
      return fullPath
    }
  }

  return null
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       打包单个架构                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function bundleSingleArch(platform, arch, bundleDir) {
  log(`打包 ${platform}-${arch} 到 ${bundleDir}`)

  // 清理并创建目录
  if (fs.existsSync(bundleDir)) {
    fs.rmSync(bundleDir, { recursive: true })
  }
  fs.mkdirSync(bundleDir, { recursive: true })
  fs.mkdirSync(CACHE_DIR, { recursive: true })

  // 下载 uv
  const uvUrl = getUvUrl(platform, arch)
  const ext = platform === 'win' ? 'zip' : 'tar.gz'
  const cacheFile = path.join(CACHE_DIR, `uv-${UV_VERSION}-${platform}-${arch}.${ext}`)

  if (!fs.existsSync(cacheFile)) {
    await download(uvUrl, cacheFile)
    log(`已缓存到: ${cacheFile}`)
  } else {
    log(`使用缓存: ${cacheFile}`)
  }

  // 解压 uv
  log('解压 uv...')
  const tempDir = path.join(os.tmpdir(), `uv-extract-${Date.now()}`)
  fs.mkdirSync(tempDir, { recursive: true })

  if (platform === 'win') {
    // Windows: 使用 PowerShell 解压 zip
    execSync(`powershell -Command "Expand-Archive -Path '${cacheFile}' -DestinationPath '${tempDir}' -Force"`)

    // 查找 uv.exe
    const uvExe = findFile(tempDir, 'uv.exe')
    if (!uvExe) {
      throw new Error('未找到 uv.exe')
    }
    fs.copyFileSync(uvExe, path.join(bundleDir, 'uv.exe'))

    // 同时复制 uvx.exe（如果存在）
    const uvxExe = findFile(tempDir, 'uvx.exe')
    if (uvxExe) {
      fs.copyFileSync(uvxExe, path.join(bundleDir, 'uvx.exe'))
    }
  } else {
    // Unix: 使用 tar 解压
    execSync(`tar -xzf "${cacheFile}" -C "${tempDir}"`)

    // 查找 uv 二进制
    const uvBin = findFile(tempDir, 'uv')
    if (!uvBin) {
      throw new Error('未找到 uv 二进制')
    }
    fs.copyFileSync(uvBin, path.join(bundleDir, 'uv'))
    fs.chmodSync(path.join(bundleDir, 'uv'), 0o755)

    // 同时复制 uvx（如果存在）
    const uvxBin = findFile(tempDir, 'uvx')
    if (uvxBin) {
      fs.copyFileSync(uvxBin, path.join(bundleDir, 'uvx'))
      fs.chmodSync(path.join(bundleDir, 'uvx'), 0o755)
    }
  }

  // 清理临时目录
  fs.rmSync(tempDir, { recursive: true })

  // 验证安装
  const uvPath = platform === 'win'
    ? path.join(bundleDir, 'uv.exe')
    : path.join(bundleDir, 'uv')

  if (!fs.existsSync(uvPath)) {
    throw new Error('uv 安装失败')
  }

  log(`完成！输出目录: ${bundleDir}`)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主流程                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function main() {
  const platformArg = process.argv[2] || ''
  const { platform, arch, universal } = parseArg(platformArg || getPlatform())

  log(`目标平台: ${platform}, 架构: ${arch || 'default'}, universal: ${universal}`)

  if (platform === 'mac' && universal) {
    /* ═══════════════════════════════════════════════════════════════════════
     *  Mac Universal: 同时打包 arm64 和 x64 两个版本
     * ═══════════════════════════════════════════════════════════════════════ */
    log('========== Mac Universal 模式：打包双架构 ==========')

    const arm64Dir = path.join(ROOT_DIR, 'uv-bundle-arm64')
    const x64Dir = path.join(ROOT_DIR, 'uv-bundle-x64')

    // 并行打包两个架构
    await Promise.all([
      bundleSingleArch('mac', 'aarch64', arm64Dir),
      bundleSingleArch('mac', 'x86_64', x64Dir),
    ])

    log('========== Mac Universal 打包完成 ==========')
    log(`arm64: ${arm64Dir}`)
    log(`x64: ${x64Dir}`)
  } else {
    /* ═══════════════════════════════════════════════════════════════════════
     *  单架构模式
     * ═══════════════════════════════════════════════════════════════════════ */
    const finalArch = arch || (os.arch() === 'arm64' ? 'aarch64' : 'x86_64')
    const bundleDir = path.join(ROOT_DIR, 'uv-bundle')

    await bundleSingleArch(platform, finalArch, bundleDir)
  }
}

main().catch(err => {
  console.error('[bundle-uv] 错误:', err.message)
  process.exit(1)
})
