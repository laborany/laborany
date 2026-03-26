/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║           Web Research — Module Entry                                  ║
 * ║                                                                        ║
 * ║  导出 runtime 单例 + 路由挂载函数                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { WebResearchRuntime } from './runtime.js'
import { createWebResearchRouter } from './routes/internal-api.js'
import type { Router } from 'express'

let runtime: WebResearchRuntime | null = null
let router: Router | null = null

export async function initWebResearchRuntime(): Promise<void> {
  if (runtime) return
  runtime = new WebResearchRuntime()
  await runtime.init()
  console.log('[WebResearch] Runtime initialized')
}

export function getWebResearchRuntime(): WebResearchRuntime {
  if (!runtime) throw new Error('WebResearchRuntime not initialized')
  return runtime
}

export function getWebResearchRouter(): Router {
  if (!router) {
    if (!runtime) throw new Error('WebResearchRuntime not initialized')
    router = createWebResearchRouter(runtime)
  }
  return router
}

export async function shutdownWebResearchRuntime(): Promise<void> {
  if (!runtime) return
  await runtime.shutdown()
  runtime = null
  router = null
}

export { WebResearchRuntime } from './runtime.js'
export { writeWebResearchMcpConfig } from './mcp/write-mcp-config.js'
