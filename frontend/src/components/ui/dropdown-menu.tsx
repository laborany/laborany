/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         DropdownMenu 组件                                 ║
 * ║                                                                          ║
 * ║  下拉菜单组件，支持触发器、菜单项、分隔符                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { ReactNode, useState, useRef, useEffect, createContext, useContext } from 'react'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           Context                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
interface DropdownContextValue {
  open: boolean
  setOpen: (open: boolean) => void
}

const DropdownContext = createContext<DropdownContextValue | null>(null)

function useDropdown() {
  const ctx = useContext(DropdownContext)
  if (!ctx) throw new Error('useDropdown must be used within DropdownMenu')
  return ctx
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           DropdownMenu 根组件                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function DropdownMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <DropdownContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block">{children}</div>
    </DropdownContext.Provider>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           触发器                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function DropdownMenuTrigger({ children, asChild }: { children: ReactNode; asChild?: boolean }) {
  const { open, setOpen } = useDropdown()

  if (asChild) {
    return (
      <span onClick={() => setOpen(!open)} className="cursor-pointer">
        {children}
      </span>
    )
  }

  return (
    <button
      onClick={() => setOpen(!open)}
      className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
    >
      {children}
    </button>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           菜单内容                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function DropdownMenuContent({
  children,
  align = 'start',
}: {
  children: ReactNode
  align?: 'start' | 'end'
}) {
  const { open, setOpen } = useDropdown()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, setOpen])

  if (!open) return null

  const alignClass = align === 'end' ? 'right-0' : 'left-0'

  return (
    <div
      ref={ref}
      className={`absolute top-full mt-1 ${alignClass} z-50 min-w-[8rem] rounded-lg border border-border bg-card p-1 shadow-lg animate-in fade-in slide-in-from-bottom-1`}
    >
      {children}
    </div>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           菜单项                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function DropdownMenuItem({
  children,
  onClick,
  disabled,
  className,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
}) {
  const { setOpen } = useDropdown()

  const handleClick = () => {
    if (disabled) return
    onClick?.()
    setOpen(false)
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`flex w-full items-center rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           分隔符                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function DropdownMenuSeparator() {
  return <div className="my-1 h-px bg-border" />
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
}
