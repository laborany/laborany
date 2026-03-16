export function SettingsSaveBar({
  saving,
  onSave,
  hint,
}: {
  saving: boolean
  onSave: () => void
  hint?: string
}) {
  return (
    <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-lg border border-border bg-card/95 p-4 backdrop-blur">
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      <button
        onClick={onSave}
        disabled={saving}
        className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {saving && (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        保存配置
      </button>
    </div>
  )
}
