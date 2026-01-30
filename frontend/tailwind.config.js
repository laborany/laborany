/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      /* ┌──────────────────────────────────────────────────────────────────────┐
       * │                           色彩系统                                    │
       * │  使用 CSS 变量，支持 OKLCH 色彩空间                                    │
       * └──────────────────────────────────────────────────────────────────────┘ */
      colors: {
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
          50: 'var(--primary-50)',
          100: 'var(--primary-100)',
          500: 'var(--primary-500)',
          600: 'var(--primary-600)',
          700: 'var(--primary-700)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
      },
      /* ┌──────────────────────────────────────────────────────────────────────┐
       * │                           圆角系统                                    │
       * └──────────────────────────────────────────────────────────────────────┘ */
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
      },
      /* ┌──────────────────────────────────────────────────────────────────────┐
       * │                           动画系统                                    │
       * │  包含基础动画和高级效果（grid, ripple, meteor）                        │
       * └──────────────────────────────────────────────────────────────────────┘ */
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-in-from-bottom-1': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        /* 高级动画 */
        'grid-pattern': {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '40px 40px' },
        },
        'ripple': {
          '0%': { transform: 'scale(0)', opacity: '0.5' },
          '100%': { transform: 'scale(4)', opacity: '0' },
        },
        'meteor': {
          '0%': { transform: 'rotate(215deg) translateX(0)', opacity: '1' },
          '70%': { opacity: '1' },
          '100%': { transform: 'rotate(215deg) translateX(-500px)', opacity: '0' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'glow': {
          '0%, 100%': { boxShadow: '0 0 5px var(--primary), 0 0 10px var(--primary)' },
          '50%': { boxShadow: '0 0 20px var(--primary), 0 0 30px var(--primary)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'slide-in-from-bottom-1': 'slide-in-from-bottom-1 0.2s ease-out',
        'pulse-dot': 'pulse-dot 1.5s ease-in-out infinite',
        /* 高级动画 */
        'grid-pattern': 'grid-pattern 20s linear infinite',
        'ripple': 'ripple 0.6s ease-out',
        'meteor': 'meteor 5s linear infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'float': 'float 3s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite',
      },
      /* ┌──────────────────────────────────────────────────────────────────────┐
       * │                           背景图案                                    │
       * └───────────────────────────────────────��──────────────────────────────┘ */
      backgroundImage: {
        'grid-pattern': `linear-gradient(var(--border) 1px, transparent 1px),
                         linear-gradient(90deg, var(--border) 1px, transparent 1px)`,
        'dot-pattern': `radial-gradient(var(--border) 1px, transparent 1px)`,
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      backgroundSize: {
        'grid': '40px 40px',
        'dot': '20px 20px',
      },
    },
  },
  plugins: [],
}
