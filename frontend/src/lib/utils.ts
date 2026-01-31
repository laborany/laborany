/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         工具函数                                          ║
 * ║                                                                          ║
 * ║  cn: 合并 Tailwind CSS 类名，处理冲突                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
