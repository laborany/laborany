import { useState, useEffect, useCallback, type ChangeEvent } from 'react'
import { AGENT_API_BASE } from '../../config/api'
import { openFileExternal, openUrlExternal } from '../../lib/system-open'
import { SettingsCard } from './SettingsCard'
import { GuideBlock } from './GuideBlock'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Web Research 状态类型                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */

interface WebResearchStatus {
  browser: { available: boolean; port: number }
  zhipu: { available: boolean }
  sitePatterns: { count: number; builtinCount: number; userCount: number; candidateCount: number }
  paths: {
    runtimeHomeDir: string
    dataDir: string
    sitePatternsRoot: string
    sitePatternsVerified: string
    sitePatternsCandidate: string
    builtinPatternsDir: string
  }
  mode: 'full' | 'api' | 'degraded'
  nodeVersion: string
}

interface ResearchObservation {
  kind?: string
  domain?: string
  url?: string
  strategy?: string
  message?: string
}

interface CandidatePatternSummary {
  domain: string
  access_strategy?: string
  verified_at?: string
  evidence_count?: number
  source?: string
  markdown?: string
}

interface SearchTestItem {
  title: string
  url: string
  snippet?: string
  source?: string
}

interface SearchTestResponse {
  results?: SearchTestItem[]
  backend?: string
  strategy?: string
  degraded?: boolean
  reason?: string
  observations?: ResearchObservation[]
}

interface ReadPageTestResponse {
  url: string
  title?: string
  content?: string
  format?: 'markdown' | 'text' | 'html'
  fetchMethod?: string
  strategy?: string
  observations?: ResearchObservation[]
  error?: string
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  模式标签配置                                                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */

const MODE_CONFIG: Record<WebResearchStatus['mode'], {
  emoji: string
  label: string
  description: string
  badgeClass: string
}> = {
  full: {
    emoji: '\u{1F7E2}',
    label: '完整模式',
    description: '搜索 + 静态抓取 + 浏览器增强',
    badgeClass: 'bg-green-500/10 text-green-700 border-green-500/20',
  },
  api: {
    emoji: '\u{1F7E1}',
    label: 'API 模式',
    description: '搜索 + 静态抓取',
    badgeClass: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  },
  degraded: {
    emoji: '\u{1F7E0}',
    label: '降级模式',
    description: '仅静态抓取',
    badgeClass: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
  },
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  BrowserResearchSection                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function BrowserResearchSection() {
  const [status, setStatus] = useState<WebResearchStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [importContent, setImportContent] = useState('')
  const [importFilename, setImportFilename] = useState('')
  const [importScope, setImportScope] = useState<'verified' | 'candidate'>('candidate')
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [inspectHint, setInspectHint] = useState<string | null>(null)
  const [candidatePatterns, setCandidatePatterns] = useState<CandidatePatternSummary[]>([])
  const [reviewingKey, setReviewingKey] = useState<string | null>(null)
  const [reviewMessage, setReviewMessage] = useState<string | null>(null)
  const [pathActionMessage, setPathActionMessage] = useState<string | null>(null)
  const [openingPath, setOpeningPath] = useState<string | null>(null)
  const [searchTestQuery, setSearchTestQuery] = useState('OpenAI Sora 2 official site')
  const [searchTestSite, setSearchTestSite] = useState('openai.com')
  const [searchTestEngine, setSearchTestEngine] = useState<'auto' | 'google' | 'bing'>('auto')
  const [searchTesting, setSearchTesting] = useState(false)
  const [searchTestError, setSearchTestError] = useState<string | null>(null)
  const [searchTestResult, setSearchTestResult] = useState<SearchTestResponse | null>(null)
  const [readTestUrl, setReadTestUrl] = useState('https://openai.com/index/sora-2/')
  const [readTestMode, setReadTestMode] = useState<'markdown' | 'text' | 'html'>('markdown')
  const [readTesting, setReadTesting] = useState(false)
  const [readTestError, setReadTestError] = useState<string | null>(null)
  const [readTestResult, setReadTestResult] = useState<ReadPageTestResponse | null>(null)

  const fetchCandidates = useCallback(async () => {
    const res = await fetch(`${AGENT_API_BASE}/_internal/web-research/site-patterns/candidates`)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }
    const data = await res.json() as { candidates?: CandidatePatternSummary[] }
    setCandidatePatterns(Array.isArray(data.candidates) ? data.candidates : [])
  }, [])

  const fetchStatus = useCallback(async () => {
    try {
      setError(null)
      const [statusRes] = await Promise.all([
        fetch(`${AGENT_API_BASE}/_internal/web-research/status?detailed=1`),
        fetchCandidates(),
      ])
      if (!statusRes.ok) {
        throw new Error(`HTTP ${statusRes.status}: ${statusRes.statusText}`)
      }
      const data = await statusRes.json() as WebResearchStatus
      setStatus(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus(null)
      setCandidatePatterns([])
    } finally {
      setLoading(false)
    }
  }, [fetchCandidates])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleTestConnection = async () => {
    setTesting(true)
    try {
      await fetch(`${AGENT_API_BASE}/_internal/web-research/connect-browser`, {
        method: 'POST',
      })
    } catch {
      // fetchStatus will surface the actual state/error
    }
    await fetchStatus()
    setTesting(false)
  }

  const handleOpenChromeInspect = async () => {
    setInspectHint(null)
    const url = 'chrome://inspect/#remote-debugging'

    try {
      await openUrlExternal(url)
      setInspectHint('已尝试打开 Chrome 调试页。保持这个页面开着，等 LaborAny 首次连接时在 Chrome 弹窗里点一次 Allow。')
      return
    } catch {
      // ignore and fall back to copy
    }

    try {
      await navigator.clipboard.writeText(url)
      setInspectHint('Chrome 阻止了页面直接跳转，已将地址复制到剪贴板。请粘贴到 Chrome 地址栏打开，并在首次连接弹窗里点 Allow。')
    } catch {
      setInspectHint('当前环境无法直接打开调试页。请手动复制下面的地址到 Chrome 地址栏：chrome://inspect/#remote-debugging，然后在首次连接弹窗里点 Allow。')
    }
  }

  const handleImportPattern = async () => {
    if (!importContent.trim()) {
      setImportMessage('请先粘贴站点经验 Markdown 内容。')
      return
    }

    try {
      setImporting(true)
      setImportMessage(null)
      const res = await fetch(`${AGENT_API_BASE}/_internal/web-research/site-patterns/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: importContent,
          filename: importFilename || undefined,
          scope: importScope,
        }),
      })
      const data = await res.json() as { error?: string; pattern?: { domain?: string } }
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setImportMessage(`已导入 ${data.pattern?.domain || '站点经验'}。`)
      setImportContent('')
      setImportFilename('')
      await fetchStatus()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setImportMessage(`导入失败: ${msg}`)
    } finally {
      setImporting(false)
    }
  }

  const handleReviewCandidate = async (
    domain: string,
    action: 'approve' | 'reject',
  ) => {
    const reviewKey = `${domain}:${action}`
    try {
      setReviewingKey(reviewKey)
      setReviewMessage(null)
      const res = await fetch(`${AGENT_API_BASE}/_internal/web-research/site-patterns/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, action }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setReviewMessage(
        action === 'approve'
          ? `已将 ${domain} 提升为 verified。`
          : `已拒绝 ${domain} 的 candidate。`,
      )
      await fetchStatus()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setReviewMessage(`处理失败: ${msg}`)
    } finally {
      setReviewingKey(null)
    }
  }

  const handleRunSearchTest = async () => {
    const query = searchTestQuery.trim()
    const site = searchTestSite.trim()
    if (!query) {
      setSearchTestError('请先输入搜索查询。')
      setSearchTestResult(null)
      return
    }

    try {
      setSearchTesting(true)
      setSearchTestError(null)
      const res = await fetch(`${AGENT_API_BASE}/_internal/web-research/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          site: site || undefined,
          engine: searchTestEngine,
        }),
      })
      const data = await res.json() as SearchTestResponse & { error?: string }
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setSearchTestResult(data)
      await fetchStatus()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setSearchTestError(msg)
      setSearchTestResult(null)
    } finally {
      setSearchTesting(false)
    }
  }

  const handleRunReadTest = async () => {
    const url = readTestUrl.trim()
    if (!url) {
      setReadTestError('请先输入要读取的 URL。')
      setReadTestResult(null)
      return
    }

    try {
      setReadTesting(true)
      setReadTestError(null)
      const res = await fetch(`${AGENT_API_BASE}/_internal/web-research/read-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          extract_mode: readTestMode,
        }),
      })
      const data = await res.json() as ReadPageTestResponse & { error?: string }
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setReadTestResult(data)
      await fetchStatus()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setReadTestError(msg)
      setReadTestResult(null)
    } finally {
      setReadTesting(false)
    }
  }

  const handlePatternFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      setImportContent(text)
      if (!importFilename) {
        setImportFilename(file.name)
      }
      setImportMessage(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setImportMessage(`读取文件失败: ${msg}`)
    } finally {
      event.target.value = ''
    }
  }

  const handleOpenPath = async (path: string) => {
    if (!path) return

    try {
      setOpeningPath(path)
      setPathActionMessage(null)
      await openFileExternal(path)
      setPathActionMessage(`已尝试打开目录：${path}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setPathActionMessage(`打开目录失败：${msg}`)
    } finally {
      setOpeningPath(null)
    }
  }

  const handleCopyPath = async (path: string) => {
    if (!path) return

    try {
      await navigator.clipboard.writeText(path)
      setPathActionMessage(`已复制路径：${path}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setPathActionMessage(`复制路径失败：${msg}`)
    }
  }

  const modeInfo = status ? MODE_CONFIG[status.mode] : null

  return (
    <SettingsCard
      title="浏览器增强研究"
      description="管理联网搜索与浏览器增强能力。Chrome 远程调试可解锁完整的网页抓取和截图功能。"
      action={
        <button
          onClick={handleTestConnection}
          disabled={testing}
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testing ? '检测中...' : '测试连接'}
        </button>
      }
    >
      {/* 加载中 */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          正在获取状态...
        </div>
      )}

      {/* 连接错误 */}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700">
          无法连接到 Agent Service: {error}
        </div>
      )}

      {/* 状态指标 */}
      {status && (
        <>
          <div className="grid gap-3 rounded-lg border border-border bg-background/70 p-4 text-sm md:grid-cols-3">
            {/* Node.js 版本 */}
            <div>
              <p className="text-xs text-muted-foreground">Node.js</p>
              <p className="mt-1 font-medium text-foreground">
                {status.nodeVersion ? (
                  <><span className="text-green-600">✅</span> {status.nodeVersion}</>
                ) : (
                  <><span className="text-red-600">❌</span> 未检测到</>
                )}
              </p>
            </div>

            {/* Chrome CDP 连接 */}
            <div>
              <p className="text-xs text-muted-foreground">Chrome CDP</p>
              <p className="mt-1 font-medium text-foreground">
                {status.browser.available ? (
                  <><span className="text-green-600">✅</span> 已连接 <span className="text-xs text-muted-foreground">(:{status.browser.port})</span></>
                ) : (
                  <><span className="text-red-600">❌</span> 未连接</>
                )}
              </p>
            </div>

            {/* 站点经验 */}
            <div>
              <p className="text-xs text-muted-foreground">站点经验</p>
              <p className="mt-1 font-medium text-foreground">
                active {status.sitePatterns.count} 个
                <span className="text-xs text-muted-foreground ml-1">
                  (内置 {status.sitePatterns.builtinCount} + 用户 {status.sitePatterns.userCount}，候选 {status.sitePatterns.candidateCount})
                </span>
              </p>
            </div>
          </div>

          {/* 当前模式 */}
          {modeInfo && (
            <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${modeInfo.badgeClass}`}>
              <span>{modeInfo.emoji}</span>
              <span className="font-medium">{modeInfo.label}</span>
              <span className="text-xs opacity-75">({modeInfo.description})</span>
              {status.mode !== 'full' && (
                <span className="ml-auto text-xs opacity-60">
                  完整模式需要 Chrome 远程调试支持
                </span>
              )}
            </div>
          )}

          <div className="rounded-lg border border-border bg-background/70 p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">站点经验目录</p>
              <p className="mt-1 text-xs text-muted-foreground">
                自动沉淀会先写入 `candidate`，评审通过后进入 `verified`。这些目录都位于桌面版的可写用户数据目录，不会写到应用安装包里。
              </p>
            </div>

            <div className="space-y-2">
              {[
                { label: '运行时根目录', path: status.paths.runtimeHomeDir },
                { label: '数据目录', path: status.paths.dataDir },
                { label: '站点经验根目录', path: status.paths.sitePatternsRoot },
                { label: 'candidate 目录', path: status.paths.sitePatternsCandidate },
                { label: 'verified 目录', path: status.paths.sitePatternsVerified },
                { label: '内置 patterns 目录', path: status.paths.builtinPatternsDir },
              ].map((item) => (
                <div key={item.label} className="rounded-md border border-border bg-background/80 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-foreground">{item.label}</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopyPath(item.path)}
                        className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        复制路径
                      </button>
                      <button
                        onClick={() => handleOpenPath(item.path)}
                        disabled={openingPath === item.path}
                        className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                      >
                        {openingPath === item.path ? '打开中...' : '打开目录'}
                      </button>
                    </div>
                  </div>
                  <code className="mt-2 block break-all rounded bg-background px-2 py-1 text-[11px] text-muted-foreground">
                    {item.path}
                  </code>
                </div>
              ))}
            </div>

            {pathActionMessage && (
              <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground">
                {pathActionMessage}
              </div>
            )}
          </div>

          {/* CDP 未连接时的配置引导 */}
          {!status.browser.available && (
            <GuideBlock title="Chrome 远程调试配置指引（可折叠）" tone="blue">
              <p>启用 Chrome 远程调试后，LaborAny 可以访问动态渲染的网页（如小红书、微信公众号等 SPA 站点），并支持网页截图功能。</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={handleOpenChromeInspect}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  打开 Chrome 调试页
                </button>
                <code className="rounded bg-background/80 px-2 py-1 text-xs">chrome://inspect/#remote-debugging</code>
              </div>
              {inspectHint && (
                <p className="rounded-md border border-blue-200/70 bg-blue-50/70 px-3 py-2 text-xs text-blue-900">
                  {inspectHint}
                </p>
              )}
              <ol className="list-decimal list-inside space-y-1 mt-2">
                <li>在 Chrome 中打开 <code className="rounded bg-background/80 px-1 py-0.5 text-xs">chrome://inspect/#remote-debugging</code></li>
                <li>保持这个页面开着；当 LaborAny 第一次连接当前 Chrome 时，Chrome 会弹出远程调试授权对话框</li>
                <li>在授权对话框里点击 <strong>Allow</strong></li>
                <li>如果 Google、Bing 或目标站点出现验证，请在当前浏览器里手动通过一次</li>
                <li>回到这里点击上方的「测试连接」按钮验证是否成功</li>
              </ol>
              <p className="mt-2 text-xs text-muted-foreground">
                新版 Chrome 上不一定会显示旧版的勾选开关。以当前流程为准：打开 inspect 页面，等待首次连接时点一次 Allow。
              </p>
              <details className="rounded-md border border-border bg-background/60 p-3 text-xs">
                <summary className="cursor-pointer font-medium text-foreground">备用方案：专用研究浏览器 profile</summary>
                <p className="mt-2">
                  某些新版 Chrome 或企业策略环境下，默认实例可能不接受远程调试。这时可启动一份专用研究浏览器，并在其中单独登录需要的网站。
                </p>
                <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-background/80 p-3 text-xs leading-5"><code>{`mkdir -p "$HOME/Library/Application Support/LaborAny/ChromeResearchProfile"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\
  --user-data-dir="$HOME/Library/Application Support/LaborAny/ChromeResearchProfile" \\
  --remote-debugging-port=9222`}</code></pre>
              </details>
            </GuideBlock>
          )}

          <div className="rounded-lg border border-border bg-background/70 p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">搜索引擎链路测试</p>
              <p className="mt-1 text-xs text-muted-foreground">
                直接测试 LaborAny 当前的 Google / Bing / auto 搜索策略，确认浏览器搜索链路、站点限定和降级行为是否正常。
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                如果命中了站内搜索自动化，或者站内搜索失败后 fallback 成功，对应站点经验会自动沉淀。
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                显式选择 `google` 或 `bing` 时，通用搜索会直走对应引擎；如果同时指定了站点，仍会先尝试站内直搜，再按所选引擎 fallback。
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_160px_120px]">
              <input
                value={searchTestQuery}
                onChange={(e) => setSearchTestQuery(e.target.value)}
                placeholder="搜索词，例如 OpenAI Sora 2 official site"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={searchTestSite}
                onChange={(e) => setSearchTestSite(e.target.value)}
                placeholder="可选站点，例如 openai.com"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <select
                value={searchTestEngine}
                onChange={(e) => setSearchTestEngine(e.target.value as 'auto' | 'google' | 'bing')}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="auto">auto</option>
                <option value="google">google</option>
                <option value="bing">bing</option>
              </select>
              <button
                onClick={handleRunSearchTest}
                disabled={searchTesting}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {searchTesting ? '测试中...' : '运行测试'}
              </button>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <button
                onClick={() => {
                  setSearchTestQuery('OpenAI Sora 2 official site')
                  setSearchTestSite('openai.com')
                  setSearchTestEngine('google')
                }}
                className="rounded-full border border-border bg-background px-2.5 py-1 hover:text-foreground"
              >
                Google 官方站点示例
              </button>
              <button
                onClick={() => {
                  setSearchTestQuery('OpenAI Sora 2 official site')
                  setSearchTestSite('openai.com')
                  setSearchTestEngine('bing')
                }}
                className="rounded-full border border-border bg-background px-2.5 py-1 hover:text-foreground"
              >
                Bing 官方站点示例
              </button>
              <button
                onClick={() => {
                  setSearchTestQuery('小红书 春季穿搭')
                  setSearchTestSite('xiaohongshu.com')
                  setSearchTestEngine('auto')
                }}
                className="rounded-full border border-border bg-background px-2.5 py-1 hover:text-foreground"
              >
                站内搜索示例
              </button>
            </div>

            {searchTestError && (
              <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-700">
                测试失败：{searchTestError}
              </div>
            )}

            {searchTestResult && (
              <div className="space-y-3 rounded-md border border-border bg-background/80 p-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>backend: <span className="text-foreground">{searchTestResult.backend || 'unknown'}</span></span>
                  <span>strategy: <span className="text-foreground">{searchTestResult.strategy || 'unknown'}</span></span>
                  <span>degraded: <span className="text-foreground">{searchTestResult.degraded ? 'true' : 'false'}</span></span>
                  <span>results: <span className="text-foreground">{searchTestResult.results?.length || 0}</span></span>
                </div>

                {searchTestResult.observations && searchTestResult.observations.length > 0 && (
                  <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800">
                    {searchTestResult.observations.map((item) => item.message || item.kind).filter(Boolean).join('；')}
                  </div>
                )}

                {searchTestResult.reason && (
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
                    {searchTestResult.reason}
                  </div>
                )}

                {searchTestResult.results && searchTestResult.results.length > 0 ? (
                  <div className="space-y-2">
                    {searchTestResult.results.slice(0, 5).map((item, index) => (
                      <div key={`${item.url}-${index}`} className="rounded-md border border-border bg-background p-3">
                        <p className="text-sm font-medium text-foreground">{index + 1}. {item.title || 'Untitled'}</p>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block break-all text-xs text-blue-600 hover:underline"
                        >
                          {item.url}
                        </a>
                        {item.snippet && (
                          <p className="mt-2 text-xs text-muted-foreground">{item.snippet}</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {item.source && (
                            <p className="text-[11px] text-muted-foreground">source: {item.source}</p>
                          )}
                          <button
                            onClick={() => {
                              setReadTestUrl(item.url)
                              setReadTestMode('markdown')
                            }}
                            className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            带入读取测试
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  !searchTestError && (
                    <div className="rounded-md border border-dashed border-border bg-background px-3 py-3 text-xs text-muted-foreground">
                      当前没有返回结果。
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-background/70 p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">网页读取链路测试</p>
              <p className="mt-1 text-xs text-muted-foreground">
                直接测试 read_page 的实际抓取方式，确认页面最终是由 Jina、静态抓取还是浏览器 CDP 返回。
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                命中结构化提取成功、静态失败后浏览器兜底成功等高价值信号时，也会自动沉淀站点经验。
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-[1.5fr_160px_120px]">
              <input
                value={readTestUrl}
                onChange={(e) => setReadTestUrl(e.target.value)}
                placeholder="输入完整 URL，例如 https://openai.com/index/sora-2/"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <select
                value={readTestMode}
                onChange={(e) => setReadTestMode(e.target.value as 'markdown' | 'text' | 'html')}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="markdown">markdown</option>
                <option value="text">text</option>
                <option value="html">html</option>
              </select>
              <button
                onClick={handleRunReadTest}
                disabled={readTesting}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {readTesting ? '读取中...' : '读取页面'}
              </button>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <button
                onClick={() => {
                  setReadTestUrl('https://openai.com/index/sora-2/')
                  setReadTestMode('markdown')
                }}
                className="rounded-full border border-border bg-background px-2.5 py-1 hover:text-foreground"
              >
                OpenAI 示例
              </button>
              <button
                onClick={() => {
                  setReadTestUrl('https://www.youtube.com/watch?v=gzneGhpXwjU')
                  setReadTestMode('markdown')
                }}
                className="rounded-full border border-border bg-background px-2.5 py-1 hover:text-foreground"
              >
                YouTube 示例
              </button>
              <button
                onClick={() => {
                  setReadTestUrl('https://mp.weixin.qq.com/')
                  setReadTestMode('text')
                }}
                className="rounded-full border border-border bg-background px-2.5 py-1 hover:text-foreground"
              >
                微信公众号示例
              </button>
            </div>

            {readTestError && (
              <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-700">
                读取失败：{readTestError}
              </div>
            )}

            {readTestResult && (
              <div className="space-y-3 rounded-md border border-border bg-background/80 p-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>fetchMethod: <span className="text-foreground">{readTestResult.fetchMethod || 'unknown'}</span></span>
                  <span>format: <span className="text-foreground">{readTestResult.format || readTestMode}</span></span>
                  <span>strategy: <span className="text-foreground">{readTestResult.strategy || 'unknown'}</span></span>
                </div>

                {readTestResult.observations && readTestResult.observations.length > 0 && (
                  <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800">
                    {readTestResult.observations.map((item) => item.message || item.kind).filter(Boolean).join('；')}
                  </div>
                )}

                {readTestResult.title && (
                  <div>
                    <p className="text-xs text-muted-foreground">标题</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{readTestResult.title}</p>
                  </div>
                )}

                {readTestResult.error && (
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
                    {readTestResult.error}
                  </div>
                )}

                <div>
                  <p className="text-xs text-muted-foreground">URL</p>
                  <a
                    href={readTestResult.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block break-all text-xs text-blue-600 hover:underline"
                  >
                    {readTestResult.url}
                  </a>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">内容预览</p>
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-xs leading-5 text-foreground">
                    <code>{(readTestResult.content || '').slice(0, 6000) || '当前没有返回内容。'}</code>
                  </pre>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-background/70 p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">导入站点经验</p>
              <p className="mt-1 text-xs text-muted-foreground">
                支持导入 web-access 中已有的 Markdown 经验文件。默认导入为 `candidate`，先评审再转为正式 `verified` 更安全。
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_160px_140px]">
              <input
                value={importFilename}
                onChange={(e) => setImportFilename(e.target.value)}
                placeholder="文件名，例如 xiaohongshu.com.md"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <select
                value={importScope}
                onChange={(e) => setImportScope(e.target.value as 'verified' | 'candidate')}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="verified">verified</option>
                <option value="candidate">candidate</option>
              </select>
              <label className="flex items-center justify-center rounded-md border border-dashed border-border bg-background px-3 py-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                选择文件
                <input type="file" accept=".md,text/markdown,text/plain" className="hidden" onChange={handlePatternFileSelected} />
              </label>
            </div>

            <textarea
              value={importContent}
              onChange={(e) => setImportContent(e.target.value)}
              placeholder="粘贴带 frontmatter 的站点经验 Markdown"
              rows={10}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
            />

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                内置经验用于开箱即用，用户导入经验保存在本地数据目录，可持续沉淀。
              </p>
              <button
                onClick={handleImportPattern}
                disabled={importing}
                className="px-3 py-1.5 bg-slate-900 text-white rounded text-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? '导入中...' : '导入经验'}
              </button>
            </div>

            {importMessage && (
              <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground">
                {importMessage}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-background/70 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">待评审候选经验</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  自动沉淀和手动导入的 `candidate` 会先出现在这里，确认无误后再提升为 `verified`。
                </p>
              </div>
              <span className="rounded-full border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
                {candidatePatterns.length} 条待处理
              </span>
            </div>

            {candidatePatterns.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-background px-3 py-3 text-xs text-muted-foreground">
                当前没有待评审的站点经验。
              </div>
            ) : (
              <div className="space-y-3">
                {candidatePatterns.map((candidate) => {
                  const approveKey = `${candidate.domain}:approve`
                  const rejectKey = `${candidate.domain}:reject`
                  const busy = reviewingKey === approveKey || reviewingKey === rejectKey

                  return (
                    <div key={candidate.domain} className="rounded-md border border-border bg-background/80 p-3 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{candidate.domain}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            策略：{candidate.access_strategy || 'unknown'}
                            {' · '}
                            证据：{candidate.evidence_count ?? 0}
                            {candidate.verified_at ? ` · 更新时间：${candidate.verified_at}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleReviewCandidate(candidate.domain, 'approve')}
                            disabled={busy}
                            className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {reviewingKey === approveKey ? '处理中...' : '批准'}
                          </button>
                          <button
                            onClick={() => handleReviewCandidate(candidate.domain, 'reject')}
                            disabled={busy}
                            className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {reviewingKey === rejectKey ? '处理中...' : '拒绝'}
                          </button>
                        </div>
                      </div>

                      {candidate.markdown && (
                        <details className="rounded-md border border-border bg-background/70 p-3">
                          <summary className="cursor-pointer text-xs font-medium text-foreground">
                            查看 Markdown
                          </summary>
                          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-xs leading-5">
                            <code>{candidate.markdown}</code>
                          </pre>
                        </details>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {reviewMessage && (
              <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground">
                {reviewMessage}
              </div>
            )}
          </div>

        </>
      )}
    </SettingsCard>
  )
}
