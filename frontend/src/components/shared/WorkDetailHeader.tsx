import { CollaborationTabs } from './CollaborationTabs'

interface WorkDetailHeaderTab {
  id: string
  label: string
}

interface WorkDetailHeaderProps {
  title: string
  onBack: () => void
  statusLabel?: string | null
  statusBadgeClassName?: string
  stageLabel?: string | null
  ownerLabel?: string | null
  metaText?: string
  rightSlot?: React.ReactNode
  tabs?: WorkDetailHeaderTab[]
  activeTab?: string
  onTabChange?: (tabId: string) => void
}

export function WorkDetailHeader({
  title,
  onBack,
  statusLabel,
  statusBadgeClassName,
  stageLabel,
  ownerLabel,
  metaText,
  rightSlot,
  tabs,
  activeTab,
  onTabChange,
}: WorkDetailHeaderProps) {
  const showTabs = Boolean(tabs && tabs.length > 1 && activeTab && onTabChange)

  return (
    <div className="mb-4 shrink-0 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-4 pr-4">
          <button
            type="button"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0 max-w-[16rem] sm:max-w-[20rem] md:max-w-[24rem] lg:max-w-[28rem] xl:max-w-[32rem]">
            <h2 className="truncate text-lg font-semibold text-foreground">{title}</h2>
            {(stageLabel || ownerLabel) && (
              <p className="mt-1 text-xs text-muted-foreground">
                {[stageLabel, ownerLabel ? `负责人：${ownerLabel}` : ''].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          {statusLabel && statusBadgeClassName && (
            <span className={`shrink-0 ${statusBadgeClassName}`}>
              {statusLabel}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {rightSlot}
          {metaText && (
            <div className="text-sm text-muted-foreground whitespace-nowrap">
              {metaText}
            </div>
          )}
        </div>
      </div>

      {showTabs && tabs && activeTab && onTabChange && (
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card/60 px-4 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              协作视角
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              按处理顺序查看这项工作的不同阶段，默认先打开当前执行中的角色。
            </p>
          </div>
          <CollaborationTabs
            tabs={tabs}
            activeTab={activeTab}
            onChange={onTabChange}
          />
        </div>
      )}
    </div>
  )
}
