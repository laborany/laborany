/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     技能引用标签 - 内联药丸组件                           ║
 * ║                                                                          ║
 * ║  显示在输入框旁，表示用户选中的技能，支持点击移除                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface SkillTagProps {
  icon: string
  name: string
  onRemove: () => void
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           标签组件                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function SkillTag({ icon, name, onRemove }: SkillTagProps) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-sm">
      <span>{icon}</span>
      <span>{name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 p-0.5 hover:bg-blue-100 rounded-full transition-colors"
        aria-label={`移除 ${name}`}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  )
}
