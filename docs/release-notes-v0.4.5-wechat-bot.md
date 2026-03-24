# LaborAny v0.4.5 微信 Bot 发版说明

> 发布时间：2026-03-24
> 范围：微信 ClawBot / iLink 通道接入、远程 Bot 一致性补齐、构建脚本修正

---

## 1. 本次发布重点

LaborAny 已完成微信官方 ClawBot / iLink 通道接入，微信 Bot 的核心能力现已与 QQ Bot、飞书 Bot 对齐。

本次发布后，用户可以直接在微信私聊中：

- 发送文本触发 LaborAny 任务
- 使用 `converse` 智能路由自动匹配技能
- 进入 `execute` 执行链路并支持等待输入续跑
- 使用 `/help`、`/skills`、`/skill`、`/new`、`/stop`、`/home`、`/router`、`/model`、`/cron`
- 发送图片 / 文件作为输入
- 接收图片 / 文件产物回传
- 创建 cron / at / every 三类定时任务，并在微信私聊接收主动回推

---

## 2. 用户可见能力

### 2.1 微信接入方式

- 设置页新增微信 Bot 配置区
- 支持二维码扫码绑定微信账号
- 支持用环境变量手工覆盖 `WECHAT_BOT_TOKEN`
- 支持启停、重启、状态查看、连接测试

### 2.2 文本与会话能力

- 微信私聊文本消息可直接触发任务
- 支持 `waiting_input` 追问与续跑
- 支持 `/new` 重置会话
- 支持 `/stop` 停止当前执行
- 支持 `/home` 返回路由模式
- 支持模型切换与默认模型持久化

### 2.3 附件与产物能力

- 支持图片输入
- 支持文件输入
- 支持图片产物回传
- 支持文件产物回传
- `converse -> execute` 动作链已支持附件透传，基于上传文件继续执行时不会丢上下文

### 2.4 定时任务能力

- 支持 `/cron help`
- 支持 `/cron create`
- 支持 `/cron quick`
- 支持 `/cron once`
- 支持 `/cron every`
- 支持 `/cron list`
- 支持 `/cron delete`
- 定时任务执行完成后可主动推送回微信私聊

---

## 3. 真实微信 E2E 验证结果

2026-03-24 已完成一轮真实微信联调，以下链路已验证通过：

- 扫码绑定成功
- `/help` 成功回复
- 普通文本任务成功
- `waiting_input` 追问成功
- 续跑成功
- `/new` 成功
- `/stop` 成功
- `/cron once` 创建成功并主动回推结果
- 图片输入成功
- 图片文字回复成功
- 图片回传成功
- 文件输入成功
- 文件回传成功，已收到 `summary.md`

---

## 4. 本次关键修复

- 修复 `waiting_input` 状态被尾随 `completed` 覆盖的问题
- 修复输入附件 manifest 被任务文件下载路由拦截，导致错误回传用户原图的问题
- 修复 `converse` 动作切入 `execute` 时附件 ID 丢失的问题
- 为微信通道补齐 `send_file` 动作分支
- 对齐微信文件消息 payload：
  - `aes_key` 改为与社区实现一致的 hex-string-base64 编码
  - 移除不必要的 `md5` 字段
- 调整微信成功发送文件后的行为：
  - 全成功时只发文件，不再额外补发文本总结
  - 失败或缺失时才发送说明文本
- 修复根级 `npm run build` 在 macOS/arm64 上误走 `win-x64` 打包的问题，现已按当前平台自动选择 `pkg` 目标

---

## 5. 回归与构建结果

已通过：

- `npm run verify:task-file-manifest`
- `npm run verify:remote-bot-flow`
- `npm run verify:wechat-media`
- `npm run build`
- `npm --prefix src-api run build:mac-arm64`
- `npm --prefix agent-service run build:pkg:mac-arm64`
- `npm --prefix frontend run build`

当前平台已产出：

- `src-api/dist/laborany-api-mac`
- `agent-service/dist/laborany-agent-mac`
- `agent-service/dist/better_sqlite3.node`
- `frontend/dist/*`

---

## 6. 已知边界

本次版本仍保留以下边界：

- 仅覆盖微信私聊场景
- 群聊暂不支持
- 语音 / 视频未完成完整闭环
- 多微信账号同时在线的完整 UI 管理暂不支持

---

## 7. 相关文档

- [微信实施计划](./wechat-bot-spec.md)
- [README](../README.md)
