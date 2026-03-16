import { useEffect, useMemo, useState } from 'react'
import { API_BASE, AGENT_API_BASE } from '../../../config/api'
import { useModelProfile } from '../../../contexts/ModelProfileContext'
import type { ModelProfile } from '../../../contexts/ModelProfileContext'
import type {
  ConfigItem,
  ConfigTemplate,
  ConfigGroupId,
  TemplateGroup,
  ConfigResponse,
  SaveConfigResponse,
  ApplyRuntimeResponse,
  StorageHomeSwitchResponse,
  BannerType,
} from '../types'
import { DEFAULT_GROUPS } from '../types'

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
  if (/^[a-z]:\/$/i.test(normalized)) return `${normalized.charAt(0).toLowerCase()}:/`
  normalized = normalized.replace(/\/+$/, '')
  if (/^[a-z]:$/i.test(normalized)) return `${normalized.charAt(0).toLowerCase()}:/`
  if (/^[a-z]:\//i.test(normalized)) normalized = `${normalized.charAt(0).toLowerCase()}${normalized.slice(1)}`
  return normalized
}

export function isSameStoragePath(a: string, b: string): boolean {
  const left = normalizeStoragePath(a)
  const right = normalizeStoragePath(b)
  if (!left || !right) return false
  const leftIsWindows = /^[a-z]:/i.test(left)
  const rightIsWindows = /^[a-z]:/i.test(right)
  if (leftIsWindows || rightIsWindows) return left.toLowerCase() === right.toLowerCase()
  return left === right
}

export function isAbsoluteStoragePath(input: string): boolean {
  const value = normalizeStoragePath(input)
  if (!value) return false
  if (value === '~') return true
  if (value.startsWith('~/') || value.startsWith('~\\')) return true
  if (/^[a-z]:[\\/]/i.test(value)) return true
  if (/^\\\\[^\\]+\\[^\\]+/.test(value)) return true
  return value.startsWith('/')
}

export function useSettingsConfig() {
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
  const [testingQQ, setTestingQQ] = useState(false)
  const [qqTestResult, setQQTestResult] = useState<{ success: boolean; message: string } | null>(null)

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
      const data = await res.json() as { template?: Record<string, ConfigTemplate>; groups?: TemplateGroup[] }
      setTemplate(data.template || {})
      if (Array.isArray(data.groups) && data.groups.length > 0) setGroups(data.groups)
    } catch { /* ignore */ }
  }

  function validateBeforeSave(): string[] {
    const errors: string[] = []
    const feishuEnabled = normalizeBool(editValues.FEISHU_ENABLED)
    if (feishuEnabled) {
      if (!(editValues.FEISHU_APP_ID || '').trim()) errors.push('飞书已启用，但缺少 FEISHU_APP_ID')
      if (!(editValues.FEISHU_APP_SECRET || '').trim()) errors.push('飞书已启用，但缺少 FEISHU_APP_SECRET')
      if (normalizeBool(editValues.FEISHU_REQUIRE_ALLOWLIST) && !(editValues.FEISHU_ALLOW_USERS || '').trim()) {
        errors.push('飞书开启强制白名单时，FEISHU_ALLOW_USERS 不能为空')
      }
    }
    const qqEnabled = normalizeBool(editValues.QQ_ENABLED)
    if (qqEnabled) {
      if (!(editValues.QQ_APP_ID || '').trim()) errors.push('QQ Bot 已启用，但缺少 QQ_APP_ID')
      if (!(editValues.QQ_APP_SECRET || '').trim()) {
        errors.push('QQ Bot 已启用，但缺少 QQ_APP_SECRET（QQ 官方已弃用 Bot Token，请使用 App Secret 获取访问令牌）')
      }
      if (normalizeBool(editValues.QQ_REQUIRE_ALLOWLIST) && !(editValues.QQ_ALLOW_USERS || '').trim()) {
        errors.push('QQ Bot 开启强制白名单时，QQ_ALLOW_USERS 不能为空')
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
      setMessage({ type: 'error', text: `请先修正以下问题：${validationErrors.join('；')}` })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: editValues, profileName: profileName.trim() }),
      })
      const data = await res.json() as SaveConfigResponse
      if (!res.ok) { setMessage({ type: 'error', text: data.error || '保存失败' }); return }
      if (data.applied === false) {
        setMessage({ type: 'warning', text: data.message || `配置已保存，但自动应用失败：${data.applyError || ''}` })
      } else {
        setMessage({ type: 'success', text: data.message || '配置已保存并生效' })
      }
      if (data.profile?.name) localStorage.setItem('laborany.profile.name', data.profile.name)
      else if (profileName.trim()) localStorage.setItem('laborany.profile.name', profileName.trim())
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
        body: JSON.stringify({ source: 'manual-retry', force: true }),
      })
      const data = await res.json() as ApplyRuntimeResponse
      if (res.ok && data.success) {
        setMessage({ type: 'success', text: data.summary || '配置重新应用成功' })
      } else {
        setMessage({ type: 'warning', text: data.error || data.summary || '配置已保存，但重新应用仍失败' })
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
      } catch { /* keep polling */ }
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
    return false
  }

  async function switchStorageHome() {
    const requestedHome = storageHomeInput.trim()
    if (!requestedHome) { setMessage({ type: 'error', text: '请先填写新的存储路径' }); return }
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
      } catch { requestFailed = true }
      if (!requestFailed && res) {
        let data: StorageHomeSwitchResponse = {}
        try { data = await res.json() as StorageHomeSwitchResponse } catch { data = {} }
        if (!res.ok) { setMessage({ type: 'error', text: data.error || '存储路径切换请求失败' }); return }
        if (typeof data.targetHome === 'string' && data.targetHome.trim()) expectedHome = data.targetHome.trim()
      }
      const recovered = await waitForApiRecovery(70000, 1500)
      if (!recovered) {
        setMessage({ type: 'warning', text: '服务正在重启，但暂未自动恢复连接。请稍后停留在设置页重试刷新。' })
        return
      }
      const latest = await loadConfig()
      if (!latest?.appHome || !isSameStoragePath(latest.appHome, expectedHome)) {
        setMessage({ type: 'warning', text: '服务已恢复，但检测到存储路径未完成切换，请重试一次或查看日志。' })
        return
      }
      setMessage({ type: 'success', text: '存储路径已切换并自动恢复连接' })
    } finally {
      setSwitchingStorageHome(false)
    }
  }

  async function saveModelProfiles() {
    if (editProfiles.length === 0) { setProfilesMessage({ type: 'error', text: '至少需要一个模型配置' }); return }
    const normalizedNames = new Set<string>()
    for (let i = 0; i < editProfiles.length; i++) {
      const profile = editProfiles[i]
      const name = profile.name.trim()
      if (!name) { setProfilesMessage({ type: 'error', text: `配置 #${i + 1} 的名称不能为空` }); return }
      const normalized = name.toLowerCase()
      if (normalizedNames.has(normalized)) { setProfilesMessage({ type: 'error', text: `模型配置名称重复：${name}` }); return }
      normalizedNames.add(normalized)
    }
    const firstApiKey = editProfiles[0].apiKey.trim()
    if (!firstApiKey) { setProfilesMessage({ type: 'error', text: '默认配置（第一项）必须填写 API Key' }); return }
    setSavingProfiles(true)
    setProfilesMessage(null)
    try {
      const res = await fetch(`${API_BASE}/config/model-profiles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profiles: editProfiles }),
      })
      const data = await res.json() as { success?: boolean; error?: string; profiles?: ModelProfile[] }
      if (!res.ok) { setProfilesMessage({ type: 'error', text: data.error || '保存失败' }); return }
      setProfilesMessage({ type: 'success', text: '模型配置已保存' })
      await refreshProfiles()
      if (data.profiles) setEditProfiles(data.profiles.map(p => ({ ...p })))
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
          apiKey: profile.apiKey, baseUrl: profile.baseUrl, model: profile.model,
          profileId: profile.id, interfaceType: profile.interfaceType,
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
      interfaceType: 'anthropic',
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
      const emailKeys = groupedKeys.email.filter(key => editValues[key] !== undefined)
      if (emailKeys.length > 0) {
        const payload: Record<string, string> = {}
        for (const key of emailKeys) payload[key] = editValues[key] || ''
        const saveRes = await fetch(`${API_BASE}/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: payload }),
        })
        if (!saveRes.ok) { setEmailTestResult({ success: false, message: '保存配置失败，无法测试' }); setTestingEmail(false); return }
        await new Promise(resolve => setTimeout(resolve, 500))
      }
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
      if (data.success) setFeishuTestResult({ success: true, message: data.message || '飞书连接成功' })
      else setFeishuTestResult({ success: false, message: data.error || '连接失败' })
    } catch {
      setFeishuTestResult({ success: false, message: '无法连接 Agent Service' })
    } finally {
      setTestingFeishu(false)
    }
  }

  async function testQQConfig() {
    setTestingQQ(true)
    setQQTestResult(null)
    try {
      const res = await fetch(`${AGENT_API_BASE}/qq/test`, { method: 'POST' })
      const data = await res.json() as { success?: boolean; error?: string; message?: string }
      if (data.success) setQQTestResult({ success: true, message: data.message || 'QQ Bot 连接成功' })
      else setQQTestResult({ success: false, message: data.error || '连接失败' })
    } catch {
      setQQTestResult({ success: false, message: '无法连接 Agent Service' })
    } finally {
      setTestingQQ(false)
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
    const buckets: Record<ConfigGroupId, string[]> = { model: [], feishu: [], qq: [], email: [], system: [], advanced: [] }
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
    for (const group of ['model', 'feishu', 'qq', 'email', 'system'] as ConfigGroupId[]) {
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
    if (expected === 'true' || expected === 'false') return normalizeBool(actualRaw) === (expected === 'true')
    return actualRaw.toLowerCase() === expected
  }

  return {
    // State
    loading, saving, message, setMessage,
    editValues, template, groups, config,
    showValues, showAdvanced, setShowAdvanced,
    allKeys, groupedKeys, knownKeys, advancedKeys,
    storagePathUnchanged,

    // Profile
    profileName, setProfileName,

    // Storage
    appHome, configPath, profilePath, logsPath,
    logsFallbackActive, logsFallbackReason, migrationReportPath,
    storageHomeInput, setStorageHomeInput, switchingStorageHome,
    exportingLogs,

    // Model profiles
    editProfiles, profilesMessage, savingProfiles,
    showProfileKeys, setShowProfileKeys,
    testingProfileId, profileTestResults,

    // Integration test results
    testingEmail, emailTestResult,
    testingFeishu, feishuTestResult,
    testingQQ, qqTestResult,

    // Retry
    retryingApply,

    // Actions
    saveConfig, retryApplyConfig, exportLogs, switchStorageHome,
    saveModelProfiles, testProfileConnection, addProfile, removeProfile, moveProfile, updateProfile,
    testEmailConfig, testFeishuConfig, testQQConfig,
    handleChange, toggleShowValue, isFieldVisible,
  }
}

export type SettingsConfigReturn = ReturnType<typeof useSettingsConfig>
