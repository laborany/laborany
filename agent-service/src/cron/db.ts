/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     SQLite 数据库加载器                                   ║
 * ║                                                                          ║
 * ║  处理 pkg 打包环境下的原生模块加载                                         ║
 * ║  设计：在 pkg 环境中从可执行文件同级目录加载 .node 文件                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { join, dirname } from 'path'
import { existsSync } from 'fs'
import type BetterSqlite3 from 'better-sqlite3'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     检测 pkg 打包环境                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const isPkg = typeof (process as any).pkg !== 'undefined'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     加载 better-sqlite3                                   │
 * │                                                                          │
 * │  pkg 环境：从可执行文件同级目录加载原生模块                                │
 * │  开发环境：正常导入                                                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
let DatabaseConstructor: typeof BetterSqlite3

if (isPkg) {
  const nativeModulePath = join(dirname(process.execPath), 'better_sqlite3.node')

  if (existsSync(nativeModulePath)) {
    // 在 pkg 环境中，需要在加载 better-sqlite3 之前设置原生模块路径
    // 通过修改 require.resolve 的行为来实现
    const binding = require(nativeModulePath)

    // 创建一个假的 bindings 模块
    const Module = require('module')
    const originalResolveFilename = Module._resolveFilename

    Module._resolveFilename = function(request: string, parent: any, isMain: boolean, options: any) {
      if (request === 'bindings') {
        // 返回一个假的路径，实际上我们会拦截 require
        return 'bindings'
      }
      return originalResolveFilename.call(this, request, parent, isMain, options)
    }

    // 缓存假的 bindings 模块
    require.cache['bindings'] = {
      id: 'bindings',
      filename: 'bindings',
      loaded: true,
      exports: () => binding
    } as any

    DatabaseConstructor = require('better-sqlite3')

    // 恢复原始行为
    Module._resolveFilename = originalResolveFilename
    delete require.cache['bindings']
  } else {
    console.warn('[DB] Native module not found at:', nativeModulePath)
    DatabaseConstructor = require('better-sqlite3')
  }
} else {
  // 开发环境，正常导入
  DatabaseConstructor = require('better-sqlite3')
}

export default DatabaseConstructor
