/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      官方技能市场                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { OfficialSkill } from '../../types'

interface OfficialMarketProps {
  skills: OfficialSkill[]
  installedIds: Set<string>
  installing: string | null
  customUrl: string
  installError: string | null
  onInstall: (source: string) => void
  onCustomUrlChange: (url: string) => void
}

export function OfficialMarket({
  skills,
  installedIds,
  installing,
  customUrl,
  installError,
  onInstall,
  onCustomUrlChange,
}: OfficialMarketProps) {
  return (
    <div className="space-y-6">
      {/* 自定义 GitHub URL 安装 */}
      <div className="card p-6">
        <h3 className="font-semibold text-foreground mb-3">从 GitHub 安装</h3>
        <p className="text-sm text-muted-foreground mb-4">
          输入 GitHub 仓库中 Skill 的路径，例如：
          <code className="mx-1 px-2 py-1 bg-muted rounded text-xs">
            anthropics/skills/skills/skill-creator
          </code>
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={customUrl}
            onChange={(e) => onCustomUrlChange(e.target.value)}
            placeholder="owner/repo/path/to/skill 或 GitHub URL"
            className="input flex-1"
          />
          <button
            onClick={() => customUrl && onInstall(customUrl)}
            disabled={!customUrl || installing === customUrl}
            className="btn-primary px-6 py-2"
          >
            {installing === customUrl ? '安装中...' : '安装'}
          </button>
        </div>
        {installError && (
          <p className="mt-2 text-sm text-destructive">{installError}</p>
        )}
      </div>

      {/* 官方技能列表 */}
      <div>
        <h3 className="font-semibold text-foreground mb-4">
          Anthropic 官方技能
        </h3>
        {skills.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>正在加载官方技能...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {skills.map((skill) => {
              const isInstalled = installedIds.has(skill.id)
              const isInstalling = installing === skill.source

              return (
                <div key={skill.id} className="card-hover p-6">
                  <div className="flex items-start gap-4">
                    <span className="text-3xl">🔧</span>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg text-foreground">
                        {skill.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {skill.description}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-2 truncate">
                        {skill.source}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    {isInstalled ? (
                      <span className="block text-center py-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        已安装
                      </span>
                    ) : (
                      <button
                        onClick={() => onInstall(skill.source)}
                        disabled={isInstalling}
                        className="btn-primary w-full py-2 text-sm"
                      >
                        {isInstalling ? '安装中...' : '安装'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
