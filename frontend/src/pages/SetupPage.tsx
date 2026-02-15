/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         初始化向导页面                                    ║
 * ║                                                                          ║
 * ║  流程：环境检测 → API 配置（强校验）→ 设置名称                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useEffect, useMemo, useState } from 'react'
import { API_BASE } from '../config'
import { LaborAnyLogo } from '../components/ui/LaborAnyLogo'

interface SetupStatus {
  ready: boolean
  steps: {
    environment: boolean
    apiConfig: boolean
    profile: boolean
  }
  claudeCode: {
    installed: boolean
    path: string | null
    bundled?: boolean
  }
  dependencies: {
    git?: {
      installed: boolean
      path: string | null
      required: boolean
      installHint: string
    }
  }
  envPath: string
  profilePath: string
  configDir: string
  profile: { name: string } | null
  errors: string[]
}

interface ConfigPayload {
  ANTHROPIC_API_KEY: string
  ANTHROPIC_BASE_URL: string
  ANTHROPIC_MODEL: string
}

interface SetupPageProps {
  onReady: () => void
}

type WizardStep = 'loading' | 'environment' | 'api' | 'profile' | 'done'

export default function SetupPage({ onReady }: SetupPageProps) {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [step, setStep] = useState<WizardStep>('loading')
  const [error, setError] = useState<string | null>(null)
  const [validatingApi, setValidatingApi] = useState(false)
  const [saving, setSaving] = useState(false)
  const [validationMsg, setValidationMsg] = useState<string | null>(null)

  const [config, setConfig] = useState<ConfigPayload>({
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_BASE_URL: '',
    ANTHROPIC_MODEL: '',
  })
  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    void bootstrap()
  }, [])

  const stepTitle = useMemo(() => {
    if (step === 'loading') return '正在检查初始化状态...'
    if (step === 'environment') return '步骤 1/3：运行环境检测'
    if (step === 'api') return '步骤 2/3：配置模型 API'
    if (step === 'profile') return '步骤 3/3：设置你的名字'
    return '初始化完成'
  }, [step])

  async function bootstrap() {
    setError(null)
    setStep('loading')

    try {
      const [statusRes, configRes] = await Promise.all([
        fetch(`${API_BASE}/setup/status`),
        fetch(`${API_BASE}/config`),
      ])

      if (!statusRes.ok) {
        throw new Error('初始化状态检查失败')
      }

      const statusData = await statusRes.json() as SetupStatus
      setStatus(statusData)

      if (configRes.ok) {
        const configData = await configRes.json() as {
          config?: Record<string, { value: string }>
          profile?: { name?: string } | null
        }
        const envConfig = configData.config || {}
        setConfig({
          ANTHROPIC_API_KEY: envConfig.ANTHROPIC_API_KEY?.value || '',
          ANTHROPIC_BASE_URL: envConfig.ANTHROPIC_BASE_URL?.value || '',
          ANTHROPIC_MODEL: envConfig.ANTHROPIC_MODEL?.value || '',
        })
        setDisplayName(configData.profile?.name || statusData.profile?.name || '')
      } else {
        setDisplayName(statusData.profile?.name || '')
      }

      if (statusData.ready) {
        localStorage.setItem('token', 'local-session')
        if (statusData.profile?.name) {
          localStorage.setItem('laborany.profile.name', statusData.profile.name)
        }
        setStep('done')
        onReady()
        return
      }

      if (!statusData.steps.environment) {
        setStep('environment')
        return
      }
      if (!statusData.steps.apiConfig) {
        setStep('api')
        return
      }
      if (!statusData.steps.profile) {
        setStep('profile')
        return
      }

      setStep('api')
    } catch (err) {
      setError(err instanceof Error ? err.message : '初始化失败')
      setStep('environment')
    }
  }

  async function handleValidateApi() {
    setError(null)
    setValidationMsg(null)

    if (!config.ANTHROPIC_API_KEY.trim()) {
      setError('请先填写 ANTHROPIC_API_KEY')
      return
    }

    setValidatingApi(true)
    try {
      const res = await fetch(`${API_BASE}/setup/validate-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const payload = await res.json() as { success?: boolean; message?: string; diagnostic?: string }

      if (!res.ok || !payload.success) {
        const reason = payload.diagnostic ? `${payload.message || '验证失败'}：${payload.diagnostic}` : (payload.message || '验证失败')
        setError(reason)
        return
      }

      setValidationMsg(payload.message || 'API 验证通过')
      setStep('profile')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API 验证失败')
    } finally {
      setValidatingApi(false)
    }
  }

  async function handleCompleteSetup() {
    const name = displayName.trim()
    if (!name) {
      setError('请输入你的名字')
      return
    }
    if (!config.ANTHROPIC_API_KEY.trim()) {
      setError('请先配置 API Key')
      setStep('api')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/setup/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          profile: { name },
        }),
      })
      const payload = await res.json() as { success?: boolean; error?: string; diagnostic?: string }

      if (!res.ok || !payload.success) {
        const reason = payload.diagnostic ? `${payload.error || '初始化失败'}：${payload.diagnostic}` : (payload.error || '初始化失败')
        setError(reason)
        return
      }

      localStorage.setItem('token', 'local-session')
      localStorage.setItem('laborany.profile.name', name)
      setStep('done')
      onReady()
    } catch (err) {
      setError(err instanceof Error ? err.message : '初始化失败')
    } finally {
      setSaving(false)
    }
  }

function renderEnvironmentStep() {
    const gitStatus = status?.dependencies?.git

    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm text-foreground">Claude Code CLI 状态：</p>
          <p className={`text-sm mt-1 ${status?.claudeCode.installed ? 'text-green-600' : 'text-red-500'}`}>
            {status?.claudeCode.installed ? '已就绪' : '未检测到可用环境'}
          </p>
          {status?.claudeCode.path && (
            <p className="text-xs text-muted-foreground mt-2 break-all">路径：{status.claudeCode.path}</p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm text-foreground">Git 依赖状态：</p>
          <p className={`text-sm mt-1 ${gitStatus?.installed ? 'text-green-600' : 'text-red-500'}`}>
            {gitStatus?.installed ? '已就绪' : '未就绪'}
          </p>
          {gitStatus?.path && (
            <p className="text-xs text-muted-foreground mt-2 break-all">路径：{gitStatus.path}</p>
          )}
          {!gitStatus?.installed && gitStatus?.installHint && (
            <p className="text-xs text-yellow-700 mt-2 whitespace-pre-line">
              安装提示：{gitStatus.installHint}
            </p>
          )}
        </div>

        {!status?.steps.environment && (
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
            <p className="text-sm text-yellow-700">
              当前环境未就绪，请先按提示安装缺失依赖后再继续。
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={() => void bootstrap()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            重新检测
          </button>
          {status?.steps.environment && (
            <button
              onClick={() => setStep('api')}
              className="px-4 py-2 rounded-lg bg-foreground text-background hover:opacity-90"
            >
              下一步
            </button>
          )}
        </div>
      </div>
    )
  }

  function renderApiStep() {
    return (
      <div className="space-y-4">
        <InputRow
          label="ANTHROPIC_API_KEY"
          required
          value={config.ANTHROPIC_API_KEY}
          onChange={(value) => setConfig(prev => ({ ...prev, ANTHROPIC_API_KEY: value }))}
          placeholder="sk-ant-api03-..."
          sensitive
        />
        <InputRow
          label="ANTHROPIC_BASE_URL"
          value={config.ANTHROPIC_BASE_URL}
          onChange={(value) => setConfig(prev => ({ ...prev, ANTHROPIC_BASE_URL: value }))}
          placeholder="https://api.anthropic.com（可选）"
        />
        <InputRow
          label="ANTHROPIC_MODEL"
          value={config.ANTHROPIC_MODEL}
          onChange={(value) => setConfig(prev => ({ ...prev, ANTHROPIC_MODEL: value }))}
          placeholder="claude-sonnet-4-20250514（可选）"
        />

        {validationMsg && (
          <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-700">
            {validationMsg}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={() => setStep('environment')}
            className="px-4 py-2 rounded-lg bg-muted text-foreground hover:bg-muted/80"
          >
            上一步
          </button>
          <button
            disabled={validatingApi}
            onClick={() => void handleValidateApi()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {validatingApi ? '校验中...' : '校验并继续'}
          </button>
        </div>
      </div>
    )
  }

  function renderProfileStep() {
    return (
      <div className="space-y-4">
        <InputRow
          label="你的名字"
          required
          value={displayName}
          onChange={setDisplayName}
          placeholder="例如：老板 / Nathan / 小陈"
        />

        <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1">
          <p>.env 路径：{status?.envPath || '-'}</p>
          <p>Profile 路径：{status?.profilePath || '-'}</p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={() => setStep('api')}
            className="px-4 py-2 rounded-lg bg-muted text-foreground hover:bg-muted/80"
          >
            上一步
          </button>
          <button
            disabled={saving}
            onClick={() => void handleCompleteSetup()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? '保存中...' : '完成并进入'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-xl w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <LaborAnyLogo size={56} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">LaborAny</h1>
          <p className="text-muted-foreground">首次初始化向导</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <h2 className="text-base font-semibold text-foreground">{stepTitle}</h2>

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {step === 'loading' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              正在读取本地配置...
            </div>
          )}
          {step === 'environment' && renderEnvironmentStep()}
          {step === 'api' && renderApiStep()}
          {step === 'profile' && renderProfileStep()}
        </div>
      </div>
    </div>
  )
}

function InputRow(props: {
  label: string
  required?: boolean
  value: string
  onChange: (value: string) => void
  placeholder?: string
  sensitive?: boolean
}) {
  const { label, required, value, onChange, placeholder, sensitive } = props
  const [show, setShow] = useState(false)
  const type = sensitive && !show ? 'password' : 'text'

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 pr-10"
        />
        {sensitive && (
          <button
            type="button"
            onClick={() => setShow(prev => !prev)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
          >
            {show ? '隐藏' : '显示'}
          </button>
        )}
      </div>
    </div>
  )
}
