/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     路径工具 - pkg 打包环境支持                            ║
 * ║                                                                          ║
 * ║  职责：提供正确的资源路径，兼容开发环境和 pkg 打包环境                       ║
 * ║  设计：检测 pkg 环境，返回相对于可执行文件的路径                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     检测 pkg 打包环境                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const isPkg = typeof (process as any).pkg !== 'undefined'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     获取资源根目录                                        │
 * │                                                                          │
 * │  pkg 环境：可执行文件在 resources/agent/，资源在 resources/               │
 * │  开发环境：项目根目录                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function getResourcesDir(): string {
  if (isPkg) {
    // pkg 打包后，可执行文件在 resources/agent/laborany-agent.exe
    // 资源目录在 resources/（上一级）
    return dirname(dirname(process.execPath))
  }
  // 开发环境，相对于 src 目录的上两级
  return join(__dirname, '../..')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     导出路径常量                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const RESOURCES_DIR = getResourcesDir()
export const SKILLS_DIR = join(RESOURCES_DIR, 'skills')
export const WORKFLOWS_DIR = join(RESOURCES_DIR, 'workflows')
export const DATA_DIR = join(RESOURCES_DIR, 'data')

export { isPkg }
