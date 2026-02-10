/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      LaborAny Logo - 品牌标识                          ║
 * ║                                                                          ║
 * ║  纯 SVG 实现，暖橙渐变 "L" 字母标识，与主色调对齐                       ║
 * ║  支持 size / className 自定义                                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

interface LaborAnyLogoProps {
  size?: number
  className?: string
}

export function LaborAnyLogo({ size = 32, className = '' }: LaborAnyLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f97316" />
          <stop offset="1" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#logo-grad)" />
      <path
        d="M16 12V36H32"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
