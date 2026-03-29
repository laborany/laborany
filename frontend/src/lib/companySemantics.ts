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
    primary: '首页',
    secondary: '办公桌',
    shortLabel: '首页',
  },
  skills: {
    primary: '技能',
    secondary: '通讯录',
    shortLabel: '通讯录',
  },
  cron: {
    primary: '日历',
    secondary: '定时任务',
    shortLabel: '定时任务',
  },
  history: {
    primary: '工作记录',
    secondary: '历史',
    shortLabel: '工作记录',
  },
  memory: {
    primary: '记忆',
    secondary: '老板档案',
    shortLabel: '老板档案',
  },
  settings: {
    primary: '设置',
    shortLabel: '设置',
  },
}

export function getCompanyNavLabel(key: CompanyNavKey, collapsed = false): string {
  const copy = NAV_COPY[key]
  if (collapsed) return copy.shortLabel
  return copy.secondary ? `${copy.primary}·${copy.secondary}` : copy.primary
}
