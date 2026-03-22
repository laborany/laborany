export interface CollaborationTabItem {
  id: string
  label: string
  badge?: string
}

interface CollaborationTabsProps {
  tabs: CollaborationTabItem[]
  activeTab: string
  onChange: (tabId: string) => void
}

export function CollaborationTabs({ tabs, activeTab, onChange }: CollaborationTabsProps) {
  if (tabs.length <= 1) return null

  return (
    <div className="inline-flex items-center gap-1 rounded-2xl border border-border bg-muted/50 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>{tab.label}</span>
            {tab.badge && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
    </div>
  )
}
