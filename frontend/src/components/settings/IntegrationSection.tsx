import type { ConfigGroupId, ConfigTemplate, TemplateGroup } from './types'
import { SettingsCard } from './SettingsCard'
import { GuideBlock } from './GuideBlock'
import { renderFields } from './FieldRow'

export function IntegrationSection({
  groups,
  groupedKeys,
  template,
  editValues,
  showValues,
  toggleShowValue,
  handleChange,
  isFieldVisible,
  testingFeishu,
  feishuTestResult,
  testFeishuConfig,
  testingQQ,
  qqTestResult,
  testQQConfig,
  testingEmail,
  emailTestResult,
  testEmailConfig,
}: {
  groups: TemplateGroup[]
  groupedKeys: Record<ConfigGroupId, string[]>
  template: Record<string, ConfigTemplate>
  editValues: Record<string, string>
  showValues: Record<string, boolean>
  toggleShowValue: (key: string) => void
  handleChange: (key: string, value: string) => void
  isFieldVisible: (key: string) => boolean
  testingFeishu: boolean
  feishuTestResult: { success: boolean; message: string } | null
  testFeishuConfig: () => void
  testingQQ: boolean
  qqTestResult: { success: boolean; message: string } | null
  testQQConfig: () => void
  testingEmail: boolean
  emailTestResult: { success: boolean; message: string } | null
  testEmailConfig: () => void
}) {
  const fieldOpts = { template, editValues, showValues, onToggleShow: toggleShowValue, onChange: handleChange, isFieldVisible }

  return (
    <div className="space-y-6">
      <SettingsCard
        title={groups.find(g => g.id === 'feishu')?.title || '飞书 Bot'}
        description={groups.find(g => g.id === 'feishu')?.description || '飞书会话配置'}
        action={
          <button onClick={testFeishuConfig} disabled={testingFeishu} className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {testingFeishu ? '连接中...' : '测试飞书连接'}
          </button>
        }
      >
        {renderFields(groupedKeys.feishu, fieldOpts)}
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
        title={groups.find(g => g.id === 'qq')?.title || 'QQ Bot'}
        description={groups.find(g => g.id === 'qq')?.description || 'QQ Bot 配置'}
        action={
          <button onClick={testQQConfig} disabled={testingQQ} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {testingQQ ? '连接中...' : '测试 QQ 连接'}
          </button>
        }
      >
        {renderFields(groupedKeys.qq, fieldOpts)}
        <GuideBlock title="QQ Bot 配置提示（可折叠）" tone="blue">
          <p>基础配置：`QQ_ENABLED=true`、`QQ_APP_ID` 和 `QQ_APP_SECRET`（必填）。</p>
          <p>当填写 `QQ_APP_SECRET` 时，LaborAny 会按 QQ 官方文档自动换取访问令牌，无需再配置 Bot Token。</p>
          <p>`QQ_BOT_TOKEN` 已在 QQ 官方文档中标记为弃用，仅用于兼容旧版本配置，已移入「高级配置」。新接入请忽略。</p>
          <p>当前仅支持 C2C 私聊场景（用户与机器人一对一消息）。</p>
          <p>需要在 QQ 开放平台申请 `GROUP_AND_C2C_EVENT` 相关权限。</p>
          <p>沙箱模式：测试环境可设置 `QQ_SANDBOX=true`，正式环境设为 `false`。</p>
          <p>白名单：可通过 `QQ_ALLOW_USERS` 限制允许的用户 ID（逗号分隔），`QQ_REQUIRE_ALLOWLIST=true` 强制白名单模式。</p>
          <p>文件支持：C2C 私聊支持图片和文件上传（单文件上限 20MB），LaborAny 会自动在任务工作目录中挂载这些文件。</p>
        </GuideBlock>
        {qqTestResult && (
          <p className={`mt-3 text-xs ${qqTestResult.success ? 'text-green-700' : 'text-red-700'}`}>
            {qqTestResult.message}
          </p>
        )}
      </SettingsCard>

      <SettingsCard
        title={groups.find(g => g.id === 'email')?.title || '邮件通知'}
        description={groups.find(g => g.id === 'email')?.description || 'SMTP 邮件配置'}
        action={
          <button onClick={testEmailConfig} disabled={testingEmail} className="px-3 py-1.5 bg-sky-600 text-white rounded text-sm hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {testingEmail ? '发送中...' : '发送测试邮件'}
          </button>
        }
      >
        {renderFields(groupedKeys.email, fieldOpts)}
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
    </div>
  )
}
