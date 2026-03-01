/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     路径工具 - 统一路径计算                               ║
 * ║                                                                          ║
 * ║  职责：提供正确的资源路径，兼容开发环境和 pkg 打包环境                       ║
 * ║  设计：                                                                   ║
 * ║    - 内置 Skills（只读）：相对于可执行文件                                 ║
 * ║    - 用户 Skills（可写）：系统用户目录，自动创建                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { homedir, platform } from 'os'
import { existsSync, mkdirSync, readdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

function scoreAppHome(baseDir: string): number {
  let score = 0
  if (existsSync(join(baseDir, 'data', 'laborany.db'))) score += 20
  if (existsSync(join(baseDir, 'laborany.db'))) score += 15
  if (existsSync(join(baseDir, 'skills'))) score += 10
  if (existsSync(join(baseDir, '.env'))) score += 8
  if (existsSync(join(baseDir, 'data'))) score += 5
  if (existsSync(join(baseDir, 'logs'))) score += 3
  return score
}

function pickPreferredAppHome(lowerDir: string, legacyDir: string): string {
  const lowerExists = existsSync(lowerDir)
  const legacyExists = existsSync(legacyDir)

  if (!lowerExists && !legacyExists) return lowerDir
  if (lowerExists && !legacyExists) return lowerDir
  if (!lowerExists && legacyExists) return legacyDir

  const lowerScore = scoreAppHome(lowerDir)
  const legacyScore = scoreAppHome(legacyDir)
  if (legacyScore > lowerScore) return legacyDir
  return lowerDir
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     检测打包环境                                          │
 * │                                                                          │
 * │  两种检测方式：                                                           │
 * │  1. pkg 注入的 process.pkg 属性                                          │
 * │  2. execPath 不包含 node（打包后的可执行文件）                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function isPackaged(): boolean {
  return typeof (process as any).pkg !== 'undefined'
    || !process.execPath.includes('node')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     获取用户数据根目录                                     │
 * │                                                                          │
 * │  跨平台支持：                                                             │
 * │  - Windows: %APPDATA%/LaborAny                                           │
 * │  - macOS: ~/Library/Application Support/LaborAny                         │
 * │  - Linux: ~/.config/laborany                                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getUserDir(): string {
  const fromEnv = (process.env.LABORANY_HOME || '').trim()
  if (fromEnv) return fromEnv

  const home = homedir()
  const os = platform()

  if (os === 'win32') {
    const appDataRoot = process.env.APPDATA || join(home, 'AppData', 'Roaming')
    const lower = join(appDataRoot, 'laborany')
    const legacy = join(appDataRoot, 'LaborAny')
    return pickPreferredAppHome(lower, legacy)
  }
  if (os === 'darwin') {
    const lower = join(home, 'Library', 'Application Support', 'laborany')
    const legacy = join(home, 'Library', 'Application Support', 'LaborAny')
    return pickPreferredAppHome(lower, legacy)
  }
  const lower = join(home, '.config', 'laborany')
  const legacy = join(home, '.config', 'LaborAny')
  return pickPreferredAppHome(lower, legacy)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     获取内置 Skills 目录（只读）                           │
 * │                                                                          │
 * │  打包后：exe 在 resources/api/ 或 resources/agent/                        │
 * │         skills 在 resources/skills/                                      │
 * │  开发模式：相对于 shared 包                                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function hasSkillManifests(skillsDir: string): boolean {
  if (!existsSync(skillsDir)) return false
  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true })
    return entries.some((entry) => (
      entry.isDirectory() && existsSync(join(skillsDir, entry.name, 'SKILL.md'))
    ))
  } catch {
    return false
  }
}

function getBuiltinSkillsDir(): string {
  const envOverride = (process.env.LABORANY_BUILTIN_SKILLS_DIR || '').trim()
  const execDir = dirname(process.execPath)
  const candidates = [
    envOverride,
    join(execDir, '..', 'skills'),
    join(execDir, '..', '..', 'skills'),
    join(execDir, '..', '..', '..', 'skills'),
    join(process.cwd(), 'skills'),
    join(__dirname, '../..', 'skills'),
    join(__dirname, '../../..', 'skills'),
  ]

  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (!candidate) continue
    const resolved = resolve(candidate)
    if (seen.has(resolved)) continue
    seen.add(resolved)
    if (hasSkillManifests(resolved)) return resolved
  }

  // 兜底：保持原行为，避免返回空路径
  return join(__dirname, '../..', 'skills')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     获取用户 Skills 目录（可写）                           │
 * │                                                                          │
 * │  始终使用系统用户目录，无论开发还是生产环境                                 │
 * │  首次访问时自动创建目录                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getUserSkillsDir(): string {
  const userSkillsDir = join(getUserDir(), 'skills')

  // 确保目录存在（首次访问时创建）
  if (!existsSync(userSkillsDir)) {
    mkdirSync(userSkillsDir, { recursive: true })
  }

  return userSkillsDir
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     导出路径常量                                          │
 * │                                                                          │
 * │  模块加载时立即计算，确保目录存在                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const BUILTIN_SKILLS_DIR = getBuiltinSkillsDir()
export const USER_SKILLS_DIR = getUserSkillsDir()

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     导出目录获取函数                                       │
 * │                                                                          │
 * │  供外部模块动态获取路径（如需要延迟计算）                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export { getBuiltinSkillsDir, getUserSkillsDir, getUserDir }
