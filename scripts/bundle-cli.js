#!/usr/bin/env node
/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    CLI Bundle Script                                      ║
 * ║                                                                          ║
 * ║  功能：下载 Node.js 并安装 Claude Code CLI 到 bundle 目录                  ║
 * ║  用法：node scripts/bundle-cli.js [platform]                              ║
 * ║  平台：win, mac, linux                                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

const https = require('https')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const os = require('os')

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           配置                                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const NODE_VERSION = '20.18.0'
const BUNDLE_DIR = path.join(__dirname, '..', 'cli-bundle')
const CACHE_DIR = path.join(os.homedir(), '.laborany', 'cache')

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           工具函数                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function log(msg) {
  console.log(`[bundle-cli] ${msg}`)
}

function getPlatform() {
  const arg = process.argv[2]
  if (arg) return arg

  const platform = os.platform()
  if (platform === 'win32') return 'win'
  if (platform === 'darwin') return 'mac'
  return 'linux'
}

function getArch() {
  // 支持通过参数指定架构：mac-x64, mac-arm64
  const arg = process.argv[2]
  if (arg && arg.includes('-')) {
    const parts = arg.split('-')
    return parts[1] || 'x64'
  }
  // 默认使用当前系统架构
  return os.arch() === 'arm64' ? 'arm64' : 'x64'
}

function getNodeUrl(platform, arch) {
  const base = `https://nodejs.org/dist/v${NODE_VERSION}`

  if (platform === 'win') {
    return `${base}/node-v${NODE_VERSION}-win-x64.zip`
  } else if (platform === 'mac') {
    return `${base}/node-v${NODE_VERSION}-darwin-${arch}.tar.gz`
  } else {
    return `${base}/node-v${NODE_VERSION}-linux-x64.tar.gz`
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    log(`下载: ${url}`)
    const file = fs.createWriteStream(dest)

    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        https.get(response.headers.location, (res) => {
          res.pipe(file)
          file.on('finish', () => {
            file.close()
            resolve()
          })
        }).on('error', reject)
      } else {
        response.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve()
        })
      }
    }).on('error', reject)
  })
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主流程                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function main() {
  const platformArg = process.argv[2] || ''
  const platform = platformArg.includes('-') ? platformArg.split('-')[0] : getPlatform()
  const arch = getArch()
  log(`目标平台: ${platform}, 架构: ${arch}`)

  // 清理并创建目录
  if (fs.existsSync(BUNDLE_DIR)) {
    fs.rmSync(BUNDLE_DIR, { recursive: true })
  }
  fs.mkdirSync(BUNDLE_DIR, { recursive: true })
  fs.mkdirSync(CACHE_DIR, { recursive: true })

  // 下载 Node.js
  const nodeUrl = getNodeUrl(platform, arch)
  const ext = platform === 'win' ? 'zip' : 'tar.gz'
  const cacheFile = path.join(CACHE_DIR, `node-${NODE_VERSION}-${platform}-${arch}.${ext}`)

  if (!fs.existsSync(cacheFile)) {
    await download(nodeUrl, cacheFile)
    log(`已缓存到: ${cacheFile}`)
  } else {
    log(`使用缓存: ${cacheFile}`)
  }

  // 解压 Node.js
  log('解压 Node.js...')
  const tempDir = path.join(os.tmpdir(), `node-extract-${Date.now()}`)
  fs.mkdirSync(tempDir, { recursive: true })

  if (platform === 'win') {
    // Windows: 使用 PowerShell 解压 zip
    execSync(`powershell -Command "Expand-Archive -Path '${cacheFile}' -DestinationPath '${tempDir}' -Force"`)
    const nodeDir = fs.readdirSync(tempDir).find(d => d.startsWith('node-'))
    fs.copyFileSync(
      path.join(tempDir, nodeDir, 'node.exe'),
      path.join(BUNDLE_DIR, 'node.exe')
    )
  } else {
    // Unix: 使用 tar 解压
    execSync(`tar -xzf "${cacheFile}" -C "${tempDir}"`)
    const nodeDir = fs.readdirSync(tempDir).find(d => d.startsWith('node-'))
    fs.copyFileSync(
      path.join(tempDir, nodeDir, 'bin', 'node'),
      path.join(BUNDLE_DIR, 'node')
    )
    fs.chmodSync(path.join(BUNDLE_DIR, 'node'), 0o755)
  }

  // 清理临时目录
  fs.rmSync(tempDir, { recursive: true })
  log('Node.js 已准备好')

  // 创建 package.json
  fs.writeFileSync(
    path.join(BUNDLE_DIR, 'package.json'),
    JSON.stringify({ name: 'cli-bundle', private: true, type: 'module' }, null, 2)
  )

  // 安装 Claude Code CLI
  log('安装 @anthropic-ai/claude-code...')
  const npmRegistry = process.env.NPM_REGISTRY || 'https://registry.npmmirror.com'
  execSync(`npm install @anthropic-ai/claude-code --registry="${npmRegistry}"`, {
    cwd: BUNDLE_DIR,
    stdio: 'inherit'
  })

  // 验证安装
  const cliPath = path.join(BUNDLE_DIR, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js')
  if (!fs.existsSync(cliPath)) {
    throw new Error('Claude Code CLI 安装失败')
  }

  // 清理不需要的平台文件（减小体积）
  log('清理不需要的平台文件...')
  const vendorDir = path.join(BUNDLE_DIR, 'node_modules', '@anthropic-ai', 'claude-code', 'vendor')
  if (fs.existsSync(vendorDir)) {
    const keepPlatform = platform === 'win' ? 'x64-win32'
                       : platform === 'mac' ? (arch === 'arm64' ? 'arm64-darwin' : 'x64-darwin')
                       : 'x64-linux'

    const rgDir = path.join(vendorDir, 'ripgrep')
    if (fs.existsSync(rgDir)) {
      for (const dir of fs.readdirSync(rgDir)) {
        const fullPath = path.join(rgDir, dir)
        if (fs.statSync(fullPath).isDirectory() && dir !== keepPlatform) {
          fs.rmSync(fullPath, { recursive: true })
          log(`  删除: vendor/ripgrep/${dir}`)
        }
      }
    }
  }

  /* ┌──────────────────────────────────────────────────────────────────────────┐
   * │  重命名 node_modules 为 deps                                             │
   * │  原因：electron-builder 会排除 node_modules 目录                          │
   * └──────────────────────────────────────────────────────────────────────────┘ */
  log('重命名 node_modules -> deps...')
  const nodeModulesDir = path.join(BUNDLE_DIR, 'node_modules')
  const depsDir = path.join(BUNDLE_DIR, 'deps')
  fs.renameSync(nodeModulesDir, depsDir)

  log(`完成！输出目录: ${BUNDLE_DIR}`)
}

main().catch(err => {
  console.error('[bundle-cli] 错误:', err.message)
  process.exit(1)
})
