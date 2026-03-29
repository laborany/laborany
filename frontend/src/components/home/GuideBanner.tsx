import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LaborAnyLogo } from '../ui/LaborAnyLogo'

const STORAGE_KEY = 'guide-banner-dismissed'

const CONCEPTS = [
  {
    icon: <LaborAnyLogo size={24} />,
    title: '员工 = 一位数字同事',
    desc: '每位员工专注一类工作，擅长处理固定类型的任务。',
    example: '例如：写文档、做 PPT、分析数据、做调研。',
  },
  {
    icon: '🧑‍💼',
    title: '个人助理 = 老板的默认对话对象',
    desc: '助理先理解老板需求，简单的事直接处理，复杂的事安排给合适的同事。',
    example: '例如：先帮老板明确目标，再把任务一次性交给专业员工。',
  },
  {
    icon: '⏰',
    title: '日历·定时任务 = 提前排班做事',
    desc: '把工作安排进日历，到时间后员工会自动执行。',
    example: '例如：每周一早上自动生成周报。',
  },
]

const QUICK_LINKS = [
  { label: '打开技能·通讯录', path: '/skills' },
  { label: '联系 HR', path: '/create' },
  { label: '打开日历·定时任务', path: '/cron' },
] as const

export function GuideBanner() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'true',
  )

  if (dismissed) return null

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setDismissed(true)
  }

  return (
    <div className="relative w-full rounded-xl px-6 py-5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-indigo-100/50 dark:border-indigo-800/30">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-4 text-indigo-300 hover:text-indigo-500 dark:text-indigo-600 dark:hover:text-indigo-400 text-lg leading-none"
      >
        &times;
      </button>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        {CONCEPTS.map(({ icon, title, desc, example }) => (
          <div key={title} className="flex items-start gap-2.5">
            <span className="text-xl mt-0.5 shrink-0">{icon}</span>
            <div className="text-sm">
              <p className="font-medium text-indigo-700 dark:text-indigo-300">{title}</p>
              <p className="text-indigo-600/70 dark:text-indigo-400/70">{desc}</p>
              <p className="text-indigo-500/60 dark:text-indigo-500/50 text-xs mt-0.5">
                {example}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-indigo-100/50 dark:border-indigo-800/30">
        <p className="text-xs text-indigo-600/80 dark:text-indigo-400/80">
          你可以直接把事情交给个人助理，也可以从下面的快捷入口开始安排工作。
        </p>
        <div className="flex items-center gap-2">
          {QUICK_LINKS.map(({ label, path }) => (
            <Link
              key={`${path}-${label}`}
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
