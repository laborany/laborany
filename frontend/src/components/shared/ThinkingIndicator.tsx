/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     思考中指示器 - ThinkingIndicator                     ║
 * ║                                                                          ║
 * ║  统一的 AI 思考状态反馈组件                                                ║
 * ║  结构：[灯泡图标] [文字] [弹跳点] —— 图标紧贴文字，动画点作尾部装饰        ║
 * ║                                                                          ║
 * ║  两种变体：                                                               ║
 * ║  · bubble  — 消息气泡风格，用于对话面板                                    ║
 * ║  · accent  — 强调色背景 + 入场动画，用于执行面板                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

interface ThinkingIndicatorProps {
  text?: string
  variant?: 'bubble' | 'accent'
}

/* ── 变体样式映射 ── */
const wrapperStyles = {
  bubble: 'flex justify-start',
  accent: 'flex items-center py-3 animate-in fade-in slide-in-from-bottom-1 duration-200',
} as const

const pillStyles = {
  bubble: 'bg-muted rounded-lg px-4 py-3',
  accent: 'rounded-lg bg-accent/30 px-4 py-2.5',
} as const

export function ThinkingIndicator({ text = '思考中', variant = 'bubble' }: ThinkingIndicatorProps) {
  return (
    <div className={wrapperStyles[variant]}>
      <div className={pillStyles[variant]}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <svg className="w-4 h-4 text-primary/60 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span>{text}</span>
          <BouncingDots />
        </div>
      </div>
    </div>
  )
}

/* ── 弹跳三点动画 ── */
function BouncingDots() {
  return (
    <div className="flex gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  )
}
