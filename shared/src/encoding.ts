/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       跨平台编码工具                                     ║
 * ║                                                                          ║
 * ║  解决 Windows 中文环境下系统命令输出 GBK 导致的乱码问题                   ║
 * ║  策略：在源头强制 UTF-8，而非在终端做 GBK 解码                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { platform } from 'os'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Windows 系统命令 UTF-8 包装                                             │
 * │                                                                          │
 * │  中文 Windows 默认代码页为 GBK (CP936)                                   │
 * │  where / netstat 等命令的输出会使用系统代码页                             │
 * │  chcp 65001 将当前 cmd.exe 会话切换到 UTF-8 代码页                       │
 * │  execSync 每次创建独立的 cmd.exe 进程，不会污染全局                       │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function wrapCmdForUtf8(cmd: string): string {
  if (platform() === 'win32') {
    return `chcp 65001 >nul && ${cmd}`
  }
  return cmd
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  子进程 UTF-8 环境变量注入                                               │
 * │                                                                          │
 * │  PYTHONIOENCODING: 强制 Python stdin/stdout/stderr 使用 UTF-8           │
 * │  PYTHONUTF8: Python 3.7+ UTF-8 模式开关                                 │
 * │  这些变量对非 Python 进程无副作用，会被静默忽略                           │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function withUtf8Env(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return {
    ...env,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
  }
}
