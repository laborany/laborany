import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LaborAnyLogo } from '../ui/LaborAnyLogo'

const STORAGE_KEY = 'guide-banner-dismissed'

const CONCEPTS = [
  {
    icon: <LaborAnyLogo size={24} />,
    title: '技能单元 = AI 助手',
    desc: '每个技能单元专注一类任务。',
    example: '例如：写文档、做 PPT、分析数据。',
  },
  {
    icon: '🧩',
    title: '复合技能 = 分步骤自动执行',
    desc: '多个技能单元串联，按步骤自动完成。',
    example: '例如：一键生成周报并发送邮件。',
  },
  {
    icon: '⏰',
    title: '定时任务 = 自动触发',
    desc: '设定时间后，自动执行技能或复合技能。',
    example: '例如：每周一自动生成周报。',
  },
]

const QUICK_LINKS = [
  { label: '查看全部技能', path: '/skills' },
  { label: '创建技能单元', path: '/create' },
  { label: '创建复合技能', path: '/create' },
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
          试试下面的快捷入口，或直接在首页输入框描述你的任务。
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

