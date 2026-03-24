import { useState, useEffect } from 'react'
import { SettingsSidebar } from '../components/settings/SettingsSidebar'
import { SettingsSaveBar } from '../components/settings/SettingsSaveBar'
import { useSettingsConfig } from '../components/settings/hooks/useSettingsConfig'
import { ProfileSection } from '../components/settings/ProfileSection'
import { ModelSection } from '../components/settings/ModelSection'
import { StorageSection } from '../components/settings/StorageSection'
import { IntegrationSection } from '../components/settings/IntegrationSection'
import { SystemSection } from '../components/settings/SystemSection'
import { ToolsSection } from '../components/settings/ToolsSection'
import type { SettingsSection } from '../components/settings/types'

const HASH_TO_SECTION: Record<string, SettingsSection> = {
  '#profile': 'profile',
  '#model': 'model',
  '#storage': 'storage',
  '#integration': 'integration',
  '#system': 'system',
  '#tools': 'tools',
}

function getSectionFromHash(): SettingsSection {
  return HASH_TO_SECTION[window.location.hash] || 'profile'
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>(getSectionFromHash)
  const s = useSettingsConfig()

  useEffect(() => {
    function onHashChange() {
      const section = getSectionFromHash()
      setActiveSection(section)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function handleSectionChange(section: SettingsSection) {
    setActiveSection(section)
    window.location.hash = `#${section}`
  }

  if (s.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  const showSaveBar = activeSection === 'profile' || activeSection === 'integration' || activeSection === 'system'

  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b border-border bg-card flex items-center px-6">
        <h1 className="text-lg font-semibold text-foreground">设置中心</h1>
      </header>

      <div className="flex">
        <SettingsSidebar active={activeSection} onChange={handleSectionChange} />

        <div className="flex-1 min-w-0 p-6 max-w-4xl space-y-6">
          {s.message && (
            <div className={`rounded-lg border p-4 ${
              s.message.type === 'success'
                ? 'bg-green-500/10 text-green-700 border-green-500/20'
                : s.message.type === 'warning'
                  ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                  : 'bg-red-500/10 text-red-700 border-red-500/20'
            }`}>
              <div className="space-y-2">
                <p>{s.message.text}</p>
                {s.message.type === 'warning' && (
                  <button
                    onClick={s.retryApplyConfig}
                    disabled={s.retryingApply}
                    className="px-3 py-1.5 bg-background border border-border rounded text-xs hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {s.retryingApply ? '重试中...' : '重试应用配置'}
                  </button>
                )}
              </div>
            </div>
          )}

          {activeSection === 'profile' && (
            <ProfileSection
              profileName={s.profileName}
              setProfileName={s.setProfileName}
            />
          )}

          {activeSection === 'model' && (
            <ModelSection
              groups={s.groups}
              editProfiles={s.editProfiles}
              activeProfileId={s.activeProfileId}
              profilesMessage={s.profilesMessage}
              savingProfiles={s.savingProfiles}
              promotingProfileId={s.promotingProfileId}
              showProfileKeys={s.showProfileKeys}
              setShowProfileKeys={s.setShowProfileKeys}
              testingProfileId={s.testingProfileId}
              profileTestResults={s.profileTestResults}
              addProfile={s.addProfile}
              removeProfile={s.removeProfile}
              moveProfile={s.moveProfile}
              updateProfile={s.updateProfile}
              setProfileAsCurrentDefault={s.setProfileAsCurrentDefault}
              testProfileConnection={s.testProfileConnection}
              saveModelProfiles={s.saveModelProfiles}
            />
          )}

          {activeSection === 'storage' && (
            <StorageSection
              appHome={s.appHome}
              configPath={s.configPath}
              profilePath={s.profilePath}
              logsPath={s.logsPath}
              logsFallbackActive={s.logsFallbackActive}
              logsFallbackReason={s.logsFallbackReason}
              migrationReportPath={s.migrationReportPath}
              storageHomeInput={s.storageHomeInput}
              setStorageHomeInput={s.setStorageHomeInput}
              switchingStorageHome={s.switchingStorageHome}
              storagePathUnchanged={s.storagePathUnchanged}
              exportingLogs={s.exportingLogs}
              exportLogs={s.exportLogs}
              switchStorageHome={s.switchStorageHome}
            />
          )}

          {activeSection === 'integration' && (
            <IntegrationSection
              groups={s.groups}
              groupedKeys={s.groupedKeys}
              template={s.template}
              editValues={s.editValues}
              showValues={s.showValues}
              toggleShowValue={s.toggleShowValue}
              handleChange={s.handleChange}
              isFieldVisible={s.isFieldVisible}
              loadingWechatStatus={s.loadingWechatStatus}
              wechatStatus={s.wechatStatus}
              testingWechat={s.testingWechat}
              wechatTestResult={s.wechatTestResult}
              startingWechatLogin={s.startingWechatLogin}
              cancellingWechatLogin={s.cancellingWechatLogin}
              loggingOutWechat={s.loggingOutWechat}
              wechatLoginDialogOpen={s.wechatLoginDialogOpen}
              wechatLoginState={s.wechatLoginState}
              testWechatConfig={s.testWechatConfig}
              startWechatLoginFlow={s.startWechatLoginFlow}
              cancelWechatLoginFlow={s.cancelWechatLoginFlow}
              closeWechatLoginDialog={s.closeWechatLoginDialog}
              logoutWechat={s.logoutWechat}
              testingFeishu={s.testingFeishu}
              feishuTestResult={s.feishuTestResult}
              testFeishuConfig={s.testFeishuConfig}
              testingQQ={s.testingQQ}
              qqTestResult={s.qqTestResult}
              testQQConfig={s.testQQConfig}
              testingEmail={s.testingEmail}
              emailTestResult={s.emailTestResult}
              testEmailConfig={s.testEmailConfig}
            />
          )}

          {activeSection === 'system' && (
            <SystemSection
              groups={s.groups}
              groupedKeys={s.groupedKeys}
              advancedKeys={s.advancedKeys}
              allKeys={s.allKeys}
              template={s.template}
              editValues={s.editValues}
              showValues={s.showValues}
              showAdvanced={s.showAdvanced}
              setShowAdvanced={s.setShowAdvanced}
              toggleShowValue={s.toggleShowValue}
              handleChange={s.handleChange}
              isFieldVisible={s.isFieldVisible}
              onAddConfigItem={key => s.handleChange(key, '')}
            />
          )}

          {activeSection === 'tools' && <ToolsSection />}

          {showSaveBar && (
            <SettingsSaveBar
              saving={s.saving}
              onSave={s.saveConfig}
              hint="带 * 的字段为必填项，保存后会自动尝试应用。"
            />
          )}
        </div>
      </div>
    </div>
  )
}
