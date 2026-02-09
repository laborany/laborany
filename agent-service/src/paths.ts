/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     路径工具 - pkg 打包环境支持                            ║
 * ║                                                                          ║
 * ║  职责：提供正确的资源路径，兼容开发环境和 pkg 打包环境                       ║
 * ║  设计：                                                                   ║
 * ║    - 只读资源：相对于可执行文件                                            ║
 * ║    - 可写数据（data, workflows）：用户目录，避免权限问题                   ║
 * ║                                                                          ║
 * ║  注意：Skills 相关路径已迁移到 laborany-shared 包                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'
import { existsSync, mkdirSync } from 'fs'

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
 * │                     获取用户数据根目录                                     │
 * │                                                                          │
 * │  生产环境：用户目录（避免 Program Files 权限问题）                         │
 * │  开发环境：也使用用户目录（保持一致性）                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getUserDir(): string {
  const home = homedir()
  const platform = process.platform

  if (platform === 'win32') {
    return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'LaborAny')
  }
  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'LaborAny')
  }
  return join(home, '.config', 'laborany')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     获取可写数据目录                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getDataDir(): string {
  if (!isPkg) return join(__dirname, '../../data')
  return join(getUserDir(), 'data')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     获取 Workflows 目录                                   │
 * │                                                                          │
 * │  Workflows 是用户创建的，需要存储在可写目录                                │
 * │  开发模式：项目根目录下的 workflows                                       │
 * │  打包后：用户目录下的 workflows                                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getWorkflowsDir(): string {
  if (!isPkg) return join(__dirname, '../../workflows')

  const userWorkflowsDir = join(getUserDir(), 'workflows')
  // 确保目录存在
  if (!existsSync(userWorkflowsDir)) {
    mkdirSync(userWorkflowsDir, { recursive: true })
  }
  return userWorkflowsDir
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     导出路径常量                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const RESOURCES_DIR = getResourcesDir()
export const WORKFLOWS_DIR = getWorkflowsDir()
export const DATA_DIR = getDataDir()

export { isPkg }
