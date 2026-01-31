/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       Office 文档转换服务                                 ║
 * ║                                                                          ║
 * ║  职责：使用 LibreOffice 将 Office 文档转换为 PDF/图片                      ║
 * ║  设计：检测 LibreOffice 可用性，提供转换和缓存功能                          ║
 * ║  优先级：下载版 > 系统安装版 > PATH                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { execSync, spawn } from 'child_process'
import { existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs'
import { join, dirname, basename, extname } from 'path'
import { platform, homedir, tmpdir } from 'os'
import { createHash } from 'crypto'
import { getDownloadedLibreOfficePath } from './libreoffice-downloader.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export interface ConversionResult {
  success: boolean
  outputPath?: string
  outputFiles?: string[]
  error?: string
  cached?: boolean
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       LibreOffice 路径检测                                │
 * │                                                                          │
 * │  检测优先级：                                                             │
 * │  1. LaborAny 下载的版本（用户数据目录）                                    │
 * │  2. 系统安装的版本（标准路径）                                             │
 * │  3. PATH 环境变量中的版本                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */

let libreOfficePath: string | null = null
let libreOfficeChecked = false

function findLibreOffice(): string | null {
  if (libreOfficeChecked) return libreOfficePath

  const os = platform()

  /* 优先检查下载的版本 */
  const downloadedPath = getDownloadedLibreOfficePath()
  if (downloadedPath && existsSync(downloadedPath)) {
    libreOfficePath = downloadedPath
    libreOfficeChecked = true
    console.log('[OfficeConverter] Using downloaded LibreOffice:', libreOfficePath)
    return libreOfficePath
  }

  /* 系统安装路径候选 */
  const candidates: string[] = []

  if (os === 'win32') {
    candidates.push(
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
      join(homedir(), 'AppData', 'Local', 'Programs', 'LibreOffice', 'program', 'soffice.exe'),
    )
  } else if (os === 'darwin') {
    candidates.push(
      '/Applications/LibreOffice.app/Contents/MacOS/soffice',
      '/opt/homebrew/bin/soffice',
      '/usr/local/bin/soffice',
    )
  } else {
    candidates.push(
      '/usr/bin/soffice',
      '/usr/bin/libreoffice',
      '/usr/local/bin/soffice',
      '/snap/bin/libreoffice',
    )
  }

  /* 检查候选路径 */
  for (const path of candidates) {
    if (existsSync(path)) {
      libreOfficePath = path
      libreOfficeChecked = true
      console.log('[OfficeConverter] Found system LibreOffice at:', libreOfficePath)
      return libreOfficePath
    }
  }

  /* 尝试 which/where 命令 */
  try {
    const whichCmd = os === 'win32' ? 'where soffice' : 'which soffice'
    const result = execSync(whichCmd, { encoding: 'utf-8', timeout: 5000 }).trim()
    if (result && existsSync(result.split('\n')[0])) {
      libreOfficePath = result.split('\n')[0]
      libreOfficeChecked = true
      console.log('[OfficeConverter] Found LibreOffice via PATH:', libreOfficePath)
      return libreOfficePath
    }
  } catch { /* not found */ }

  libreOfficeChecked = true
  console.log('[OfficeConverter] LibreOffice not found')
  return null
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           公开 API                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function isLibreOfficeAvailable(): boolean {
  return findLibreOffice() !== null
}

export function getLibreOfficePath(): string | null {
  return findLibreOffice()
}

/* 重置检测缓存（下载完成后调用） */
export function resetLibreOfficeCache(): void {
  libreOfficePath = null
  libreOfficeChecked = false
  console.log('[OfficeConverter] LibreOffice cache reset')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       缓存目录管理                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

function getCacheDir(): string {
  const cacheDir = join(tmpdir(), 'laborany-office-cache')
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true })
  }
  return cacheDir
}

function getFileHash(filePath: string): string {
  const stat = statSync(filePath)
  const hashInput = `${filePath}:${stat.size}:${stat.mtimeMs}`
  return createHash('md5').update(hashInput).digest('hex').substring(0, 12)
}

function getCachedOutput(inputPath: string, format: string): string[] | null {
  const hash = getFileHash(inputPath)
  const cacheDir = getCacheDir()
  const prefix = `${hash}_`

  const files = readdirSync(cacheDir)
    .filter(f => f.startsWith(prefix) && f.endsWith(`.${format}`))
    .map(f => join(cacheDir, f))
    .sort()

  return files.length > 0 ? files : null
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       转换为 PDF                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export async function convertToPdf(inputPath: string): Promise<ConversionResult> {
  const soffice = findLibreOffice()
  if (!soffice) {
    return { success: false, error: 'LibreOffice 未安装' }
  }

  if (!existsSync(inputPath)) {
    return { success: false, error: '输入文件不存在' }
  }

  /* 检查缓存 */
  const cached = getCachedOutput(inputPath, 'pdf')
  if (cached && cached.length > 0) {
    console.log('[OfficeConverter] Using cached PDF:', cached[0])
    return { success: true, outputPath: cached[0], cached: true }
  }

  const hash = getFileHash(inputPath)
  const cacheDir = getCacheDir()
  const baseName = basename(inputPath, extname(inputPath))

  return new Promise((resolve) => {
    const args = [
      '--headless',
      '--convert-to', 'pdf',
      '--outdir', cacheDir,
      inputPath,
    ]

    console.log('[OfficeConverter] Converting to PDF:', inputPath)
    const proc = spawn(soffice, args, { timeout: 60000 })

    proc.on('close', (code) => {
      if (code === 0) {
        /* 重命名输出文件以包含 hash */
        const originalOutput = join(cacheDir, `${baseName}.pdf`)
        const hashedOutput = join(cacheDir, `${hash}_${baseName}.pdf`)

        if (existsSync(originalOutput)) {
          try {
            const { renameSync } = require('fs')
            renameSync(originalOutput, hashedOutput)
            console.log('[OfficeConverter] PDF created:', hashedOutput)
            resolve({ success: true, outputPath: hashedOutput })
          } catch {
            resolve({ success: true, outputPath: originalOutput })
          }
        } else {
          resolve({ success: false, error: '转换完成但未找到输出文件' })
        }
      } else {
        resolve({ success: false, error: `LibreOffice 退出码: ${code}` })
      }
    })

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message })
    })
  })
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       转换为图片（PNG）                                    │
 * │                                                                          │
 * │  PPTX → PDF → PNG（需要额外工具如 pdftoppm 或 ImageMagick）               │
 * │  简化方案：直接转换为 PDF，前端使用 PDF.js 渲染                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export async function convertPptxToImages(inputPath: string): Promise<ConversionResult> {
  /* 先转换为 PDF */
  const pdfResult = await convertToPdf(inputPath)
  if (!pdfResult.success) {
    return pdfResult
  }

  /* 返回 PDF 路径，前端使用 PDF.js 渲染 */
  return {
    success: true,
    outputPath: pdfResult.outputPath,
    cached: pdfResult.cached,
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       清理缓存                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function clearCache(): void {
  const cacheDir = getCacheDir()
  if (existsSync(cacheDir)) {
    const files = readdirSync(cacheDir)
    for (const file of files) {
      try {
        unlinkSync(join(cacheDir, file))
      } catch { /* ignore */ }
    }
    console.log('[OfficeConverter] Cache cleared')
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                       诊断信息                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function getDiagnosticInfo(): Record<string, unknown> {
  return {
    libreOfficeAvailable: isLibreOfficeAvailable(),
    libreOfficePath: getLibreOfficePath(),
    cacheDir: getCacheDir(),
    platform: platform(),
  }
}
