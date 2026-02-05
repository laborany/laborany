/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     SQLite 数据库加载器                                   ║
 * ║                                                                          ║
 * ║  处理 pkg 打包环境下的原生模块加载                                         ║
 * ║  设计：在 pkg 环境中通过 nativeBinding 选项加载 .node 文件                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { join, dirname } from 'path'
import { existsSync } from 'fs'
import Database from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     检测 pkg 打包环境                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const isPkg = typeof (process as any).pkg !== 'undefined'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     获取原生模块路径                                       │
 * │                                                                          │
 * │  优先级：环境变量 > 可执行文件同目录 > 默认加载                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const getNativeBindingPath = (): string | undefined => {
  // 优先使用环境变量指定的路径（Electron 启动时设置）
  const envPath = process.env.BETTER_SQLITE3_BINDING
  if (envPath && existsSync(envPath)) return envPath

  if (!isPkg) return undefined

  // pkg 环境：检查可执行文件同目录
  const nativePath = join(dirname(process.execPath), 'better_sqlite3.node')
  return existsSync(nativePath) ? nativePath : undefined
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     创建数据库实例                                         │
 * │                                                                          │
 * │  pkg 环境：通过 nativeBinding 选项指定原生模块路径                         │
 * │  开发环境：使用默认加载方式                                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const createDatabase = (filename: string, options?: { readonly?: boolean }): DatabaseType => {
  const nativeBinding = getNativeBindingPath()

  return new Database(filename, {
    ...options,
    ...(nativeBinding ? { nativeBinding } : {})
  })
}

export default Database
