/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      Tab 按钮组件                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

interface TabButtonProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

export function TabButton({ active, onClick, children }: TabButtonProps) {
  const baseClass = 'pb-3 text-sm font-medium border-b-2 transition-colors'
  const activeClass = active
    ? 'border-primary text-primary'
    : 'border-transparent text-muted-foreground hover:text-foreground'

  return (
    <button onClick={onClick} className={`${baseClass} ${activeClass}`}>
      {children}
    </button>
  )
}
