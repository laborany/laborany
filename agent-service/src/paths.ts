/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     路径工具 - pkg 打包环境支持                            ║
 * ║                                                                          ║
 * ║  职责：提供正确的资源路径，兼容开发环境和 pkg 打包环境                       ║
 * ║  设计：                                                                   ║
 * ║    - 只读资源（skills/workflows）：相对于可执行文件                        ║
 * ║    - 可写数据（data）：用户目录，避免 Program Files 权限问题               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     检测 pkg 打包环境                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const isPkg = typeof (process as any).pkg !== 'undefined'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     获取只读资源目录                                       │
 * │                                                                          │
 * │  pkg 环境：可执行文件在 resources/agent/，资源在 resources/               │
 * │  开发环境：项目根目录                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getResourcesDir(): string {
  if (isPkg) {
    return dirname(dirname(process.execPath))
  }
  return join(__dirname, '../..')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     获取可写数据目录                                       │
 * │                                                                          │
 * │  生产环境：用户目录（避免 Program Files 权限问题）                         │
 * │  开发环境：项目目录下的 data                                              │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getDataDir(): string {
  if (!isPkg) return join(__dirname, '../../data')

  const home = homedir()
  const platform = process.platform

  // 各平台标准用户数据目录
  if (platform === 'win32') {
    return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'LaborAny', 'data')
  }
  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'LaborAny', 'data')
  }
  return join(home, '.config', 'laborany', 'data')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     导出路径常量                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const RESOURCES_DIR = getResourcesDir()
export const SKILLS_DIR = join(RESOURCES_DIR, 'skills')
export const WORKFLOWS_DIR = join(RESOURCES_DIR, 'workflows')
export const DATA_DIR = getDataDir()

export { isPkg }
