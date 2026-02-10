/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      引导横幅 - GuideBanner                            ║
 * ║                                                                          ║
 * ║  首次访问展开，关闭后 localStorage 记住状态                              ║
 * ║  三个核心概念 + 快速开始入口                                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LaborAnyLogo } from '../ui/LaborAnyLogo'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           常量                                            │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const STORAGE_KEY = 'guide-banner-dismissed'

/* 核心概念数据 */
const CONCEPTS = [
  {
    icon: <LaborAnyLogo size={24} />,
    title: '能力单元 = AI 助手',
    desc: '每个能力单元专精一类任务',
    example: '写文档、做PPT、分析数据',
  },
  {
    icon: '🔄',
    title: '任务流 = 自动化流水线',
    desc: '多个能力单元串联，一键完成',
    example: '一键生成周报并发送邮件',
  },
  {
    icon: '⏰',
    title: '定时任务 = 自动执行',
    desc: '设定时间，自动运行工作流',
    example: '每周一自动生成周报',
  },
]

/* 快捷入口 */
const QUICK_LINKS = [
  { label: '查看全部能力', path: '/skills' },
  { label: '创建能力单元', path: '/create' },
  { label: '创建任务流', path: '/workflows/new' },
] as const

/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      主组件 - 引导横幅                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */
export function GuideBanner() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'true'
  )

  if (dismissed) return null

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setDismissed(true)
  }

  return (
    <div className="relative w-full rounded-xl px-6 py-5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-indigo-100/50 dark:border-indigo-800/30">
      {/* 关闭按钮 */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-4 text-indigo-300 hover:text-indigo-500 dark:text-indigo-600 dark:hover:text-indigo-400 text-lg leading-none"
      >
        &times;
      </button>

      {/* 三个核心概念 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        {CONCEPTS.map(({ icon, title, desc, example }) => (
          <div key={title} className="flex items-start gap-2.5">
            <span className="text-xl mt-0.5 shrink-0">{icon}</span>
            <div className="text-sm">
              <p className="font-medium text-indigo-700 dark:text-indigo-300">{title}</p>
              <p className="text-indigo-600/70 dark:text-indigo-400/70">{desc}</p>
              <p className="text-indigo-500/60 dark:text-indigo-500/50 text-xs mt-0.5">
                例：{example}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 快速开始 */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-indigo-100/50 dark:border-indigo-800/30">
        <p className="text-xs text-indigo-600/80 dark:text-indigo-400/80">
          试试下面的快捷按钮，或直接在输入框描述你的需求
        </p>
        <div className="flex items-center gap-2">
          {QUICK_LINKS.map(({ label, path }) => (
            <Link
              key={path}
              to={path}
              className="px-3 py-1 rounded-md text-xs font-medium bg-white/70 dark:bg-white/10 text-indigo-600 dark:text-indigo-300 hover:bg-white dark:hover:bg-white/20 border border-indigo-100 dark:border-indigo-700 transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
