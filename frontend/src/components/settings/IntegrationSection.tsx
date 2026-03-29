import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import type {
  ConfigGroupId,
  ConfigTemplate,
  TemplateGroup,
  WechatLoginResponse,
  WechatStatusResponse,
} from './types'
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
  loadingWechatStatus,
  wechatStatus,
  testingWechat,
  wechatTestResult,
  startingWechatLogin,
  cancellingWechatLogin,
  loggingOutWechat,
  wechatLoginDialogOpen,
  wechatLoginState,
  testWechatConfig,
  startWechatLoginFlow,
  cancelWechatLoginFlow,
  closeWechatLoginDialog,
  logoutWechat,
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
  loadingWechatStatus: boolean
  wechatStatus: WechatStatusResponse | null
  testingWechat: boolean
  wechatTestResult: { success: boolean; message: string } | null
  startingWechatLogin: boolean
  cancellingWechatLogin: boolean
  loggingOutWechat: boolean
  wechatLoginDialogOpen: boolean
  wechatLoginState: WechatLoginResponse | null
  testWechatConfig: () => void
  startWechatLoginFlow: () => void
  cancelWechatLoginFlow: () => void
  closeWechatLoginDialog: () => void
  logoutWechat: () => void
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
  const loginStatus = loadingWechatStatus
    ? '加载状态中...'
    : !wechatStatus
      ? '未连接到 Agent Service'
      : !wechatStatus.enabled
        ? '未启用'
        : wechatStatus.loginPending
          ? '扫码进行中'
          : wechatStatus.loggedIn
            ? '已登录'
            : '未登录'
  const credentialSourceText = !wechatStatus?.credentialSource
    ? '暂无'
    : wechatStatus.credentialSource === 'env'
      ? '环境变量 WECHAT_BOT_TOKEN'
      : '扫码保存的账号凭据'
  const savedAccount = wechatStatus?.account
  const canLogoutWechat = Boolean(wechatStatus?.loggedIn && wechatStatus?.credentialSource === 'file')
  const wechatLoginTerminal = ['confirmed', 'cancelled', 'failed'].includes(wechatLoginState?.status || '')

  return (
    <>
      <div className="space-y-6">
        <SettingsCard
          title={groups.find(g => g.id === 'wechat')?.title || '微信 Bot'}
          description={groups.find(g => g.id === 'wechat')?.description || '微信 ClawBot 配置'}
          action={
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={testWechatConfig} disabled={testingWechat} className="px-3 py-1.5 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {testingWechat ? '检测中...' : '测试微信连接'}
              </button>
              <button onClick={startWechatLoginFlow} disabled={startingWechatLogin} className="px-3 py-1.5 bg-[#07c160] text-white rounded text-sm hover:bg-[#06ad57] disabled:opacity-50 disabled:cursor-not-allowed">
                {startingWechatLogin ? '准备中...' : (wechatStatus?.loginPending ? '继续扫码' : '扫码绑定')}
              </button>
              <button onClick={logoutWechat} disabled={!canLogoutWechat || loggingOutWechat} className="px-3 py-1.5 bg-background border border-border rounded text-sm hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed">
                {loggingOutWechat ? '退出中...' : '退出当前账号'}
              </button>
            </div>
          }
        >
          <div className="grid gap-3 rounded-lg border border-border bg-background/70 p-4 text-sm md:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">当前状态</p>
              <p className="mt-1 font-medium text-foreground">{loginStatus}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">当前生效凭据</p>
              <p className="mt-1 font-medium text-foreground">{credentialSourceText}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">已保存账号</p>
              <p className="mt-1 font-medium text-foreground">{savedAccount?.rawAccountId || '暂无'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">已缓存账号数</p>
              <p className="mt-1 font-medium text-foreground">{wechatStatus?.config?.storedAccountsCount ?? 0}</p>
            </div>
          </div>

          {savedAccount && (
            <div className="rounded-lg border border-border/80 bg-muted/20 p-4 text-sm text-muted-foreground space-y-1">
              <p>账号 ID：<span className="text-foreground">{savedAccount.rawAccountId}</span></p>
              <p>用户 ID：<span className="text-foreground">{savedAccount.userId || '未返回'}</span></p>
              <p>绑定时间：<span className="text-foreground">{new Date(savedAccount.savedAt).toLocaleString()}</span></p>
            </div>
          )}

          {renderFields(groupedKeys.wechat, fieldOpts)}
          <GuideBlock title="微信接入提示（可折叠）" tone="blue">
            <p>推荐流程：先保存 `WECHAT_ENABLED`、`WECHAT_BASE_URL` 等配置，再点击「扫码绑定」完成微信授权。</p>
            <p>扫码成功后，`bot_token` 会自动保存在 LaborAny 的本地数据目录，无需手工复制。</p>
            <p>如果同时填写了 `WECHAT_BOT_TOKEN`，运行时会优先使用该环境变量，扫码账号会保留为本地备份。</p>
            <p>当前已支持微信私聊扫码绑定、文本消息、图片/文件输入、执行产物回传和基础 `/cron` 管理。</p>
          </GuideBlock>
          {wechatTestResult && (
            <p className={`mt-3 text-xs ${wechatTestResult.success ? 'text-green-700' : 'text-red-700'}`}>
              {wechatTestResult.message}
            </p>
          )}
        </SettingsCard>

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

      <Dialog open={wechatLoginDialogOpen} onClose={closeWechatLoginDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>微信扫码绑定</DialogTitle>
            <DialogDescription>
              使用已开通 ClawBot 的微信扫码，绑定成功后凭据会保存到本地账号目录。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {wechatLoginState?.qrcodeDataUrl ? (
              <div className="mx-auto flex w-fit flex-col items-center gap-3 rounded-xl border border-border bg-white p-4">
                <img src={wechatLoginState.qrcodeDataUrl} alt="微信扫码二维码" className="h-72 w-72 rounded-lg object-contain" />
                <p className="text-xs text-muted-foreground">二维码失效后会自动刷新，微信侧确认后此弹窗会自动更新状态。</p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                当前没有可展示的二维码。
              </div>
            )}

            <div className={`rounded-lg border p-3 text-sm ${
              wechatLoginState?.success
                ? 'border-green-200 bg-green-50/70 text-green-800'
                : 'border-red-200 bg-red-50/70 text-red-800'
            }`}>
              {wechatLoginState?.message || '正在准备扫码会话...'}
            </div>

            {wechatLoginState?.account && (
              <div className="rounded-lg border border-border bg-background/70 p-4 text-sm text-muted-foreground space-y-1">
                <p>账号 ID：<span className="text-foreground">{wechatLoginState.account.rawAccountId}</span></p>
                <p>用户 ID：<span className="text-foreground">{wechatLoginState.account.userId || '未返回'}</span></p>
              </div>
            )}
          </div>

          <DialogFooter>
            {!wechatLoginTerminal && (
              <button
                onClick={cancelWechatLoginFlow}
                disabled={cancellingWechatLogin}
                className="px-3 py-2 rounded border border-border bg-background text-sm hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancellingWechatLogin ? '取消中...' : '取消本次扫码'}
              </button>
            )}
            <button
              onClick={closeWechatLoginDialog}
              className="px-3 py-2 rounded bg-primary text-primary-foreground text-sm hover:bg-primary/90"
            >
              {wechatLoginTerminal ? '关闭' : '稍后再看'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
