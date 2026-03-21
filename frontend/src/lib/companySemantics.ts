export type CompanyNavKey =
  | 'home'
  | 'skills'
  | 'cron'
  | 'history'
  | 'memory'
  | 'settings'

interface CompanyNavCopy {
  primary: string
  secondary?: string
  shortLabel: string
}

export const COMPANY_APP_COPY = {
  brandTitle: 'LaborAny',
  brandSubtitle: '老板的数字员工公司',
  bossRoleLabel: '老板',
  bossWorkspaceLabel: '老板席位',
} as const

const NAV_COPY: Record<CompanyNavKey, CompanyNavCopy> = {
  home: {
    primary: '助理办公桌',
    secondary: '首页',
    shortLabel: '助理办公桌',
  },
  skills: {
    primary: '通讯录',
    secondary: '员工',
    shortLabel: '通讯录',
  },
  cron: {
    primary: '日历',
    secondary: '安排',
    shortLabel: '日历',
  },
  history: {
    primary: '工作记录',
    secondary: '历史',
    shortLabel: '工作记录',
  },
  memory: {
    primary: '老板档案',
    secondary: 'Memory',
    shortLabel: '老板档案',
  },
  settings: {
    primary: '公司设置',
    secondary: '设置',
    shortLabel: '公司设置',
  },
}

export function getCompanyNavLabel(key: CompanyNavKey, collapsed = false): string {
  const copy = NAV_COPY[key]
  if (collapsed) return copy.shortLabel
  return copy.secondary ? `${copy.primary} · ${copy.secondary}` : copy.primary
}

