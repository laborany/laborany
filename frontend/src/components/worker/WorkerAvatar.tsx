/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      员工头像组件                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { LaborAnyLogo } from '../ui/LaborAnyLogo'

interface WorkerAvatarProps {
  icon?: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_MAP = {
  sm: 'w-10 h-10 text-xl',
  md: 'w-12 h-12 text-2xl',
  lg: 'w-16 h-16 text-3xl',
}

export function WorkerAvatar({ icon, size = 'md' }: WorkerAvatarProps) {
  return (
    <div
      className={`${SIZE_MAP[size]} rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0`}
    >
      {icon || <LaborAnyLogo size={size === 'sm' ? 24 : size === 'lg' ? 36 : 28} />}
    </div>
  )
}
