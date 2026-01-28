/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         沙盒提供者统一导出                                 ║
 * ║                                                                          ║
 * ║  职责：导出所有提供者并自动注册到注册表                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { registerProvider } from '../core/sandbox/registry.js'
import { createNativeProvider, NativeProvider } from './native.js'
import { createUvPythonProvider, UvPythonProvider } from './uv-python.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           自动注册提供者                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function registerAllProviders(): void {
  registerProvider('native', createNativeProvider)
  registerProvider('uv-python', createUvPythonProvider)
  console.log('[Providers] 所有提供者已注册')
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export { NativeProvider, createNativeProvider } from './native.js'
export { UvPythonProvider, createUvPythonProvider } from './uv-python.js'
