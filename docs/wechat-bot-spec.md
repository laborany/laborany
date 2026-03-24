# LaborAny 微信 Bot 集成实施计划（v0.4.x）

> 更新时间：2026-03-24
> 状态：阶段 A-F 已完成，真实微信 E2E 已通过
> 适用范围：LaborAny `agent-service` / `src-api` / `frontend`

---

## 1. 目标

在 LaborAny 内新增基于微信官方 ClawBot / iLink 协议的微信 Bot 通道，能力目标与现有 QQ Bot、飞书 Bot 保持一致：

- 微信私聊消息可直接触发 LaborAny 任务
- 复用现有 `converse` 智能路由与 `/api/skill/execute` 技能执行链路
- 支持多轮追问、等待输入续跑、会话重置、停止执行、模型切换、定时任务
- 支持输入附件与执行产物回传
- 与现有 session、history、memory、cron、notification 体系一致接入

v1 的额外强制要求：

- 必须支持扫码绑定微信，不要求用户手工复制 `BOT_TOKEN`

---

## 2. 范围定义

### 2.1 v1 必做范围

- 微信私聊场景
- 扫码登录获取 `bot_token`
- 长轮询接收消息
- 文本消息收发
- 图片 / 文件输入
- 图片 / 文件产物回传
- `/help`、`/skills`、`/skill`、`/new`、`/stop`、`/home`、`/router`、`/model`、`/cron`
- `converse` 两阶段路由
- `execute` 多轮等待输入续跑
- session / history / source 打标
- cron 创建、查询、删除、通知回推
- 设置页配置与状态管理
- 自动启停与 runtime 热应用
- 回归测试与文档

### 2.2 v1 明确不做

- 群聊
- 多微信账号同时在线的完整 UI 管理
- 语音 / 视频的完整闭环支持
- 复杂卡片 UI

### 2.3 v1 可接受的降级

- 如果 cron 通知时缺少可用 `context_token`，允许降级到 app 内通知，并在下次用户主动发微信消息后补发摘要
- 文本超长时按多条消息分段发送，不追求消息编辑或原地刷新

---

## 3. 协议调研结论

当前可确认的微信官方能力来自两个公开来源：

- 腾讯微信团队发布的 OpenClaw 官方插件 `@tencent-weixin/openclaw-weixin`
- 社区项目 `sitarua/wechat-agent-channel`

结论：

- 官方当前公开交付形态是 OpenClaw 插件，不是 LaborAny 可直接复用的 SDK
- 但官方插件 README 和源码已公开底层 HTTP JSON 协议，因此 LaborAny 可以独立实现通道适配层
- 社区项目本质上也是直接请求微信 iLink API，而不是依赖 OpenClaw Gateway

### 3.1 已确认接口

扫码登录：

- `GET /ilink/bot/get_bot_qrcode?bot_type=3`
- `GET /ilink/bot/get_qrcode_status?qrcode=...`

消息主链路：

- `POST /ilink/bot/getupdates`
- `POST /ilink/bot/sendmessage`

媒体与状态扩展：

- `POST /ilink/bot/getuploadurl`
- `POST /ilink/bot/getconfig`
- `POST /ilink/bot/sendtyping`

### 3.2 关键协议事实

- 认证头使用 `AuthorizationType: ilink_bot_token` 和 `Authorization: Bearer <token>`
- 请求通常还带 `X-WECHAT-UIN`，建议按官方插件保持
- 长轮询游标字段是 `get_updates_buf`
- 消息列表字段是 `msgs`，不是简化版 `updates`
- 文本正文位于 `item_list[].text_item.text`
- 回复必须携带原消息的 `context_token`
- 附件发送不是简单 form 上传，而是 `getuploadurl + CDN 上传 + sendmessage`

### 3.3 base URL 策略

公开实现里可见的默认值为：

- `https://ilinkai.weixin.qq.com`
- CDN 默认值：`https://novac2c.cdn.weixin.qq.com/c2c`

因此 LaborAny 不写死旧调研中的域名，统一做成配置项：

- `WECHAT_BASE_URL`
- `WECHAT_CDN_BASE_URL`

---

## 4. 与现有架构的集成方式

微信通道不改 Agent Core，沿用 QQ / 飞书现有模式：

```text
微信用户发消息
    ↓
agent-service: wechat/index.ts 长轮询
    ↓
wechat/handler.ts
    ├─ 去重
    ├─ allowlist 校验
    ├─ 串行队列
    ├─ 命令处理
    └─ 普通消息进入两阶段流程
    ↓
阶段一：POST /converse
    ↓
阶段二：POST /api/skill/execute
    ↓
session / history / memory / cron / notification 复用现有链路
    ↓
wechat/push.ts 回微信
```

复用基线：

- QQ handler 作为主实现基线
- `remote-session-state.ts` 复用
- `runtime/apply-config` 复用
- settings 模板机制复用
- `verify-remote-bot-flow.ts` 扩展

---

## 5. 模块结构

建议新增目录：

```text
agent-service/src/wechat/
├── api.ts                # iLink API 封装
├── config.ts             # 环境变量与凭据解析
├── handler.ts            # 消息处理主流程
├── index.ts              # 长轮询生命周期、状态管理、启停
├── media.ts              # 入站下载 / 出站上传 / 解密加密
├── push.ts               # 文本与文件回微信
├── qr-login.ts           # 扫码登录流程
└── streaming.ts          # 多条消息流式发送策略
```

管理路由：

```text
agent-service/src/routes/wechat.ts
```

前后端补点：

- `src-api/src/routes/config.ts`
- `frontend/src/components/settings/*`
- `frontend/src/hooks/useCron.ts`
- `frontend/src/pages/HistoryPage.tsx`
- `frontend/src/pages/CronPage.tsx`
- `frontend/src/types/message.ts`

---

## 6. 配置与凭据模型

### 6.1 环境变量

新增配置项：

| 环境变量 | 必填 | 默认值 | 说明 |
|----------|------|--------|------|
| `WECHAT_ENABLED` | 否 | `false` | 是否启用微信 Bot |
| `WECHAT_BOT_TOKEN` | 否 | 空 | 手工覆盖 token；优先级高于扫码保存的凭据 |
| `WECHAT_BASE_URL` | 否 | `https://ilinkai.weixin.qq.com` | 微信 iLink API 基础地址 |
| `WECHAT_CDN_BASE_URL` | 否 | `https://novac2c.cdn.weixin.qq.com/c2c` | 微信媒体 CDN 地址 |
| `WECHAT_ALLOW_USERS` | 否 | 空 | 允许访问的微信用户 ID，逗号分隔 |
| `WECHAT_REQUIRE_ALLOWLIST` | 否 | `false` | 为 `true` 时白名单不能为空 |
| `WECHAT_BOT_NAME` | 否 | `LaborAny` | 微信回包里显示的 Bot 名称 |
| `WECHAT_DEFAULT_SKILL` | 否 | `__generic__` | 默认技能 |
| `WECHAT_POLL_TIMEOUT_MS` | 否 | `35000` | 长轮询超时 |
| `WECHAT_TEXT_CHUNK_LIMIT` | 否 | `1000` | 单条文本分段上限，先保守实现 |

### 6.2 扫码凭据存储

v1 虽然只做单账号 UI，但底层存储按多账号兼容设计：

```text
data/wechat/
├── accounts/
│   └── <normalized-account-id>.json
├── active-account.json
├── sync-bufs/
│   └── <normalized-account-id>.json
├── user-states.json
└── context-tokens.json
```

账号文件内容建议：

```json
{
  "accountId": "xxxx-im-bot",
  "rawAccountId": "xxxx@im.bot",
  "userId": "xxxx@im.wechat",
  "token": "bot_token",
  "baseUrl": "https://ilinkai.weixin.qq.com",
  "cdnBaseUrl": "https://novac2c.cdn.weixin.qq.com/c2c",
  "savedAt": "2026-03-23T00:00:00.000Z"
}
```

### 6.3 token 解析优先级

1. `WECHAT_BOT_TOKEN`
2. `active-account.json` 指向的扫码凭据
3. 无可用凭据时视为未登录

---

## 7. 扫码登录设计

### 7.1 新增管理接口

| 路由 | 方法 | 说明 |
|------|------|------|
| `/wechat/status` | GET | 查询启用状态、运行状态、登录状态、当前账号 |
| `/wechat/start` | POST | 启动微信轮询 |
| `/wechat/stop` | POST | 停止微信轮询 |
| `/wechat/restart` | POST | 重启微信轮询 |
| `/wechat/test` | POST | 测试当前配置与登录状态 |
| `/wechat/login/start` | POST | 获取二维码并创建登录会话 |
| `/wechat/login/status` | GET | 轮询二维码状态 |
| `/wechat/login/cancel` | POST | 取消登录会话 |
| `/wechat/logout` | POST | 清除当前活动账号 |

### 7.2 登录流程

```text
前端点击“扫码绑定微信”
    ↓
POST /wechat/login/start
    ↓
qr-login.ts 调用 get_bot_qrcode
    ↓
返回 sessionKey + qrcode + qrcode_img_content
    ↓
前端展示二维码
    ↓
前端轮询 GET /wechat/login/status?sessionKey=...
    ↓
后台调用 get_qrcode_status
    ↓
状态 confirmed 时保存 accountId / userId / bot_token
    ↓
写入 active-account.json
    ↓
若 WECHAT_ENABLED=true，则自动启动或重启微信轮询
```

### 7.3 前端设置页要求

微信配置区要新增：

- 启用开关
- 当前登录状态
- 当前账号 ID
- “扫码绑定微信”按钮
- 二维码弹窗
- 登录状态轮询
- “退出当前微信”按钮
- “测试微信连接”按钮

v1 不要求多账号切换列表，但底层存储保留多账号兼容。

---

## 8. 会话与状态模型

### 8.1 用户状态

沿用 `remote-session-state.ts`，并在微信模块中持久化：

- `converseSessionId`
- `executeSessionId`
- `defaultModelProfileId`
- `activeMode`
- `activeSkillId`
- `activeSessionId`
- `executeAwaitingInput`
- `executeLastPrompt`
- `converseMessages`

### 8.2 状态 key

微信 state key 建议定义为：

```text
<accountId>@@<fromUserId>
```

理由：

- v1 单账号可直接使用
- v2 多账号不会打破会话隔离
- 可避免不同机器人账号之间上下文串线

### 8.3 context token 缓存

新增持久化缓存：

```json
{
  "<accountId>@@<wechatUserId>": {
    "contextToken": "xxx",
    "updatedAt": 1774100000000
  }
}
```

用途：

- 正常回复
- cron 通知回推
- 产物补发

策略：

- 收到每条入站消息时刷新
- 回复时优先取最新 token
- 超过一定时间可清理旧 token

---

## 9. 消息处理设计

### 9.1 v1 支持的消息类型

入站：

- 文本
- 图片
- 文件
- 引用消息中的文本 / 附件

暂缓：

- 语音
- 视频

### 9.2 命令系统

v1 微信命令与 QQ 对齐：

| 命令 | 功能 |
|------|------|
| `/help` | 查看帮助 |
| `/skills` | 列出技能 |
| `/skill <id> [query]` | 直接执行指定技能 |
| `/new` | 清空会话状态 |
| `/stop` | 中止当前执行 |
| `/home` | 回到路由模式 |
| `/router` | 回到路由模式 |
| `/model [name|id]` | 查看或切换默认模型 |
| `/cron ...` | 创建 / 查看 / 删除定时任务 |

### 9.3 流式输出策略

微信 v1 不做消息编辑，采用“多条文本分段”：

1. 启动时发送占位提示
2. 执行中累计内容
3. 达到分段阈值时发下一条
4. 完成后发总结或最终结果

### 9.4 去重与串行

与 QQ / 飞书一致：

- 消息 ID 去重 TTL：10 分钟
- 单用户串行队列，防并发执行互相覆盖

### 9.5 allowlist

如果：

- `WECHAT_REQUIRE_ALLOWLIST=true` 且 `WECHAT_ALLOW_USERS` 为空，拒绝启动
- 未命中 allowlist 的用户直接回固定提示并拒绝执行

---

## 10. 媒体与文件

### 10.1 入站媒体

v1 先支持：

- 图片
- 文件

处理链路：

```text
微信消息 item_list
    ↓
wechat/media.ts 判断 media 类型
    ↓
下载并解密到 uploads/
    ↓
生成 fileId
    ↓
将 [LABORANY_FILE_IDS: ...] 注入 query
    ↓
复用现有附件水合链路
```

### 10.2 出站产物

回微信时：

- 图片类产物走图片上传
- 其他产物走文件上传
- 单次最多发送 5 个
- 单文件先沿用 20MB 上限

### 10.3 协议实现点

媒体发送需要：

1. `getuploadurl`
2. 文件加密 / 生成 md5 / 计算 rawsize 与 filesize
3. 上传到 CDN
4. 再走 `sendmessage`

这部分单独放 `wechat/media.ts`，不与 handler 耦合。

---

## 11. cron 与通知改造

### 11.1 类型扩展

需要把以下类型补上微信：

- `sourceChannel: 'desktop' | 'feishu' | 'qq' | 'wechat'`
- `notifyChannel: 'app' | 'feishu_dm' | 'qq_dm' | 'wechat_dm'`

### 11.2 数据库迁移

`cron_jobs` 需要新增：

- `source_wechat_user_id TEXT`
- `notify_wechat_user_id TEXT`

并新增索引：

- `idx_jobs_source_wechat_user_id`

### 11.3 逻辑改造点

需修改：

- `agent-service/src/cron/types.ts`
- `agent-service/src/routes/cron.ts`
- `agent-service/src/cron/store.ts`
- `agent-service/src/cron/notifier.ts`
- `frontend/src/hooks/useCron.ts`
- `frontend/src/pages/CronPage.tsx`

### 11.4 微信通知策略

通知发送优先级：

1. `wechat_dm` 且存在可用 `context_token` → 微信回推
2. `wechat_dm` 但没有 token → app 内通知，并标记待补发
3. 默认 app 内通知

---

## 12. history / source / UI 影响面

以下模块要补 `wechat` 来源：

- `src-api/src/routes/session.ts`
- `src-api/src/routes/skill.ts`
- `src-api/src/core/agent/runtime-manager.ts`
- `frontend/src/types/message.ts`
- `frontend/src/pages/HistoryPage.tsx`
- `frontend/src/pages/HomePage.tsx`
- `frontend/src/components/notification/RunningTasksIndicator.tsx`

目标：

- history 页可显示“微信”
- session 来源推断支持 `wechat-` / `wechat-conv-`
- 运行中任务标识支持微信

---

## 13. 分阶段实施顺序

### 阶段 A：协议层与扫码登录

目标：

- 实现 `qr-login.ts`
- 实现账号与游标存储
- 提供 `/wechat/login/*` 管理接口
- 设置页可以扫码绑定并看到登录成功

验收：

- 在设置页点击“扫码绑定微信”后能展示二维码
- 微信扫码确认后，LaborAny 能保存账号与 token

### 阶段 B：文本主链路

目标：

- 实现 `getupdates` 长轮询
- 文本命令与普通消息处理
- `converse` / `execute` / `waiting_input` 完整跑通

验收：

- 微信私聊发文本，LaborAny 能处理并回微信
- `/skill` 与等待输入续跑可用

### 阶段 C：设置页与运行态接线

目标：

- runtime 自动重载微信配置
- `/wechat/status/start/stop/restart/test`
- 设置页新增微信分组和测试按钮

验收：

- 保存配置后微信 Bot 自动启动 / 停止
- 设置页能看到状态和测试结果

### 阶段 D：source / history / cron

目标：

- 补全类型枚举
- 补全 history 来源
- 改造 cron source / notify / store / notifier / frontend

验收：

- 微信里创建的任务在 cron 页面显示为“微信”
- 微信来源的 session 在 history 中正确显示

### 阶段 E：媒体与产物回传

目标：

- 实现图片 / 文件入站
- 实现图片 / 文件产物回微信

验收：

- 微信发图 / 发文件，技能可读取
- 技能产物可以回微信

### 阶段 F：测试与文档

目标：

- 扩展 `verify-remote-bot-flow.ts`
- 增加微信 mock 与媒体回归脚本
- README、`.env.example`、集成说明补齐

验收：

- 本地回归脚本可覆盖微信主链路
- 微信媒体下载 / 解密 / 回传可独立验证
- README、`.env.example`、微信实施文档同步完成

---

## 14. 测试计划

### 14.1 单元 / 集成测试

- `wechat/api.ts`：
  - `getupdates` 正常 / 超时 / 错误返回
  - `sendmessage` 认证头与错误处理
- `wechat/qr-login.ts`：
  - 开始登录
  - 轮询 wait / scanned / confirmed / expired
  - 成功写入凭据
- `wechat/handler.ts`：
  - 命令分支
  - converse 分支
  - execute 等待输入续跑
  - allowlist
  - 去重

### 14.2 回归脚本

扩展 `scripts/verify-remote-bot-flow.ts`：

- 首轮 `/skill wechat-writer ...`
- 第二轮回复 `方向4`
- `/cron help`
- `/home`
- 新任务重新路由
- 断言 `source === 'wechat'`
- 断言 sessionId 续用正确
- 断言 `converse` 能力声明包含 `canSendFile / canSendImage`

新增 `scripts/verify-wechat-media.ts`：

- 验证微信图片 / 文件入站下载与 AES-128-ECB 解密
- 验证上传 `getuploadurl -> CDN upload -> sendmessage`
- 验证执行产物回传摘要

### 14.3 手工验收

必须走一轮真实微信验证：

1. 设置页扫码绑定
2. 发送普通文本
3. 直接执行技能
4. 多轮追问
5. 停止执行
6. 创建 cron
7. 输入图片 / 文件
8. 回传图片 / 文件

### 14.4 2026-03-24 真实微信 E2E 结果

基于本地隔离环境完成了一轮真实微信侧验收，结果如下：

- 扫码绑定成功，账号状态可在设置页显示
- `/help` 命令成功回复
- 普通文本任务成功路由并返回结果
- `waiting_input` 追问、续跑、`/new`、`/stop` 全部通过
- `/cron once` 创建成功，执行完成后可主动回推到微信私聊
- 图片输入可被读取并生成文字回复，且不再回传灰色空白图
- 文件输入可被读取并生成回复
- 文件回传最终已验证通过，微信侧成功收到 `summary.md`

真实联调过程中修复了以下关键问题：

- `waiting_input` 状态会被尾随的 `completed` 覆盖，导致远程 Bot 无法正确停留在等待输入态
- 输入附件 manifest 被任务文件下载路由误判为隐藏文件，导致产物过滤失效并错误回传用户原图
- `converse -> execute` 动作链未透传 `attachmentIds`，导致基于附件继续执行时上下文丢失
- 微信 `send_file` 动作未接入 `dispatchAction`
- 微信文件消息 `aes_key` 编码方式与社区实现不一致，导致文件消息发送成功但客户端不展示

当前真实微信侧结论：

- 文本主链路：通过
- 图片输入 / 图片回传：通过
- 文件输入 / 文件回传：通过
- cron 主动通知：通过
- 微信通道具备与 QQ / 飞书同级别的核心能力闭环

---

## 15. 风险与应对

### 风险 1：灰度期协议变动

应对：

- API 基础地址可配置
- 文本上限可配置
- 关键字段做严格日志记录

### 风险 2：`context_token` 影响主动发送

应对：

- 持久化 token 缓存
- 缺 token 时降级通知
- 后续支持“下次对话补发摘要”

### 风险 3：媒体协议复杂

应对：

- 媒体模块独立实现
- v1 先支持图片 / 文件
- 语音 / 视频延后

### 风险 4：多账号未来扩展

应对：

- v1 UI 单账号
- 存储模型按多账号兼容设计

---

## 16. 实施原则

- 不接 OpenClaw Gateway
- 不直接 vendor 社区桥接器代码
- 微信通道按 LaborAny 原生方式实现
- 先按 QQ handler 落地，不先抽大而全 remote bot 框架
- 只有在微信、QQ、飞书三边都稳定后，再抽公共层

---

## 17. 当前执行顺序

按以下顺序推进：

1. 落本文档
2. 实现扫码登录与凭据存储
3. 实现微信文本主链路
4. 接设置页和 runtime
5. 接 history / source / cron
6. 接媒体与产物回传
7. 补测试与文档

本文件是微信集成的主执行计划，后续所有实现以此为准更新。
