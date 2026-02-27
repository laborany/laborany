import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { API_BASE, AGENT_API_BASE } from '../config/api'
import { useModelProfile } from '../contexts/ModelProfileContext'
import type { ModelProfile } from '../contexts/ModelProfileContext'

interface ConfigItem {
  value: string
  masked: string
}

type ConfigGroupId = 'model' | 'feishu' | 'email' | 'system' | 'advanced'

interface ConfigTemplate {
  label?: string
  description: string
  required: boolean
  placeholder: string
  sensitive: boolean
  group?: ConfigGroupId
  order?: number
  dependsOnKey?: string
  dependsOnValue?: string
}

interface TemplateGroup {
  id: ConfigGroupId
  title: string
  description: string
}

interface ConfigResponse {
  appHome?: string
  config?: Record<string, ConfigItem>
  envPath?: string
  profilePath?: string
  logsDir?: string
  logsFallbackActive?: boolean
  logsFallbackReason?: string
  migrationReportPath?: string
  profile?: { name?: string }
}

interface SaveConfigResponse {
  success?: boolean
  message?: string
  error?: string
  profile?: { name?: string }
  applied?: boolean
  applyError?: string | null
}

interface ApplyRuntimeResponse {
  success?: boolean
  summary?: string
  error?: string
}

interface StorageHomeSwitchResponse {
  success?: boolean
  message?: string
  error?: string
  targetHome?: string
}

type BannerType = 'success' | 'error' | 'warning'

const BOOLEAN_KEYS = new Set([
  'FEISHU_ENABLED',
  'FEISHU_REQUIRE_ALLOWLIST',
  'NOTIFY_ON_SUCCESS',
  'NOTIFY_ON_ERROR',
])

const DEFAULT_GROUPS: TemplateGroup[] = [
  {
    id: 'model',
    title: '模型服务',
    description: '配置 API Key、Base URL 和模型名称。',
  },
  {
    id: 'feishu',
    title: '飞书 Bot',
    description: '开启飞书会话接入与文件回传能力。',
  },
  {
    id: 'email',
    title: '邮件通知',
    description: '任务执行完成后通过邮件通知。',
  },
  {
    id: 'system',
    title: '系统参数',
    description: '端口、密钥等系统级配置。',
  },
  {
    id: 'advanced',
    title: '高级配置',
    description: '自定义或不常用环境变量。',
  },
]

function normalizeBool(value: string | undefined): boolean {
  const raw = (value || '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

function hasAnyValue(values: Record<string, string>, keys: string[]): boolean {
  return keys.some(key => (values[key] || '').trim().length > 0)
}

function isNumeric(text: string): boolean {
  return /^\d+$/.test(text.trim())
}

function normalizeStoragePath(input: string): string {
  let normalized = input.trim()
  if (!normalized) return ''

  normalized = normalized.replace(/\\/g, '/')

  if (/^[a-z]:\/$/i.test(normalized)) {
    return `${normalized.charAt(0).toLowerCase()}:/`
  }

  normalized = normalized.replace(/\/+$/, '')
  if (/^[a-z]:$/i.test(normalized)) {
    return `${normalized.charAt(0).toLowerCase()}:/`
  }

  if (/^[a-z]:\//i.test(normalized)) {
    normalized = `${normalized.charAt(0).toLowerCase()}${normalized.slice(1)}`
  }

  return normalized
}

function isSameStoragePath(a: string, b: string): boolean {
  const left = normalizeStoragePath(a)
  const right = normalizeStoragePath(b)
  if (!left || !right) return false

  const leftIsWindows = /^[a-z]:/i.test(left)
  const rightIsWindows = /^[a-z]:/i.test(right)
  if (leftIsWindows || rightIsWindows) {
    return left.toLowerCase() === right.toLowerCase()
  }

  return left === right
}

function isAbsoluteStoragePath(input: string): boolean {
  const value = normalizeStoragePath(input)
  if (!value) return false
  if (value === '~') return true
  if (value.startsWith('~/') || value.startsWith('~\\')) return true
  if (/^[a-z]:[\\/]/i.test(value)) return true
  if (/^\\\\[^\\]+\\[^\\]+/.test(value)) return true
  return value.startsWith('/')
}

export default function SettingsPage() {
  const [config, setConfig] = useState<Record<string, ConfigItem>>({})
  const [template, setTemplate] = useState<Record<string, ConfigTemplate>>({})
  const [groups, setGroups] = useState<TemplateGroup[]>(DEFAULT_GROUPS)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [configPath, setConfigPath] = useState('')
  const [profilePath, setProfilePath] = useState('')
  const [logsPath, setLogsPath] = useState('')
  const [logsFallbackActive, setLogsFallbackActive] = useState(false)
  const [logsFallbackReason, setLogsFallbackReason] = useState('')
  const [migrationReportPath, setMigrationReportPath] = useState('')
  const [appHome, setAppHome] = useState('')
  const [storageHomeInput, setStorageHomeInput] = useState('')
  const [switchingStorageHome, setSwitchingStorageHome] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [showValues, setShowValues] = useState<Record<string, boolean>>({})
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exportingLogs, setExportingLogs] = useState(false)
  const [retryingApply, setRetryingApply] = useState(false)
  const [message, setMessage] = useState<{ type: BannerType; text: string } | null>(null)

  // Model profiles state
  const { profiles: ctxProfiles, refreshProfiles } = useModelProfile()
  const [editProfiles, setEditProfiles] = useState<ModelProfile[]>([])
  const [profilesLoaded, setProfilesLoaded] = useState(false)
  const [savingProfiles, setSavingProfiles] = useState(false)
  const [profilesMessage, setProfilesMessage] = useState<{ type: BannerType; text: string } | null>(null)
  const [showProfileKeys, setShowProfileKeys] = useState<Record<string, boolean>>({})
  const [testingProfileId, setTestingProfileId] = useState<string | null>(null)
  const [profileTestResults, setProfileTestResults] = useState<Record<string, { success: boolean; message: string }>>({})

  useEffect(() => {
    if (!profilesLoaded && ctxProfiles.length > 0) {
      setEditProfiles(ctxProfiles.map(p => ({ ...p })))
      setProfilesLoaded(true)
    }
  }, [ctxProfiles, profilesLoaded])

  const [testingEmail, setTestingEmail] = useState(false)
  const [emailTestResult, setEmailTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const [testingFeishu, setTestingFeishu] = useState(false)
  const [feishuTestResult, setFeishuTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    void loadConfig()
    void loadTemplate()
  }, [])

  async function loadConfig(): Promise<ConfigResponse | null> {
    try {
      const res = await fetch(`${API_BASE}/config`)
      const data = await res.json() as ConfigResponse
      setConfig(data.config || {})
      setConfigPath(data.envPath || '')
      setProfilePath(data.profilePath || '')
      setLogsPath(data.logsDir || '')
      setLogsFallbackActive(Boolean(data.logsFallbackActive))
      setLogsFallbackReason(data.logsFallbackReason || '')
      setMigrationReportPath(data.migrationReportPath || '')
      setAppHome(data.appHome || '')
      setStorageHomeInput(data.appHome || '')
      setProfileName(data.profile?.name || '')

      const values: Record<string, string> = {}
      for (const [key, item] of Object.entries(data.config || {})) {
        values[key] = item.value
      }
      setEditValues(values)
      return data
    } catch {
      setMessage({ type: 'error', text: '加载配置失败' })
      return null
    } finally {
      setLoading(false)
    }
  }

  async function loadTemplate() {
    try {
      const res = await fetch(`${API_BASE}/config/template`)
      const data = await res.json() as {
        template?: Record<string, ConfigTemplate>
        groups?: TemplateGroup[]
      }
      setTemplate(data.template || {})
      if (Array.isArray(data.groups) && data.groups.length > 0) {
        setGroups(data.groups)
      }
    } catch {
      // ignore template failures
    }
  }

  function validateBeforeSave(): string[] {
    const errors: string[] = []

    // ANTHROPIC_API_KEY is now managed via model profiles; only warn if both profiles and env are missing
    // Skip hard validation here — model profiles page handles this

    const feishuEnabled = normalizeBool(editValues.FEISHU_ENABLED)
    if (feishuEnabled) {
      if (!(editValues.FEISHU_APP_ID || '').trim()) errors.push('飞书已启用，但缺少 FEISHU_APP_ID')
      if (!(editValues.FEISHU_APP_SECRET || '').trim()) errors.push('飞书已启用，但缺少 FEISHU_APP_SECRET')
      if (normalizeBool(editValues.FEISHU_REQUIRE_ALLOWLIST) && !(editValues.FEISHU_ALLOW_USERS || '').trim()) {
        errors.push('飞书开启强制白名单时，FEISHU_ALLOW_USERS 不能为空')
      }
    }

    const emailKeys = ['NOTIFICATION_EMAIL', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS']
    const emailTouched = hasAnyValue(editValues, emailKeys)
    if (emailTouched) {
      if (!(editValues.NOTIFICATION_EMAIL || '').trim()) errors.push('邮件通知缺少 NOTIFICATION_EMAIL')
      if (!(editValues.SMTP_HOST || '').trim()) errors.push('邮件通知缺少 SMTP_HOST')
      if (!(editValues.SMTP_PORT || '').trim()) errors.push('邮件通知缺少 SMTP_PORT')
      if (!(editValues.SMTP_USER || '').trim()) errors.push('邮件通知缺少 SMTP_USER')
      if (!(editValues.SMTP_PASS || '').trim()) errors.push('邮件通知缺少 SMTP_PASS')
      if ((editValues.SMTP_PORT || '').trim() && !isNumeric(editValues.SMTP_PORT || '')) {
        errors.push('SMTP_PORT 必须为数字')
      }
    }

    return errors
  }

  async function saveConfig() {
    const validationErrors = validateBeforeSave()
    if (validationErrors.length > 0) {
      setMessage({
        type: 'error',
        text: `请先修正以下问题：${validationErrors.join('；')}`,
      })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: editValues,
          profileName: profileName.trim(),
        }),
      })
      const data = await res.json() as SaveConfigResponse

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '保存失败' })
        return
      }

      if (data.applied === false) {
        setMessage({
          type: 'warning',
          text: data.message || `配置已保存，但自动应用失败：${data.applyError || ''}`,
        })
      } else {
        setMessage({ type: 'success', text: data.message || '配置已保存并生效' })
      }

      if (data.profile?.name) {
        localStorage.setItem('laborany.profile.name', data.profile.name)
      } else if (profileName.trim()) {
        localStorage.setItem('laborany.profile.name', profileName.trim())
      }
      void loadConfig()
    } catch {
      setMessage({ type: 'error', text: '保存配置失败' })
    } finally {
      setSaving(false)
    }
  }

  async function retryApplyConfig() {
    setRetryingApply(true)
    setMessage(null)

    try {
      const res = await fetch(`${AGENT_API_BASE}/runtime/apply-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'manual-retry',
          force: true,
        }),
      })
      const data = await res.json() as ApplyRuntimeResponse

      if (res.ok && data.success) {
        setMessage({ type: 'success', text: data.summary || '配置重新应用成功' })
      } else {
        setMessage({
          type: 'warning',
          text: data.error || data.summary || '配置已保存，但重新应用仍失败',
        })
      }
    } catch {
      setMessage({ type: 'error', text: '无法重新应用配置，请检查 Agent Service 是否运行' })
    } finally {
      setRetryingApply(false)
    }
  }

  async function exportLogs() {
    setExportingLogs(true)
    setMessage(null)

    try {
      const response = await fetch(`${API_BASE}/logs/export`)
      if (!response.ok) throw new Error('export failed')

      const blob = await response.blob()
      const contentDisposition = response.headers.get('content-disposition') || ''
      const matchedFileName = contentDisposition.match(/filename="([^"]+)"/)
      const filename = matchedFileName?.[1] || `laborany-logs-${Date.now()}.zip`

      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)

      setMessage({ type: 'success', text: '诊断日志已导出' })
    } catch {
      setMessage({ type: 'error', text: '日志导出失败' })
    } finally {
      setExportingLogs(false)
    }
  }

  async function waitForApiRecovery(maxWaitMs = 60000, intervalMs = 1500): Promise<boolean> {
    const started = Date.now()
    while (Date.now() - started < maxWaitMs) {
      try {
        const res = await fetch(`${API_BASE}/config`, { cache: 'no-store' })
        if (res.ok) return true
      } catch {
        // keep polling until timeout
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
    return false
  }

  async function switchStorageHome() {
    const requestedHome = storageHomeInput.trim()
    if (!requestedHome) {
      setMessage({ type: 'error', text: '请先填写新的存储路径' })
      return
    }

    if (!isAbsoluteStoragePath(requestedHome)) {
      setMessage({ type: 'error', text: '存储路径必须是绝对路径（例如 D:\\LaborAnyData 或 /Users/you/LaborAnyData，支持 ~/LaborAnyData）' })
      return
    }

    if (appHome && isSameStoragePath(requestedHome, appHome)) {
      setMessage({ type: 'warning', text: '新路径与当前路径相同，无需切换' })
      return
    }

    setSwitchingStorageHome(true)
    setMessage({ type: 'warning', text: '正在提交存储路径切换，服务将自动重启并重连...' })

    try {
      let requestFailed = false
      let res: Response | null = null
      let expectedHome = requestedHome
      try {
        res = await fetch(`${API_BASE}/config/storage/home`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ homePath: requestedHome }),
        })
      } catch {
        requestFailed = true
      }

      if (!requestFailed && res) {
        let data: StorageHomeSwitchResponse = {}
        try {
          data = await res.json() as StorageHomeSwitchResponse
        } catch {
          data = {}
        }

        if (!res.ok) {
          setMessage({ type: 'error', text: data.error || '存储路径切换请求失败' })
          return
        }

        if (typeof data.targetHome === 'string' && data.targetHome.trim()) {
          expectedHome = data.targetHome.trim()
        }
      }

      const recovered = await waitForApiRecovery(70000, 1500)
      if (!recovered) {
        setMessage({
          type: 'warning',
          text: '服务正在重启，但暂未自动恢复连接。请稍后停留在设置页重试刷新。',
        })
        return
      }

      const latest = await loadConfig()
      if (!latest?.appHome || !isSameStoragePath(latest.appHome, expectedHome)) {
        setMessage({
          type: 'warning',
          text: '服务已恢复，但检测到存储路径未完成切换，请重试一次或查看日志。',
        })
        return
      }

      setMessage({ type: 'success', text: '存储路径已切换并自动恢复连接' })
    } finally {
      setSwitchingStorageHome(false)
    }
  }

  async function saveModelProfiles() {
    if (editProfiles.length === 0) {
      setProfilesMessage({ type: 'error', text: '至少需要一个模型配置' })
      return
    }
    const normalizedNames = new Set<string>()
    for (let i = 0; i < editProfiles.length; i++) {
      const profile = editProfiles[i]
      const name = profile.name.trim()
      if (!name) {
        setProfilesMessage({ type: 'error', text: `配置 #${i + 1} 的名称不能为空` })
        return
      }
      const normalized = name.toLowerCase()
      if (normalizedNames.has(normalized)) {
        setProfilesMessage({ type: 'error', text: `模型配置名称重复：${name}` })
        return
      }
      normalizedNames.add(normalized)
    }

    const firstApiKey = editProfiles[0].apiKey.trim()
    if (!firstApiKey) {
      setProfilesMessage({ type: 'error', text: '默认配置（第一项）必须填写 API Key' })
      return
    }

    setSavingProfiles(true)
    setProfilesMessage(null)
    try {
      const res = await fetch(`${API_BASE}/config/model-profiles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profiles: editProfiles }),
      })
      const data = await res.json() as { success?: boolean; error?: string; profiles?: ModelProfile[] }
      if (!res.ok) {
        setProfilesMessage({ type: 'error', text: data.error || '保存失败' })
        return
      }
      setProfilesMessage({ type: 'success', text: '模型配置已保存' })
      await refreshProfiles()
      if (data.profiles) {
        setEditProfiles(data.profiles.map(p => ({ ...p })))
      }
      await loadConfig()
    } catch {
      setProfilesMessage({ type: 'error', text: '保存失败，请检查网络' })
    } finally {
      setSavingProfiles(false)
    }
  }

  async function testProfileConnection(profile: ModelProfile) {
    setTestingProfileId(profile.id)
    setProfileTestResults(prev => ({ ...prev, [profile.id]: { success: false, message: '测试中...' } }))
    try {
      const res = await fetch(`${API_BASE}/config/model-profiles/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: profile.apiKey,
          baseUrl: profile.baseUrl,
          model: profile.model,
          profileId: profile.id,
        }),
      })
      const data = await res.json() as { success?: boolean; message?: string }
      setProfileTestResults(prev => ({
        ...prev,
        [profile.id]: { success: Boolean(data.success), message: data.message || (data.success ? '连接成功' : '连接失败') },
      }))
    } catch {
      setProfileTestResults(prev => ({ ...prev, [profile.id]: { success: false, message: '请求失败' } }))
    } finally {
      setTestingProfileId(null)
    }
  }

  function addProfile() {
    const newProfile: ModelProfile = {
      id: crypto.randomUUID(),
      name: `配置 ${editProfiles.length + 1}`,
      apiKey: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setEditProfiles(prev => [...prev, newProfile])
  }

  function removeProfile(id: string) {
    if (editProfiles.length <= 1) return
    setEditProfiles(prev => prev.filter(p => p.id !== id))
  }

  function moveProfile(id: string, dir: -1 | 1) {
    setEditProfiles(prev => {
      const idx = prev.findIndex(p => p.id === id)
      if (idx < 0) return prev
      const next = idx + dir
      if (next < 0 || next >= prev.length) return prev
      const arr = [...prev]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return arr
    })
  }

  function updateProfile(id: string, field: keyof ModelProfile, value: string) {
    setEditProfiles(prev => prev.map(p => p.id === id ? { ...p, [field]: value, updatedAt: new Date().toISOString() } : p))
  }

  async function testEmailConfig() {
    setTestingEmail(true)
    setEmailTestResult(null)
    try {
      const res = await fetch(`${AGENT_API_BASE}/notifications/test-email`, { method: 'POST' })
      const data = await res.json() as { success?: boolean; error?: string; message?: string }
      if (data.success) {
        setEmailTestResult({ success: true, message: data.message || '测试邮件已发送，请检查收件箱' })
      } else {
        setEmailTestResult({ success: false, message: data.error || '测试失败' })
      }
    } catch {
      setEmailTestResult({ success: false, message: '无法连接 Agent Service' })
    } finally {
      setTestingEmail(false)
    }
  }

  async function testFeishuConfig() {
    setTestingFeishu(true)
    setFeishuTestResult(null)
    try {
      const res = await fetch(`${AGENT_API_BASE}/feishu/test`, { method: 'POST' })
      const data = await res.json() as { success?: boolean; error?: string; message?: string }
      if (data.success) {
        setFeishuTestResult({ success: true, message: data.message || '飞书连接成功' })
      } else {
        setFeishuTestResult({ success: false, message: data.error || '连接失败' })
      }
    } catch {
      setFeishuTestResult({ success: false, message: '无法连接 Agent Service' })
    } finally {
      setTestingFeishu(false)
    }
  }

  function handleChange(key: string, value: string) {
    setEditValues(prev => ({ ...prev, [key]: value }))
  }

  function toggleShowValue(key: string) {
    setShowValues(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const allKeys = useMemo(() => {
    return new Set([...Object.keys(template), ...Object.keys(config), ...Object.keys(editValues)])
  }, [template, config, editValues])

  const groupedKeys = useMemo(() => {
    const buckets: Record<ConfigGroupId, string[]> = {
      model: [],
      feishu: [],
      email: [],
      system: [],
      advanced: [],
    }

    for (const key of allKeys) {
      const group = template[key]?.group || 'advanced'
      buckets[group].push(key)
    }

    for (const group of Object.keys(buckets) as ConfigGroupId[]) {
      buckets[group].sort((a, b) => {
        const oa = template[a]?.order ?? 9999
        const ob = template[b]?.order ?? 9999
        if (oa !== ob) return oa - ob
        return a.localeCompare(b)
      })
    }

    return buckets
  }, [allKeys, template])

  const knownKeys = useMemo(() => {
    const set = new Set<string>()
    for (const group of ['model', 'feishu', 'email', 'system'] as ConfigGroupId[]) {
      for (const key of groupedKeys[group]) set.add(key)
    }
    return set
  }, [groupedKeys])

  const advancedKeys = useMemo(() => {
    const keys = new Set<string>(groupedKeys.advanced)
    for (const key of allKeys) {
      if (!knownKeys.has(key)) keys.add(key)
    }
    return Array.from(keys).sort((a, b) => {
      const oa = template[a]?.order ?? 9999
      const ob = template[b]?.order ?? 9999
      if (oa !== ob) return oa - ob
      return a.localeCompare(b)
    })
  }, [groupedKeys.advanced, allKeys, knownKeys, template])

  const storagePathUnchanged = isSameStoragePath(storageHomeInput, appHome)

  function isFieldVisible(key: string): boolean {
    const meta = template[key]
    if (!meta?.dependsOnKey) return true

    const expected = (meta.dependsOnValue || 'true').trim().toLowerCase()
    const actualRaw = (editValues[meta.dependsOnKey] || '').trim()

    if (expected === 'true' || expected === 'false') {
      return normalizeBool(actualRaw) === (expected === 'true')
    }

    return actualRaw.toLowerCase() === expected
  }

  function renderFields(keys: string[]) {
    const visible = keys.filter(isFieldVisible)
    if (visible.length === 0) {
      return <p className="text-sm text-muted-foreground">暂无可配置项</p>
    }

    return (
      <div className="space-y-4">
        {visible.map(key => {
          const tmpl = template[key]
          const meta = tmpl || {
            label: key,
            description: '',
            required: false,
            placeholder: '',
            sensitive: false,
          }
          const isSensitive = Boolean(
            meta.sensitive || key.toLowerCase().includes('key') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('pass'),
          )
          const value = editValues[key] || ''
          const isBoolean = BOOLEAN_KEYS.has(key)

          return (
            <FieldRow
              key={key}
              name={key}
              label={meta.label || key}
              description={meta.description || ''}
              required={Boolean(meta.required)}
              placeholder={meta.placeholder || ''}
              sensitive={isSensitive}
              isBoolean={isBoolean}
              value={value}
              showValue={Boolean(showValues[key])}
              onToggleShow={() => toggleShowValue(key)}
              onChange={(nextValue) => handleChange(key, nextValue)}
            />
          )
        })}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b border-border bg-card flex items-center px-6">
        <h1 className="text-lg font-semibold text-foreground">设置中心</h1>
      </header>

      <div className="mx-auto max-w-5xl p-6 space-y-6">
        {message && (
          <div className={`rounded-lg border p-4 ${
            message.type === 'success'
              ? 'bg-green-500/10 text-green-700 border-green-500/20'
              : message.type === 'warning'
                ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                : 'bg-red-500/10 text-red-700 border-red-500/20'
          }`}>
            <div className="space-y-2">
              <p>{message.text}</p>
              {message.type === 'warning' && (
                <button
                  onClick={retryApplyConfig}
                  disabled={retryingApply}
                  className="px-3 py-1.5 bg-background border border-border rounded text-xs hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {retryingApply ? '重试中...' : '重试应用配置'}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="space-y-6">
          <SettingsCard title="个人信息" description="用于本地模式显示昵称，不需要邮箱注册。">
            <label className="block text-sm font-medium text-foreground mb-1">本地名称</label>
            <input
              type="text"
              value={profileName}
              onChange={event => setProfileName(event.target.value)}
              placeholder="例如: Nathan"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </SettingsCard>

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
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    >
                      <path d="M21 12a9 9 0 1 1-6.2-8.56" />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                      aria-hidden="true"
                    >
                      <path d="M3 7h13" />
                      <path d="m13 3 4 4-4 4" />
                      <path d="M21 17H8" />
                      <path d="m11 13-4 4 4 4" />
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
        </div>

        <SettingsCard
          title={groups.find(g => g.id === 'model')?.title || '模型服务'}
          description="管理多个模型配置，支持不同 API Key、Base URL 和模型名称。profiles[0] 为默认配置。"
          action={
            <button
              onClick={addProfile}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90"
            >
              + 新增配置
            </button>
          }
        >
          {profilesMessage && (
            <div className={`rounded-lg border p-3 text-sm ${
              profilesMessage.type === 'success'
                ? 'bg-green-500/10 text-green-700 border-green-500/20'
                : profilesMessage.type === 'warning'
                  ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                  : 'bg-red-500/10 text-red-700 border-red-500/20'
            }`}>
              {profilesMessage.text}
            </div>
          )}

          <div className="space-y-4">
            {editProfiles.map((profile, idx) => (
              <div key={profile.id} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{profile.name || `配置 ${idx + 1}`}</span>
                    {idx === 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">默认</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveProfile(profile.id, -1)}
                      disabled={idx === 0}
                      className="p-1 rounded hover:bg-accent text-muted-foreground disabled:opacity-30"
                      title="上移（提升优先级）"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveProfile(profile.id, 1)}
                      disabled={idx === editProfiles.length - 1}
                      className="p-1 rounded hover:bg-accent text-muted-foreground disabled:opacity-30"
                      title="下移"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => testProfileConnection(profile)}
                      disabled={testingProfileId === profile.id}
                      className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {testingProfileId === profile.id ? '测试中...' : '测试'}
                    </button>
                    <button
                      onClick={() => removeProfile(profile.id)}
                      disabled={editProfiles.length <= 1}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-30"
                      title="删除（至少保留一个）"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">名称 *</label>
                    <input
                      type="text"
                      value={profile.name}
                      onChange={e => updateProfile(profile.id, 'name', e.target.value)}
                      placeholder="例如: Default"
                      className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">模型名称</label>
                    <input
                      type="text"
                      value={profile.model || ''}
                      onChange={e => updateProfile(profile.id, 'model', e.target.value)}
                      placeholder="claude-sonnet-4-20250514"
                      className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    API Key {idx === 0 && <span className="text-red-500">*</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showProfileKeys[profile.id] ? 'text' : 'password'}
                      value={profile.apiKey}
                      onChange={e => updateProfile(profile.id, 'apiKey', e.target.value)}
                      placeholder="sk-ant-api03-..."
                      className="w-full rounded border border-border bg-background px-2 py-1.5 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowProfileKeys(prev => ({ ...prev, [profile.id]: !prev[profile.id] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {showProfileKeys[profile.id] ? '隐藏' : '显示'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Base URL（可选）</label>
                  <input
                    type="text"
                    value={profile.baseUrl || ''}
                    onChange={e => updateProfile(profile.id, 'baseUrl', e.target.value)}
                    placeholder="https://api.anthropic.com"
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                {profileTestResults[profile.id] && (
                  <p className={`text-xs ${profileTestResults[profile.id].success ? 'text-green-700' : 'text-red-700'}`}>
                    {profileTestResults[profile.id].message}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={saveModelProfiles}
              disabled={savingProfiles}
              className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {savingProfiles ? '保存中...' : '保存模型配置'}
            </button>
          </div>
        </SettingsCard>

        <SettingsCard
          title={groups.find(g => g.id === 'feishu')?.title || '飞书 Bot'}
          description={groups.find(g => g.id === 'feishu')?.description || '飞书会话配置'}
          action={
            <button
              onClick={testFeishuConfig}
              disabled={testingFeishu}
              className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testingFeishu ? '连接中...' : '测试飞书连接'}
            </button>
          }
        >
          {renderFields(groupedKeys.feishu)}
          <GuideBlock title="飞书配置提示（可折叠）" tone="purple">
            <p>基础配置：`FEISHU_ENABLED=true`、`FEISHU_APP_ID`、`FEISHU_APP_SECRET`。</p>
            <p>Bot 名称建议使用中英文和数字，避免 emoji（部分飞书客户端可能显示为 `?`）。</p>
            <p>事件订阅：启用 WebSocket 长连接，并添加 `im.message.receive_v1`。</p>
            <p>最小权限：`im:message:send_as_bot`、`im:message:readonly`、`im:message.p2p_msg:readonly`、`im:message.group_at_msg:readonly`、`im:resource`。</p>
            <p>文件回传：`im:resource` 用于下载用户附件；机器人回传文件还需要 IM 文件上传能力（控制台常见名为 `im:file` 或等价项）。</p>
          </GuideBlock>
          {feishuTestResult && (
            <p className={`mt-3 text-xs ${feishuTestResult.success ? 'text-green-700' : 'text-red-700'}`}>
              {feishuTestResult.message}
            </p>
          )}
        </SettingsCard>

        <SettingsCard
          title={groups.find(g => g.id === 'email')?.title || '邮件通知'}
          description={groups.find(g => g.id === 'email')?.description || 'SMTP 邮件配置'}
          action={
            <button
              onClick={testEmailConfig}
              disabled={testingEmail}
              className="px-3 py-1.5 bg-sky-600 text-white rounded text-sm hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testingEmail ? '发送中...' : '发送测试邮件'}
            </button>
          }
        >
          {renderFields(groupedKeys.email)}
          <GuideBlock title="邮件配置提示（可折叠）" tone="blue">
            <p>常见邮箱服务需要先开启 SMTP，并使用授权码（而不是登录密码）。</p>
            <p>常见端口：465（SSL）或 587（TLS）。</p>
            <p>建议先配置 `NOTIFICATION_EMAIL` 与完整 SMTP 参数，再发送测试邮件。</p>
          </GuideBlock>
          {emailTestResult && (
            <p className={`mt-3 text-xs ${emailTestResult.success ? 'text-green-700' : 'text-red-700'}`}>
              {emailTestResult.message}
            </p>
          )}
        </SettingsCard>

        <SettingsCard
          title={groups.find(g => g.id === 'system')?.title || '系统参数'}
          description={groups.find(g => g.id === 'system')?.description || '系统级配置'}
        >
          {renderFields(groupedKeys.system)}
        </SettingsCard>

        <SettingsCard
          title={groups.find(g => g.id === 'advanced')?.title || '高级配置'}
          description={groups.find(g => g.id === 'advanced')?.description || '自定义环境变量'}
          action={
            <button
              onClick={() => setShowAdvanced(prev => !prev)}
              className="px-3 py-1.5 bg-background border border-border rounded text-sm hover:bg-muted"
            >
              {showAdvanced ? '收起' : '展开'}
            </button>
          }
        >
          {showAdvanced ? (
            <div className="space-y-4">
              {renderFields(advancedKeys)}
              <div className="pt-2 border-t border-border">
                <AddConfigItem
                  onAdd={key => setEditValues(prev => ({ ...prev, [key]: '' }))}
                  existingKeys={allKeys}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              高级配置默认折叠，避免干扰常用设置。展开后可编辑所有未分组变量并新增自定义项。
            </p>
          )}
        </SettingsCard>

        <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-lg border border-border bg-card/95 p-4 backdrop-blur">
          <span className="text-xs text-muted-foreground">带 * 的字段为必填项，保存后会自动尝试应用。</span>
          <button
            onClick={saveConfig}
            disabled={saving}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            保存配置
          </button>
        </div>
      </div>
    </div>
  )
}

function SettingsCard({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}

function PathRow({ label, path }: { label: string; path: string }) {
  return (
    <p>
      {label}: <code className="rounded bg-background px-2 py-0.5 text-xs">{path}</code>
    </p>
  )
}

function GuideBlock({
  title,
  tone,
  children,
}: {
  title: string
  tone: 'purple' | 'blue'
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const style = tone === 'purple'
    ? 'border-purple-200/70 bg-purple-50/50 text-purple-900'
    : 'border-blue-200/70 bg-blue-50/50 text-blue-900'

  return (
    <div className={`rounded border ${style}`}>
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full px-3 py-2 text-left text-sm font-medium"
      >
        {title} {expanded ? '▲' : '▼'}
      </button>
      {expanded && (
        <div className="space-y-2 px-3 pb-3 text-xs text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  )
}

function FieldRow({
  name,
  label,
  description,
  required,
  placeholder,
  sensitive,
  isBoolean,
  value,
  showValue,
  onToggleShow,
  onChange,
}: {
  name: string
  label: string
  description: string
  required: boolean
  placeholder: string
  sensitive: boolean
  isBoolean: boolean
  value: string
  showValue: boolean
  onToggleShow: () => void
  onChange: (nextValue: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-foreground">
        {label} <code className="text-xs text-muted-foreground">{name}</code>
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}

      {isBoolean ? (
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">未设置</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <div className="relative">
          <input
            type={sensitive && !showValue ? 'password' : 'text'}
            value={value}
            onChange={event => onChange(event.target.value)}
            placeholder={placeholder}
            className="w-full rounded-md border border-border bg-background px-3 py-2 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {sensitive && (
            <button
              type="button"
              onClick={onToggleShow}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              {showValue ? '隐藏' : '显示'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function AddConfigItem({
  onAdd,
  existingKeys,
}: {
  onAdd: (key: string) => void
  existingKeys: Set<string>
}) {
  const [isAdding, setIsAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [error, setError] = useState('')

  function handleAdd() {
    const key = newKey.trim().toUpperCase()
    if (!key) {
      setError('请输入配置名')
      return
    }
    if (existingKeys.has(key)) {
      setError('配置项已存在')
      return
    }
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      setError('配置名只能包含大写字母、数字和下划线')
      return
    }
    onAdd(key)
    setNewKey('')
    setIsAdding(false)
    setError('')
  }

  if (!isAdding) {
    return (
      <button
        onClick={() => setIsAdding(true)}
        className="text-sm text-primary hover:text-primary/80"
      >
        + 添加自定义配置
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={newKey}
          onChange={event => {
            setNewKey(event.target.value.toUpperCase())
            setError('')
          }}
          placeholder="MY_CONFIG"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          autoFocus
        />
        <button
          onClick={handleAdd}
          className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
        >
          添加
        </button>
        <button
          onClick={() => {
            setIsAdding(false)
            setNewKey('')
            setError('')
          }}
          className="px-3 py-2 bg-muted text-muted-foreground rounded-md text-sm hover:bg-muted/80"
        >
          取消
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
