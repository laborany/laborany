import { SettingsCard } from './SettingsCard'
import { PathRow } from './PathRow'
import { isAbsoluteStoragePath } from './hooks/useSettingsConfig'

export function StorageSection({
  appHome,
  configPath,
  profilePath,
  logsPath,
  logsFallbackActive,
  logsFallbackReason,
  migrationReportPath,
  storageHomeInput,
  setStorageHomeInput,
  switchingStorageHome,
  storagePathUnchanged,
  exportingLogs,
  exportLogs,
  switchStorageHome,
}: {
  appHome: string
  configPath: string
  profilePath: string
  logsPath: string
  logsFallbackActive: boolean
  logsFallbackReason: string
  migrationReportPath: string
  storageHomeInput: string
  setStorageHomeInput: (v: string) => void
  switchingStorageHome: boolean
  storagePathUnchanged: boolean
  exportingLogs: boolean
  exportLogs: () => void
  switchStorageHome: () => void
}) {
  return (
    <SettingsCard title="数据与存储" description="查看当前配置、日志和迁移报告路径。">
      <div className="space-y-2 text-sm text-muted-foreground">
        {appHome && <PathRow label="应用数据根目录" path={appHome} />}
        {configPath && <PathRow label="配置文件" path={configPath} />}
        {profilePath && <PathRow label="Profile" path={profilePath} />}
        {logsPath && <PathRow label="日志目录" path={logsPath} />}
        {migrationReportPath && <PathRow label="迁移报告" path={migrationReportPath} />}
        {logsFallbackActive && logsFallbackReason && (
          <p className="text-xs text-amber-700">日志目录降级: {logsFallbackReason}</p>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={exportLogs}
          disabled={exportingLogs}
          className="px-3 py-1.5 bg-background border border-border rounded text-sm hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exportingLogs ? '导出中...' : '导出诊断日志 (.zip)'}
        </button>
        <span className="text-xs text-muted-foreground">包含 API/Agent/Electron 运行日志，便于排障。</span>
      </div>
      <div className="mt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">存储路径切换</label>
        <input
          type="text"
          value={storageHomeInput}
          onChange={event => setStorageHomeInput(event.target.value)}
          disabled={switchingStorageHome}
          placeholder="例如: D:\\LaborAnyData 或 ~/LaborAnyData"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={switchStorageHome}
            disabled={switchingStorageHome || !storageHomeInput.trim() || storagePathUnchanged || !isAbsoluteStoragePath(storageHomeInput)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium bg-amber-600 text-white border border-amber-700 shadow-sm hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-amber-600"
          >
            {switchingStorageHome ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 animate-spin" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-6.2-8.56" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M3 7h13" /><path d="m13 3 4 4-4 4" /><path d="M21 17H8" /><path d="m11 13-4 4 4 4" />
              </svg>
            )}
            <span>{switchingStorageHome ? '切换中并重连...' : '迁移并切换路径'}</span>
          </button>
          <span className="text-xs text-muted-foreground">
            保存后会自动重启 API/Agent 并自动恢复连接，无需手动重启应用。
          </span>
        </div>
        {storagePathUnchanged && (
          <p className="text-xs text-muted-foreground">当前输入路径与现有路径一致。</p>
        )}
        {!storagePathUnchanged && storageHomeInput.trim() && !isAbsoluteStoragePath(storageHomeInput) && (
          <p className="text-xs text-amber-700">请输入绝对路径，例如 `D:\LaborAnyData`、`/Users/you/LaborAnyData` 或 `~/LaborAnyData`。</p>
        )}
      </div>
      <div className="mt-3 rounded border border-blue-300/60 bg-blue-50 p-3 text-xs text-blue-900">
        建议使用独立目录作为存储根路径。切换时会做增量迁移（目标目录已有同名文件会保留）。
      </div>
    </SettingsCard>
  )
}
