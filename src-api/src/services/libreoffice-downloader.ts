/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    LibreOffice 自动下载服务                               ║
 * ║                                                                          ║
 * ║  职责：检测平台，下载并安装对应版本的 LibreOffice                           ║
 * ║  支持：Windows / macOS ARM64 / macOS x64 / Linux                         ║
 * ╚═════════════════════════════════════════════════════════════════════���════╝ */

import { createWriteStream, existsSync, mkdirSync, chmodSync, unlinkSync } from 'fs'
import { join } from 'path'
import { platform, arch, homedir, tmpdir } from 'os'
import { execSync, spawn } from 'child_process'
import { createHash } from 'crypto'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export interface DownloadProgress {
  status: 'idle' | 'downloading' | 'extracting' | 'complete' | 'error'
  progress: number        // 0-100
  downloadedMB: number
  totalMB: number
  message: string
  error?: string
}

interface PlatformConfig {
  url: string
  filename: string
  extractCmd?: string
  binaryPath: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       LibreOffice 版本配置                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  版本配置说明                                                             │
 * │  - Portable 版本在 /libreoffice/portable/ 目录下                          │
 * │  - 标准版本在 /libreoffice/stable/ 目录下                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const PORTABLE_VERSION = '25.2.3'
const LIBREOFFICE_VERSION = '25.8.4'
const BASE_URL = 'https://download.documentfoundation.org/libreoffice'

/* Windows 下载源配置 */
const WINDOWS_SOURCES = [
  /* 官方 Portable 版本（在 portable 目录下） */
  {
    url: `${BASE_URL}/portable/${PORTABLE_VERSION}/LibreOfficePortable_${PORTABLE_VERSION}_MultilingualStandard.paf.exe`,
    filename: `LibreOfficePortable_${PORTABLE_VERSION}.paf.exe`,
  },
]

function getPlatformConfig(): PlatformConfig | null {
  const os = platform()
  const cpuArch = arch()

  /* Windows - 使用官方 Portable 版本 */
  if (os === 'win32') {
    return {
      url: WINDOWS_SOURCES[0].url,
      filename: WINDOWS_SOURCES[0].filename,
      binaryPath: 'LibreOfficePortable/App/libreoffice/program/soffice.exe',
    }
  }

  /* macOS */
  if (os === 'darwin') {
    const archSuffix = cpuArch === 'arm64' ? 'aarch64' : 'x86_64'
    return {
      url: `${BASE_URL}/stable/${LIBREOFFICE_VERSION}/mac/${archSuffix}/LibreOffice_${LIBREOFFICE_VERSION}_MacOS_${archSuffix}.dmg`,
      filename: `LibreOffice_${LIBREOFFICE_VERSION}_${archSuffix}.dmg`,
      binaryPath: 'LibreOffice.app/Contents/MacOS/soffice',
    }
  }

  /* Linux */
  if (os === 'linux') {
    return {
      url: `${BASE_URL}/stable/${LIBREOFFICE_VERSION}/deb/x86_64/LibreOffice_${LIBREOFFICE_VERSION}_Linux_x86-64_deb.tar.gz`,
      filename: `LibreOffice_${LIBREOFFICE_VERSION}_Linux.tar.gz`,
      binaryPath: 'usr/lib/libreoffice/program/soffice',
    }
  }

  return null
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       安装目录管理                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function getInstallDir(): string {
  const os = platform()
  let baseDir: string

  if (os === 'win32') {
    baseDir = join(homedir(), 'AppData', 'Local', 'LaborAny')
  } else if (os === 'darwin') {
    baseDir = join(homedir(), 'Library', 'Application Support', 'LaborAny')
  } else {
    baseDir = join(homedir(), '.local', 'share', 'laborany')
  }

  const installDir = join(baseDir, 'libreoffice')
  if (!existsSync(installDir)) {
    mkdirSync(installDir, { recursive: true })
  }
  return installDir
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       下载状态管理                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

let currentProgress: DownloadProgress = {
  status: 'idle',
  progress: 0,
  downloadedMB: 0,
  totalMB: 0,
  message: '',
}

export function getDownloadProgress(): DownloadProgress {
  return { ...currentProgress }
}

function updateProgress(update: Partial<DownloadProgress>): void {
  currentProgress = { ...currentProgress, ...update }
  console.log(`[LibreOffice] ${currentProgress.message} (${currentProgress.progress}%)`)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       检查已安装的 LibreOffice                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function getDownloadedLibreOfficePath(): string | null {
  const config = getPlatformConfig()
  if (!config) return null

  const installDir = getInstallDir()
  const binaryPath = join(installDir, config.binaryPath)

  if (existsSync(binaryPath)) {
    return binaryPath
  }
  return null
}

export function isLibreOfficeDownloaded(): boolean {
  return getDownloadedLibreOfficePath() !== null
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       下载文件                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */

async function downloadFile(url: string, destPath: string): Promise<void> {
  updateProgress({ status: 'downloading', message: '正在下载 LibreOffice...' })

  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`下载失败: HTTP ${response.status}`)
  }

  const totalBytes = parseInt(response.headers.get('content-length') || '0', 10)
  const totalMB = Math.round(totalBytes / 1024 / 1024)
  updateProgress({ totalMB })

  const fileStream = createWriteStream(destPath)
  const reader = response.body?.getReader()
  if (!reader) throw new Error('无法读取响应体')

  let downloadedBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    downloadedBytes += value.length
    fileStream.write(Buffer.from(value))

    const downloadedMB = Math.round(downloadedBytes / 1024 / 1024)
    const progress = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0
    updateProgress({
      downloadedMB,
      progress: Math.min(progress, 95), // 保留 5% 给解压
      message: `正在下载 LibreOffice... ${downloadedMB}MB / ${totalMB}MB`,
    })
  }

  fileStream.end()
  await new Promise<void>((resolve, reject) => {
    fileStream.on('finish', resolve)
    fileStream.on('error', reject)
  })
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       平台特定的安装逻辑                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */

async function installWindows(downloadPath: string, installDir: string): Promise<void> {
  updateProgress({ status: 'extracting', progress: 96, message: '正在解压 LibreOffice Portable...' })

  /* 运行 PortableApps 安装器（静默模式） */
  return new Promise((resolve, reject) => {
    const proc = spawn(downloadPath, ['/DESTINATION=' + installDir, '/SILENT'], {
      windowsHide: true,
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`安装失败，退出码: ${code}`))
      }
    })

    proc.on('error', reject)
  })
}

async function installMacOS(downloadPath: string, installDir: string): Promise<void> {
  updateProgress({ status: 'extracting', progress: 96, message: '正在挂载并复制 LibreOffice...' })

  const mountPoint = join(tmpdir(), 'libreoffice-mount')

  try {
    /* 挂载 DMG */
    execSync(`hdiutil attach "${downloadPath}" -mountpoint "${mountPoint}" -nobrowse -quiet`, {
      timeout: 60000,
    })

    /* 复制 LibreOffice.app */
    const appPath = join(mountPoint, 'LibreOffice.app')
    const destPath = join(installDir, 'LibreOffice.app')

    if (existsSync(destPath)) {
      execSync(`rm -rf "${destPath}"`)
    }
    execSync(`cp -R "${appPath}" "${destPath}"`)

  } finally {
    /* 卸载 DMG */
    try {
      execSync(`hdiutil detach "${mountPoint}" -quiet`, { timeout: 30000 })
    } catch { /* ignore */ }
  }
}

async function installLinux(downloadPath: string, installDir: string): Promise<void> {
  updateProgress({ status: 'extracting', progress: 96, message: '正在解压 LibreOffice...' })

  /* 解压 tar.gz */
  execSync(`tar -xzf "${downloadPath}" -C "${installDir}"`, { timeout: 120000 })

  /* 查找并移动 deb 包内容 */
  const extractedDir = join(installDir, `LibreOffice_${LIBREOFFICE_VERSION}_Linux_x86-64_deb`)
  const debsDir = join(extractedDir, 'DEBS')

  if (existsSync(debsDir)) {
    /* 解压所有 deb 包 */
    const debs = execSync(`ls "${debsDir}"/*.deb`, { encoding: 'utf-8' }).trim().split('\n')
    for (const deb of debs) {
      if (deb) {
        execSync(`dpkg-deb -x "${deb}" "${installDir}"`, { timeout: 60000 })
      }
    }
  }

  /* 设置可执行权限 */
  const sofficePath = join(installDir, 'usr/lib/libreoffice/program/soffice')
  if (existsSync(sofficePath)) {
    chmodSync(sofficePath, 0o755)
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       主下载函数                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export async function downloadLibreOffice(): Promise<DownloadProgress> {
  /* 检查是否已在下载中 */
  if (currentProgress.status === 'downloading' || currentProgress.status === 'extracting') {
    return currentProgress
  }

  /* 检查是否已安装 */
  if (isLibreOfficeDownloaded()) {
    updateProgress({
      status: 'complete',
      progress: 100,
      message: 'LibreOffice 已安装',
    })
    return currentProgress
  }

  const config = getPlatformConfig()
  if (!config) {
    updateProgress({
      status: 'error',
      message: '不支持的操作系统',
      error: '不支持的操作系统',
    })
    return currentProgress
  }

  const installDir = getInstallDir()
  const downloadPath = join(tmpdir(), config.filename)

  try {
    /* 下载 */
    await downloadFile(config.url, downloadPath)

    /* 安装 */
    const os = platform()
    if (os === 'win32') {
      await installWindows(downloadPath, installDir)
    } else if (os === 'darwin') {
      await installMacOS(downloadPath, installDir)
    } else {
      await installLinux(downloadPath, installDir)
    }

    /* 清理下载文件 */
    try {
      unlinkSync(downloadPath)
    } catch { /* ignore */ }

    /* 验证安装 */
    if (isLibreOfficeDownloaded()) {
      updateProgress({
        status: 'complete',
        progress: 100,
        message: 'LibreOffice 安装完成',
      })
    } else {
      throw new Error('安装完成但未找到可执行文件')
    }

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    updateProgress({
      status: 'error',
      message: `安装失败: ${errorMsg}`,
      error: errorMsg,
    })
  }

  return currentProgress
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       诊断信息                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function getDownloaderDiagnostic(): Record<string, unknown> {
  const config = getPlatformConfig()
  return {
    platform: platform(),
    arch: arch(),
    installDir: getInstallDir(),
    downloadedPath: getDownloadedLibreOfficePath(),
    isDownloaded: isLibreOfficeDownloaded(),
    downloadUrl: config?.url,
    version: LIBREOFFICE_VERSION,
  }
}
