#!/usr/bin/env node
/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    Native Modules Fix Script                             ║
 * ║                                                                          ║
 * ║  功能：下载与 pkg 打包 Node.js 版本匹配的原生模块预编译二进制              ║
 * ║  用法：node scripts/fix-native-modules.js [platform]                     ║
 * ║  平台：win, mac, linux                                                   ║
 * ║                                                                          ║
 * ║  背景：pkg 使用 Node.js 20.x 打包，但开发环境可能使用更高版本             ║
 * ║       导致原生模块 ABI 不匹配，需要下载正确版本的预编译二进制              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

const https = require('https')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const os = require('os')

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           配置                                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const PKG_NODE_VERSION = '20'  // pkg 使用的 Node.js 主版本
const NODE_ABI = 115          // Node.js 20.x 的 ABI 版本
const ROOT_DIR = path.join(__dirname, '..')
const CACHE_DIR = path.join(os.homedir(), '.laborany', 'cache')

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           原生模块配置                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const NATIVE_MODULES = {
  'better-sqlite3': {
    version: '12.6.2',
    getUrl: (platform, arch) => {
      const platformMap = { win: 'win32', mac: 'darwin', linux: 'linux' }
      const archMap = { x64: 'x64', arm64: 'arm64' }
      const p = platformMap[platform] || platform
      const a = archMap[arch] || arch
      return `https://github.com/WiseLibs/better-sqlite3/releases/download/v12.6.2/better-sqlite3-v12.6.2-node-v${NODE_ABI}-${p}-${a}.tar.gz`
    },
    targetPath: 'agent-service/node_modules/better-sqlite3/build/Release',
    fileName: 'better_sqlite3.node'
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           工具函数                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function log(msg) {
  console.log(`[fix-native] ${msg}`)
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
  const arg = process.argv[3]
  if (arg) return arg
  return os.arch()
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    log(`下载: ${url}`)
    const file = fs.createWriteStream(dest)

    const request = (url) => {
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          request(response.headers.location)
          return
        }
        if (response.statusCode !== 200) {
          reject(new Error(`下载失败: ${response.statusCode}`))
          return
        }
        response.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve()
        })
      }).on('error', reject)
    }

    request(url)
  })
}

function extractTarGz(tarPath, destDir) {
  ensureDir(destDir)
  // 在 Windows 上使用相对路径避免 tar 路径解析问题
  const cwd = path.dirname(tarPath)
  const tarName = path.basename(tarPath)
  const relDest = path.relative(cwd, destDir) || '.'
  execSync(`tar -xzf "${tarName}" -C "${relDest}"`, { cwd, stdio: 'inherit' })
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           主函数                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function fixNativeModules() {
  const platform = getPlatform()
  const arch = getArch()

  log(`目标平台: ${platform}, 架构: ${arch}`)
  log(`pkg Node.js 版本: ${PKG_NODE_VERSION}.x (ABI ${NODE_ABI})`)

  ensureDir(CACHE_DIR)

  for (const [name, config] of Object.entries(NATIVE_MODULES)) {
    log(`处理模块: ${name}@${config.version}`)

    const url = config.getUrl(platform, arch)
    const cacheFile = path.join(CACHE_DIR, `${name}-v${config.version}-node${NODE_ABI}-${platform}-${arch}.tar.gz`)
    const targetDir = path.join(ROOT_DIR, config.targetPath)
    const targetFile = path.join(targetDir, config.fileName)

    // 检查缓存
    if (!fs.existsSync(cacheFile)) {
      await download(url, cacheFile)
      log(`已缓存到: ${cacheFile}`)
    } else {
      log(`使用缓存: ${cacheFile}`)
    }

    // 解压到临时目录
    const tempDir = path.join(CACHE_DIR, `temp-${name}`)
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true })
    }
    extractTarGz(cacheFile, tempDir)

    // 复制到目标位置
    ensureDir(targetDir)
    const extractedFile = path.join(tempDir, 'build', 'Release', config.fileName)
    if (fs.existsSync(extractedFile)) {
      fs.copyFileSync(extractedFile, targetFile)
      log(`已安装: ${targetFile}`)
    } else {
      throw new Error(`解压后未找到文件: ${extractedFile}`)
    }

    // 清理临时目录
    fs.rmSync(tempDir, { recursive: true })
  }

  log('原生模块修复完成！')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           入口                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
fixNativeModules().catch((err) => {
  console.error(`[fix-native] 错误: ${err.message}`)
  process.exit(1)
})
